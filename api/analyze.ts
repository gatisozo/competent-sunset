// api/analyze.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

/** ===================== Config ===================== **/
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // dev noklusējums

/** =================== Types (runtime shape) ==================== **/
type Impact = "high" | "medium" | "low";
type Effort = "low" | "medium" | "high";

type SectionPresence = {
  hero?: boolean;
  value_prop?: boolean;
  social_proof?: boolean;
  features?: boolean;
  pricing?: boolean;
  faq?: boolean;
  contact?: boolean;
  footer?: boolean;
};

type Suggestion = { title: string; recommendation: string; impact: Impact };
type Overlay = { x: number; y: number; w: number; h: number };

type FreeReport = {
  url: string;
  score?: number;
  summary?: string;
  assets?: { screenshot_url?: string | null };
  sections_detected?: SectionPresence;
  hero?: { text?: any; suggestions?: Suggestion[]; overlay?: Overlay | null };
  next_section?: {
    type?: string;
    text?: any;
    suggestions?: Suggestion[];
    overlay?: Overlay | null;
  };
  quick_wins?: string[];
  risks?: string[];
};

type FullFinding = {
  title: string;
  impact: Impact;
  effort?: Effort;
  owner?: string;
  section?: string;
  recommendation: string;
};

type FullReport = FreeReport & {
  findings?: FullFinding[];
  prioritized_backlog?: {
    title: string;
    impact: number;
    effort: number;
    eta_days?: number;
  }[];
};

type Mode = "free" | "full";

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

// `http(s)://` + URL() validācija + aizliegti privātie hosti
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
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost"))
    throw new Error("URL not allowed (localhost)");
  if (/^127\./.test(host)) throw new Error("URL not allowed (127.x.x.x)");
  // IPv4 privātie diapazoni
  const ipMatch = host.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  if (ipMatch) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10) throw new Error("URL not allowed (10/8)");
    if (a === 172 && b >= 16 && b <= 31)
      throw new Error("URL not allowed (172.16/12)");
    if (a === 192 && b === 168) throw new Error("URL not allowed (192.168/16)");
  }
  return parsed;
}

// HTML ielāde + Jina reader fallback
async function fetchPage(parsed: URL) {
  const ua = { "User-Agent": "Mozilla/5.0 (compatible; HolboxAI/1.0)" };
  let resp = await fetch(parsed.toString(), {
    headers: ua,
    redirect: "follow",
  });
  if (resp.ok) return await resp.text();
  const readerUrl = `https://r.jina.ai/http/${parsed.host}${
    parsed.pathname || ""
  }${parsed.search || ""}`;
  resp = await fetch(readerUrl, { headers: ua });
  if (resp.ok) return await resp.text();
  throw new Error(`Fetch failed: ${resp.status}`);
}

// screenshot API: process.env.SCREENSHOT_API_URL ar {URL} vietturi
async function getScreenshotUrl(u: string) {
  const tpl = process.env.SCREENSHOT_API_URL;
  if (!tpl) return null;
  return tpl.replace("{URL}", encodeURIComponent(u));
}

