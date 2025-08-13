import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

/** ---------- helpers ---------- */
function normalizeUrl(input: string): string {
  const s = String(input || "").trim();
  if (!s) throw new Error("Missing URL");
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1]?.trim();
}
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
function detectSections(text: string) {
  const t = text.toLowerCase();
  const has = (kws: string[]) => kws.some((k) => t.includes(k));
  return {
    hero:
      has(["get started", "try free", "start now", "learn more", "sign up"]) ||
      t.split(" ").length > 30,
    value_prop: has([
      "benefit",
      "why",
      "you get",
      "we help",
      "our solution",
      "features",
    ]),
    social_proof: has([
      "testimonial",
      "what our customers",
      "as seen in",
      "reviews",
      "trusted by",
    ]),
    pricing: has(["pricing", "price", "plans"]),
    features: has(["feature", "capabilities", "what you get"]),
    faq: has(["faq", "frequently asked", "questions"]),
    contact: has(["contact", "email us", "get in touch", "support"]),
    footer: has(["privacy", "terms", "©"]),
  };
}
function buildScreenshotUrl(url: string): string | null {
  const tmpl = process.env.SCREENSHOT_URL_TMPL; // e.g. https://image.thum.io/get/width/1200/{URL}
  return tmpl ? tmpl.replace("{URL}", encodeURIComponent(url)) : null;
}

const jsonSchema = {
  name: "cro_full_report",
  schema: {
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
      quick_wins: { type: "array", items: { type: "string" }, maxItems: 6 },
      findings: {
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
        maxItems: 20,
      },
      prioritized_backlog: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            impact: { type: "integer", minimum: 1, maximum: 3 },
            effort: { type: "integer", minimum: 1, maximum: 3 },
            eta_days: { type: "integer" },
            notes: { type: "string" },
          },
          required: ["title", "impact", "effort"],
        },
        maxItems: 12,
      },
      content_audit: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section: { type: "string" },
            status: { type: "string", enum: ["ok", "weak", "missing"] },
            rationale: { type: "string" },
            suggestions: {
              type: "array",
              items: { type: "string" },
              maxItems: 5,
            },
          },
          required: ["section", "status"],
        },
        maxItems: 12,
      },
    },
    required: ["score", "summary", "key_findings", "quick_wins", "findings"],
    additionalProperties: false,
  },
  strict: true,
} as const;

/** ---------- main handler ---------- */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { url: rawUrl, mode = "free" } = body as {
      url?: string;
      mode?: "free" | "full";
    };

    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY is not set on the server" });
    }
    if (!rawUrl || typeof rawUrl !== "string") {
      return res.status(400).json({ error: "Missing 'url' (string)" });
    }

    const url = normalizeUrl(rawUrl);

    // Fetch page HTML with clear error messaging
    let html: string;
    try {
      const pageResp = await fetch(url, {
        headers: { "User-Agent": "HolboxAI/1.0 (+https://holbox.ai)" },
        redirect: "follow",
      });
      if (!pageResp.ok) {
        return res
          .status(400)
          .json({
            error: `Fetch failed: ${pageResp.status} ${pageResp.statusText}`,
          });
      }
      html = await pageResp.text();
    } catch (e: any) {
      console.error("FETCH_ERR", e);
      return res
        .status(400)
        .json({ error: `Failed to fetch URL: ${e?.message || e}` });
    }

    const title = extractTitle(html);
    const text = extractText(html);
    const sections = detectSections(text);
    const screenshotUrl = buildScreenshotUrl(url);
    const suggestedUrl = screenshotUrl; // dev: reuse

    const system =
      "You are a CRO expert. Analyze landing page copy and structure. Return STRICT JSON matching the provided schema.";

    const userContent =
      mode === "free"
        ? `Mode: FREE
Return a lean report (score, summary, 3-6 quick_wins, 3-8 findings, minimal content_audit).
URL: ${url}
TITLE: ${title || "(none)"}
TEXT (truncated):
${text}`
        : `Mode: FULL
Return a full report including content_audit (hero/value_prop/social_proof/pricing/features/faq/contact/footer), prioritized_backlog and detailed findings.
URL: ${url}
TITLE: ${title || "(none)"}
TEXT (truncated):
${text}`;

    // OpenAI call with robust parsing + explicit JSON schema
    let data: any = null;
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const resp = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: userContent },
          {
            role: "user",
            content: "Return JSON only that matches the schema.",
          },
        ],
        text: {
          format: {
            type: "json_schema",
            json_schema: jsonSchema,
          },
        },
        max_output_tokens: 1400,
      });

      // Extract text robustly across SDK variants
      // @ts-ignore
      const raw =
        resp.output_text ??
        // @ts-ignore
        resp.output?.[0]?.content?.[0]?.text ??
        (typeof (resp as any).content === "string"
          ? (resp as any).content
          : null);

      if (!raw || typeof raw !== "string") {
        throw new Error("OpenAI returned no text content");
      }

      try {
        data = JSON.parse(raw);
      } catch {
        // Sometimes the model may wrap code fences or include stray chars
        const cleaned = raw.replace(/^[\s`]*\{/, "{").replace(/\}[\s`]*$/, "}");
        data = JSON.parse(cleaned);
      }
    } catch (e: any) {
      console.error("OPENAI_ERR", e);
      const status = e?.status || e?.code === "insufficient_quota" ? 429 : 502;
      return res.status(status).json({
        error: e?.message || e?.error?.message || "OpenAI request failed",
      });
    }

    const payload = {
      ...data,
      sections_detected: sections,
      page: { url, title },
      assets: {
        screenshot_url: screenshotUrl,
        suggested_screenshot_url: suggestedUrl,
      },
    };
    return res.status(200).json(payload);
  } catch (err: any) {
    console.error("UNCAUGHT_ERR", err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
