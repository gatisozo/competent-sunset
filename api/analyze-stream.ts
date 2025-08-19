import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

/* ---------- small helpers ---------- */
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
      "reviews",
      "cases",
      "trusted by",
      "logos",
      "clients",
    ]),
    pricing: has(["pricing", "price", "plan", "plans"]),
    faq: has(["faq", "frequently asked"]),
    contact: has(["contact", "email", "phone"]),
    footer: has(["©", "copyright", "privacy", "terms"]),
  };
}
function buildScreenshotUrls(url: string): {
  primary: string | null;
  backup: string | null;
} {
  const enc = encodeURIComponent(url);
  const p = process.env.SCREENSHOT_URL_TMPL || "";
  const b = process.env.SCREENSHOT_URL_TMPL_BACKUP || "";
  return {
    primary: p ? p.replace("{URL}", enc) : null,
    backup: b ? b.replace("{URL}", enc) : null,
  };
}

/* ---------- strict JSON schema ---------- */
const croSchema = {
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
        additionalProperties: false,
      },
      maxItems: 10,
    },
    quick_wins: { type: "array", items: { type: "string" }, maxItems: 7 },
    prioritized_backlog: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          impact: { type: "string", enum: ["high", "medium", "low"] },
          effort: { type: "string" },
          eta_days: { type: "integer", minimum: 0, maximum: 60 },
        },
        required: ["title", "impact"],
        additionalProperties: false,
      },
      maxItems: 10,
    },
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
        additionalProperties: false,
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
        required: ["section", "status", "rationale", "suggestions"],
        additionalProperties: false,
      },
      maxItems: 12,
    },
  },
  required: [
    "score",
    "summary",
    "key_findings",
    "quick_wins",
    "findings",
    "prioritized_backlog",
    "content_audit",
  ],
  additionalProperties: false,
} as const;

/* ---------- SSE wiring ---------- */
function sseHeaders(res: VercelResponse) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
}
function sendEvent(res: VercelResponse, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = normalizeUrl(String(req.query.url || req.body?.url || ""));
    const mode = String(req.query.mode || req.body?.mode || "full"); // "free" | "full"
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    sseHeaders(res);

    const send = (event: string, data: any) => sendEvent(res, event, data);

    let progress = 0;
    const tick = setInterval(() => {
      progress = Math.min(95, progress + 1);
      send("progress", { value: progress });
    }, 800);

    const heartbeat = setInterval(() => {
      send("ping", { t: Date.now() });
    }, 15000);

    // 1) fetch page
    send("progress", { value: (progress = Math.max(progress, 5)) });
    const page = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "HolboxAI/1.0 (+https://holbox.ai)" },
    });
    if (!page.ok) throw new Error(`Fetch failed: ${page.status}`);
    const html = await page.text();
    const title = extractTitle(html);
    const text = extractText(html);
    const sections = detectSections(text);

    const shots = buildScreenshotUrls(url);
    send("progress", { value: (progress = Math.max(progress, 20)) });

    // 2) build prompt
    const system =
      "You are a CRO expert. Analyze landing pages for conversion best practices (above-the-fold clarity, message match, CTA prominence, trust, friction, mobile heuristics, Core Web Vitals hints). Output STRICT JSON that adheres to the schema.";

    const userContent =
      mode === "free"
        ? `Mode: FREE
Return a concise subset: score, summary, key_findings (max 3), quick_wins (max 3), and content_audit (hero/value_prop/social_proof/pricing/faq/contact/footer) with status+suggestions. Keep JSON valid.
URL: ${url}
TITLE: ${title || "(none)"}
TEXT (truncated):
${text}`
        : `Mode: FULL
Return a full report including content_audit (hero/value_prop/social_proof/pricing/faq/contact/footer), findings, quick_wins, prioritized_backlog. All required fields in the schema must be present.
URL: ${url}
TITLE: ${title || "(none)"}
TEXT (truncated):
${text}`;

    send("progress", { value: (progress = Math.max(progress, 30)) });

    const resp = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: userContent },
        {
          role: "user",
          content: "Return JSON only that matches the schema exactly.",
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "cro_full_report",
          schema: croSchema,
          strict: true,
        },
      },
      max_output_tokens: 1400,
    });

    // 3) parse
    const outputText: string =
      // @ts-ignore SDK variants
      (resp as any).output_text ||
      JSON.stringify((resp as any).output?.[0]?.content?.[0]?.text || resp);

    let data: any = {};
    try {
      data = JSON.parse(outputText);
    } catch {
      throw new Error("Model returned non-JSON output");
    }

    // 4) attach screenshots etc.
    const result = {
      url,
      title: title || undefined,
      ...data,
      screenshots: {
        hero: shots.primary || shots.backup || null,
      },
      meta: {
        sections_detected: sections,
      },
    };

    send("result", result);
    send("progress", { value: 100 });
    res.end();
  } catch (e: any) {
    sendEvent(res, "error", { message: e?.message || "stream failed" });
    res.end();
  } finally {
    clearInterval(tick as any);
    clearInterval(heartbeat as any);
  }
}

export const config = { api: { bodyParser: false } };
