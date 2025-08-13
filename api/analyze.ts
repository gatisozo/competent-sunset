import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

/** ---------- helpers ---------- */
function json(res: VercelResponse, code: number, data: any) {
  res.status(code).setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(data));
}

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
  return `${
    process.env.VERCEL_URL?.startsWith("http")
      ? process.env.VERCEL_URL
      : "https://" + process.env.VERCEL_URL
  }/api/screenshot?url=${encodeURIComponent(url)}`;
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/** ---------- Tight JSON Schema (all objects lock extra props; ALL top-level keys required) ---------- */
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
        additionalProperties: false,
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
        // Responses API validator requires required[] to include EVERY defined property
        required: ["title", "impact", "effort", "eta_days", "notes"],
        additionalProperties: false,
      },
      maxItems: 12,
    },

    content_audit: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section: { type: "string" }, // hero, value_prop, social_proof, pricing, features, faq, contact, footer
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
  // IMPORTANT: make ALL top-level properties required per Responses API validation
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

/** ---------- main handler ---------- */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const debug =
    (typeof req.query?.debug === "string" && req.query.debug === "1") ||
    (typeof (req.body as any)?.debug === "number" &&
      (req.body as any).debug === 1);

  try {
    const raw =
      typeof req.body === "string" ? safeParse(req.body) : req.body || {};
    const { url: rawUrl, mode = "free" } = raw as {
      url?: string;
      mode?: "free" | "full";
    };

    if (!process.env.OPENAI_API_KEY) {
      return json(res, 500, {
        error: "OPENAI_API_KEY is not set on the server",
      });
    }
    if (!rawUrl || typeof rawUrl !== "string") {
      return json(res, 400, { error: "Missing 'url' (string)" });
    }

    const url = normalizeUrl(rawUrl);

    // fetch page
    let html = "";
    try {
      const pageResp = await fetch(url, {
        headers: { "User-Agent": "HolboxAI/1.0 (+https://holbox.ai)" },
        redirect: "follow",
      });
      if (!pageResp.ok) {
        return json(res, 400, {
          error: `Fetch failed: ${pageResp.status} ${pageResp.statusText}`,
        });
      }
      html = await pageResp.text();
    } catch (e: any) {
      return json(res, 400, {
        error: `Failed to fetch URL: ${e?.message || e}`,
      });
    }

    const title = extractTitle(html);
    const text = extractText(html);
    const sections = detectSections(text);
    const screenshotUrl = buildScreenshotUrl(url);
    const suggestedUrl = screenshotUrl; // dev: reuse

    // OpenAI
    const system =
      "You are a CRO expert. Analyze landing page copy and structure. Return STRICT JSON matching the provided schema.";
    const userContent =
      mode === "free"
        ? `Mode: FREE
Return a lean but complete report (fill all required fields in the schema, but keep content concise).
URL: ${url}
TITLE: ${title || "(none)"}
TEXT (truncated):
${text}`
        : `Mode: FULL
Return a full report including content_audit (hero/value_prop/social_proof/pricing/features/faq/contact/footer) and prioritized_backlog. All required fields in the schema must be present.
URL: ${url}
TITLE: ${title || "(none)"}
TEXT (truncated):
${text}`;

    let data: any;
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

      // Extract text safely
      // @ts-ignore
      const rawText =
        resp.output_text ??
        // @ts-ignore
        resp.output?.[0]?.content?.[0]?.text ??
        (typeof (resp as any).content === "string"
          ? (resp as any).content
          : null);

      if (!rawText || typeof rawText !== "string") {
        throw new Error("OpenAI returned no text content");
      }

      try {
        data = JSON.parse(rawText);
      } catch {
        const cleaned = String(rawText)
          .replace(/^[\s`]*\{/, "{")
          .replace(/\}[\s`]*$/, "}");
        data = JSON.parse(cleaned);
      }
    } catch (e: any) {
      const status =
        e?.status === 429 || e?.code === "insufficient_quota" ? 429 : 502;
      return json(res, status, {
        error: e?.message || e?.error?.message || "OpenAI request failed",
        _debug: debug ? e : undefined,
      });
    }

    // Merge non-LLM fields (kept out of schema)
    return json(res, 200, {
      ...data,
      sections_detected: sections,
      page: { url, title },
      assets: {
        screenshot_url: screenshotUrl,
        suggested_screenshot_url: suggestedUrl,
      },
    });
  } catch (err: any) {
    return json(res, 500, {
      error: err?.message || "Internal error",
      _debug: debug ? err : undefined,
    });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
