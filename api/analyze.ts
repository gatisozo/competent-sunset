import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

/** ===================== Config ===================== **/
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // lēts dev noklusējums

/** =================== Utilities ==================== **/
function extractText(html: string, maxChars = 20000) {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = noScript
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxChars);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        await sleep(500 * Math.pow(2, i)); // 500ms → 2s → 4s
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// `http(s)://` pievienošana + stingra validācija ar URL()
function normalizeAndValidateUrl(u: string): URL {
  const raw = (u || "").trim();
  if (!raw) throw new Error("Missing 'url'");
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withProto);
  } catch {
    throw new Error("Invalid URL");
  }
  // aizliedzam localhost/privātos IP
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost"))
    throw new Error("URL not allowed (localhost)");
  if (/^127\./.test(host)) throw new Error("URL not allowed (127.x.x.x)");
  // IPv4 privātie diapazoni
  const ipMatch = host.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  if (ipMatch) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10) throw new Error("URL not allowed (private 10/8)");
    if (a === 172 && b >= 16 && b <= 31)
      throw new Error("URL not allowed (private 172.16/12)");
    if (a === 192 && b === 168)
      throw new Error("URL not allowed (private 192.168/16)");
  }
  return parsed;
}

// mēģinām tieši; ja nē — izmantojam r.jina.ai reader fallback
async function fetchPage(parsed: URL) {
  const ua = { "User-Agent": "Mozilla/5.0 (compatible; HolboxAI/1.0)" };

  // 1) tiešais mēģinājums
  let resp = await fetch(parsed.toString(), {
    headers: ua,
    redirect: "follow",
  });
  if (resp.ok) return await resp.text();

  // 2) fallback ‘reader’: r.jina.ai/http/{host}{pathname}{search}
  const readerUrl = `https://r.jina.ai/http/${parsed.host}${
    parsed.pathname || ""
  }${parsed.search || ""}`;
  resp = await fetch(readerUrl, { headers: ua });
  if (resp.ok) return await resp.text();

  throw new Error(`Fetch failed: ${resp.status}`);
}

/** ===================== Handler ===================== **/
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Diagnoze: /api/analyze?diag=1
  if (
    req.method === "GET" &&
    (req.query.diag === "1" || req.query.diag === "true")
  ) {
    return res.status(200).json({
      ok: true,
      hasKey: Boolean(process.env.OPENAI_API_KEY),
      model: MODEL,
      demo: process.env.ANALYZE_DEMO === "1",
      node: process.version,
      region: process.env.VERCEL_REGION || "unknown",
    });
  }

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    // Demo režīms – ļauj testēt bez OpenAI
    if (process.env.ANALYZE_DEMO === "1") {
      const { url } = (req.body || {}) as { url?: string };
      const safe = url ? normalizeAndValidateUrl(url).toString() : "";
      return res.status(200).json({
        url: safe,
        score: 71,
        summary: "Demo preview (AI call skipped).",
        key_findings: [
          {
            title: "CTA below the fold",
            impact: "high",
            recommendation:
              "Move primary CTA above the fold on mobile and desktop.",
          },
          {
            title: "Low contrast on primary button",
            impact: "medium",
            recommendation: "Increase color contrast to WCAG 4.5:1.",
          },
        ],
        quick_wins: [
          "Clarify hero value prop",
          "Speed up LCP",
          "Add trust badges",
        ],
      });
    }

    const body = (req.body || {}) as { url?: string };
    if (!body.url || typeof body.url !== "string")
      return res.status(400).json({ error: "Missing 'url'" });

    let parsed: URL;
    try {
      parsed = normalizeAndValidateUrl(body.url);
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || "Invalid URL" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(429)
        .json({ error: "OpenAI key missing or quota exhausted" });
    }

    // 1) Iegūstam HTML (ar fallback)
    const html = await fetchPage(parsed);
    const content = extractText(html);

    // 2) Shēma (dokumentēšanai promptā)
    const schemaShape = {
      type: "object",
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        summary: { type: "string" },
        key_findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              impact: { type: "string", enum: ["high", "medium", "low"] },
              recommendation: { type: "string" },
            },
            required: ["title", "impact", "recommendation"],
          },
          maxItems: 8,
        },
        quick_wins: { type: "array", items: { type: "string" }, maxItems: 5 },
        risks: { type: "array", items: { type: "string" }, maxItems: 5 },
      },
      required: ["score", "summary", "key_findings", "quick_wins"],
      additionalProperties: false,
    };

    // 3) OpenAI zvans ar retry/backoff un JSON-only atbildi
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await withRetry(() =>
      openai.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a senior CRO expert. Return ONLY JSON that matches the schema. Be concise and actionable.",
          },
          {
            role: "user",
            content:
              `URL: ${parsed.toString()}\n\nTEXT (truncated):\n${content}\n\nSchema (shape):\n` +
              `${JSON.stringify(
                schemaShape
              )}\n\nRules:\n- Score integer 0..100\n- key_findings max 8\n- quick_wins 3–5\n- Output JSON only`,
          },
        ],
      })
    );

    const text = completion.choices?.[0]?.message?.content || "{}";
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return res
        .status(500)
        .json({
          error: "Model returned non-JSON output",
          raw: text.substring(0, 4000),
        });
    }

    return res.status(200).json({ url: parsed.toString(), ...data });
  } catch (err: any) {
    const status =
      err?.status ||
      (err?.code === "insufficient_quota" ? 429 : undefined) ||
      (typeof err?.message === "string" &&
      err.message.startsWith("Fetch failed:")
        ? 400
        : 500);

    const msg =
      err?.error?.message ||
      err?.message ||
      (status === 429 ? "OpenAI quota exceeded" : "Internal error");

    console.error("ANALYZE_ERROR:", status, msg);
    return res.status(status).json({ error: msg });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