/** ===================== Handler ===================== **/
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Diagnoze
  if (
    req.method === "GET" &&
    (req.query.diag === "1" || req.query.diag === "true")
  ) {
    return res.status(200).json({
      ok: true,
      hasKey: Boolean(process.env.OPENAI_API_KEY),
      model: MODEL,
      demo: process.env.ANALYZE_DEMO === "1",
      screenshotTpl: Boolean(process.env.SCREENSHOT_API_URL),
      node: process.version,
      region: process.env.VERCEL_REGION || "unknown",
    });
  }
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = (req.body || {}) as { url?: string; mode?: Mode };
    const mode: Mode = body.mode === "full" ? "full" : "free";

    // Demo režīms – atgriež pilnu shēmu bez OpenAI zvana
    if (process.env.ANALYZE_DEMO === "1") {
      const safeUrl = body.url
        ? normalizeAndValidateUrl(body.url).toString()
        : "";
      const screenshot_url = await getScreenshotUrl(safeUrl);
      const demo: FullReport = {
        url: safeUrl,
        score: 74,
        summary:
          "Demo preview — actionable highlights for hero and next section.",
        assets: { screenshot_url },
        sections_detected: {
          hero: true,
          value_prop: true,
          social_proof: false,
          features: true,
          pricing: false,
          faq: true,
          contact: true,
          footer: true,
        },
        hero: {
          text: {
            headline: "Grow faster with Holbox AI",
            subheadline: "Audit your landing page in minutes",
            cta: "Run free test",
          },
          suggestions: [
            {
              title: "Clarify the outcome",
              impact: "high",
              recommendation:
                "Make the headline outcome-first (e.g., “+15–30% more sign-ups in 30 days”).",
            },
            {
              title: "Boost CTA contrast",
              impact: "medium",
              recommendation:
                "Raise contrast to ≥ 4.5:1 and add hover/focus states.",
            },
            {
              title: "Add trust near hero",
              impact: "medium",
              recommendation:
                "Show 3–4 logos or a short testimonial below the CTA.",
            },
          ],
          overlay: { x: 0, y: 0, w: 1366, h: 740 },
        },
        next_section: {
          type: "features",
          text: {
            heading: "How it works",
            bullets: ["Run test", "See issues", "Apply fixes"],
          },
          suggestions: [
            {
              title: "Outcome-oriented bullets",
              impact: "high",
              recommendation:
                "Rewrite bullets with measurable outcomes (e.g., “Reduce LCP to <2.5s”).",
            },
            {
              title: "Add micro-CTAs",
              impact: "medium",
              recommendation:
                "Place subtle “See full report” links under each feature.",
            },
          ],
          overlay: { x: 0, y: 740, w: 1366, h: 700 },
        },
        quick_wins: [
          "Compress hero image",
          "Move CTA above fold",
          "Add social proof",
        ],
        findings:
          mode === "full"
            ? [
                {
                  title: "Hero value unclear on mobile",
                  impact: "high",
                  effort: "low",
                  owner: "design",
                  section: "hero",
                  recommendation:
                    "Shorten headline and keep CTA in the first viewport.",
                },
                {
                  title: "Primary CTA low contrast",
                  impact: "medium",
                  effort: "low",
                  owner: "design",
                  section: "hero",
                  recommendation:
                    "Increase color contrast and add hover/focus styles.",
                },
                {
                  title: "LCP image oversized",
                  impact: "high",
                  effort: "medium",
                  owner: "dev",
                  section: "performance",
                  recommendation:
                    "Serve responsive images (srcset) and preload hero asset.",
                },
              ]
            : undefined,
        prioritized_backlog:
          mode === "full"
            ? [
                {
                  title: "Fix hero value + CTA",
                  impact: 3,
                  effort: 1,
                  eta_days: 1,
                },
                {
                  title: "Responsive hero image",
                  impact: 3,
                  effort: 2,
                  eta_days: 2,
                },
                {
                  title: "Add trust badges",
                  impact: 2,
                  effort: 1,
                  eta_days: 1,
                },
              ]
            : undefined,
      };
      return res.status(200).json(demo);
    }

    if (!body.url || typeof body.url !== "string")
      return res.status(400).json({ error: "Missing 'url'" });
    if (!process.env.OPENAI_API_KEY)
      return res
        .status(429)
        .json({ error: "OpenAI key missing or quota exhausted" });

    let parsed: URL;
    try {
      parsed = normalizeAndValidateUrl(body.url);
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || "Invalid URL" });
    }

    // 1) HTML
    const html = await fetchPage(parsed);
    const content = extractText(html);

    // 2) Screenshot URL (ja norādīts)
    const screenshot_url = await getScreenshotUrl(parsed.toString());

    // 3) Schema
    const baseSchema = {
      type: "object",
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        summary: { type: "string" },
        sections_detected: {
          type: "object",
          properties: {
            hero: { type: "boolean" },
            value_prop: { type: "boolean" },
            social_proof: { type: "boolean" },
            features: { type: "boolean" },
            pricing: { type: "boolean" },
            faq: { type: "boolean" },
            contact: { type: "boolean" },
            footer: { type: "boolean" },
          },
          additionalProperties: false,
        },
        hero: {
          type: "object",
          properties: {
            text: { type: "object" },
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  recommendation: { type: "string" },
                  impact: { type: "string", enum: ["high", "medium", "low"] },
                },
                required: ["title", "recommendation", "impact"],
              },
              minItems: 2,
              maxItems: 3,
            },
            overlay: {
              type: "object",
              properties: {
                x: { type: "number" },
                y: { type: "number" },
                w: { type: "number" },
                h: { type: "number" },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: true,
        },
        next_section: {
          type: "object",
          properties: {
            type: { type: "string" },
            text: { type: "object" },
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  recommendation: { type: "string" },
                  impact: { type: "string", enum: ["high", "medium", "low"] },
                },
                required: ["title", "recommendation", "impact"],
              },
              minItems: 1,
              maxItems: 2,
            },
            overlay: {
              type: "object",
              properties: {
                x: { type: "number" },
                y: { type: "number" },
                w: { type: "number" },
                h: { type: "number" },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: true,
        },
        quick_wins: { type: "array", items: { type: "string" }, maxItems: 5 },
        risks: { type: "array", items: { type: "string" }, maxItems: 5 },
      },
      required: [
        "score",
        "sections_detected",
        "hero",
        "next_section",
        "quick_wins",
      ],
      additionalProperties: true,
    };

    const fullExtras = {
      type: "object",
      properties: {
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              impact: { type: "string", enum: ["high", "medium", "low"] },
              effort: { type: "string", enum: ["low", "medium", "high"] },
              owner: { type: "string" },
              section: { type: "string" },
              recommendation: { type: "string" },
            },
            required: ["title", "impact", "recommendation"],
          },
          minItems: 8,
          maxItems: 12,
        },
        prioritized_backlog: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              impact: { type: "integer", minimum: 1, maximum: 3 },
              effort: { type: "integer", minimum: 1, maximum: 3 },
              eta_days: { type: "integer", minimum: 0, maximum: 60 },
            },
            required: ["title", "impact", "effort"],
          },
          minItems: 3,
          maxItems: 10,
        },
      },
      additionalProperties: true,
    };

    const schemaShape =
      mode === "full"
        ? {
            ...baseSchema,
            properties: { ...baseSchema.properties, ...fullExtras.properties },
          }
        : baseSchema;

    // 4) OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const rules =
      mode === "free"
        ? [
            "Return JSON only.",
            "key_findings not required; focus on hero and next_section suggestions.",
            "hero.suggestions: 2–3 items, outcome-first and specific.",
            "next_section.suggestions: 1–2 items, concise and specific.",
            "sections_detected booleans must be present for hero,value_prop,social_proof,features,pricing,faq,contact,footer.",
          ].join("\n- ")
        : [
            "Return JSON only.",
            "findings: 8–12 items with impact, effort, owner, section, recommendation.",
            "prioritized_backlog: 3–10 items (impact 1..3, effort 1..3, eta_days optional).",
            "Also include hero/next_section suggestions like in free mode.",
          ].join("\n- ");

    const completion = await withRetry(() =>
      openai.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a senior CRO expert. Be concise, specific, actionable. Output ONLY JSON per schema.",
          },
          {
            role: "user",
            content:
              `MODE: ${mode.toUpperCase()}\nURL: ${parsed.toString()}\n\nTEXT (truncated):\n${content}\n\n` +
              `SCHEMA SHAPE:\n${JSON.stringify(
                schemaShape
              )}\n\nRULES:\n- ${rules}`,
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

    // 5) default overlays if model omitted them
    if (!data.hero) data.hero = {};
    if (!data.next_section) data.next_section = {};
    if (!data.hero.overlay) data.hero.overlay = { x: 0, y: 0, w: 1366, h: 740 };
    if (!data.next_section.overlay)
      data.next_section.overlay = { x: 0, y: 740, w: 1366, h: 700 };

    const out = { url: parsed.toString(), assets: { screenshot_url }, ...data };
    return res.status(200).json(out);
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
