// /api/analyze-stream.ts
// SSE endpoint for Full Report — emits "progress" events and a final "result".
// SAFE drop-in: keeps GET + SSE, progress/result events, query (?url, ?mode, ?sid),
// and returns fields used by both old and new UIs.
// Requires env: OPENAI_API_KEY
// Optional env: OPENAI_MODEL, VITE_SCREENSHOT_URL_TMPL

import type { VercelRequest, VercelResponse } from "@vercel/node";

const UA = "Mozilla/5.0 (compatible; HolboxAudit/1.0; +https://example.com)";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

type ImpactStr = "high" | "medium" | "low";
type Suggestion = { title: string; impact: ImpactStr; recommendation: string };
type ContentAuditItem = {
  section: string;
  status: "ok" | "weak" | "missing";
  rationale?: string;
  suggestions?: string[];
};
type BacklogItem = {
  title: string;
  impact: 1 | 2 | 3; // numeric impact for UI
  effort?: "low" | "medium" | "high";
  eta_days?: number;
  lift_percent?: number;
  notes?: string;
};

function okHeaders(res: VercelResponse) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
}

function write(res: VercelResponse, ev: string, data: any) {
  res.write(`event: ${ev}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeUrl(u: string) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`;
}

function screenshotUrl(u: string) {
  const url = normalizeUrl(u);
  const tmpl = process.env.VITE_SCREENSHOT_URL_TMPL;
  if (tmpl) return String(tmpl).replace("{URL}", encodeURIComponent(url));
  // safe public fallback
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}

async function fetchText(u: string) {
  const r = await fetch(u, { headers: { "user-agent": UA } as any });
  const text = await r.text();
  return { status: r.status, url: r.url, text };
}

function stripTags(s: string) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extract(html: string, re: RegExp) {
  const m = html.match(re);
  return m ? (m[1] || "").trim() : "";
}

function countTags(html: string, tag: string) {
  const re = new RegExp(`<${tag}\\b`, "gi");
  const m = html.match(re);
  return m ? m.length : 0;
}

function parseHeadings(html: string): Array<{ tag: string; text: string }> {
  const out: Array<{ tag: string; text: string }> = [];
  const re = /<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const text = stripTags(m[2]);
    out.push({ tag, text });
  }
  return out;
}

function detectSections(
  metaTitle: string,
  metaDesc: string,
  headings: { tag: string; text: string }[],
  plain: string
) {
  const bucket = `${metaTitle}\n${metaDesc}\n${headings
    .map((h) => h.text)
    .join("\n")}\n${plain}`.toLowerCase();
  const has = (re: RegExp) => re.test(bucket);
  return {
    hero: headings.some((h) => h.tag === "h1"),
    value_prop:
      (metaDesc || "").length >= 120 || has(/value prop|benefit|solve|helps/),
    social_proof: has(/testimonial|review|trust|logo|case study/),
    pricing: has(/price|pricing|plan|€|\$/),
    features: has(/feature|benefit|capabilit|how it works/),
    faq: has(/\bfaq\b|frequently asked|question/),
    contact: has(/contact|support|email|phone|whatsapp|messenger/),
    footer:
      has(/©|copyright|privacy|terms|cookies/) ||
      (plain.match(/https?:\/\//g) || []).length > 10,
  };
}

async function callOpenAI(struct: {
  url: string;
  title?: string;
  description?: string;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  sampleText: string;
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system = `You are a CRO/UX auditor for marketing landing pages.
Return only strict JSON with these fields:
{
  "findings": [{"title": string, "impact": "high"|"medium"|"low", "recommendation": string}],
  "quick_wins": [string],
  "prioritized_backlog": [{"title": string, "impact": 1|2|3, "effort": "low"|"medium"|"high", "eta_days": number, "notes": string}],
  "content_audit": [{"section": string, "status": "ok"|"weak"|"missing", "rationale": string, "suggestions": [string]}]
}
- "impact" in backlog is numeric: 3=high, 2=medium, 1=low.
- Be concise and practical. Max ~6 items per list.`;

  const user = {
    role: "user",
    content: [
      {
        type: "text",
        text: `URL: ${struct.url}
Title: ${struct.title || ""}
Meta description: ${struct.description || ""}
H1/H2/H3: ${struct.h1Count}/${struct.h2Count}/${struct.h3Count}

PAGE TEXT (first ~6-8k chars):
${struct.sampleText.slice(0, 8000)}
`,
      },
    ],
  };

  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, user as any],
    }),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${r.status}: ${errText || r.statusText}`);
  }

  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content || "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  return parsed as {
    findings?: Suggestion[];
    quick_wins?: string[];
    prioritized_backlog?: BacklogItem[];
    content_audit?: ContentAuditItem[];
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    okHeaders(res);

    const qUrl = (req.query.url as string) || "";
    const _mode = ((req.query.mode as string) || "full").toLowerCase();
    const target = normalizeUrl(qUrl);

    if (!target) {
      write(res, "result", { error: "Missing url" });
      return res.end();
    }

    write(res, "progress", { value: 5 });

    // Fetch page HTML
    const { status, url, text } = await fetchText(target);
    if (status >= 400 || !text) {
      write(res, "result", { error: `Could not fetch page (HTTP ${status})` });
      return res.end();
    }
    write(res, "progress", { value: 15 });

    const metaTitle = extract(text, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const metaDesc = extract(
      text,
      /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
    );
    const h1Count = countTags(text, "h1");
    const h2Count = countTags(text, "h2");
    const h3Count = countTags(text, "h3");
    const headings = parseHeadings(text);
    const plain = stripTags(text).slice(0, 120000);
    const sections = detectSections(metaTitle, metaDesc, headings, plain);
    write(res, "progress", { value: 35 });

    // Base object (keeps legacy fields too)
    const base = {
      url,
      title: metaTitle || "",
      screenshots: { hero: screenshotUrl(url) }, // new UI
      page: { url, title: metaTitle || undefined }, // legacy
      assets: {
        screenshot_url: screenshotUrl(url),
        suggested_screenshot_url: screenshotUrl(url),
      }, // legacy
      sections_detected: sections,
    } as any;

    // Heuristic score if AI is absent
    const heuristicScore = clamp(
      50 +
        (h1Count ? 10 : -5) +
        Math.min(15, h2Count * 3) +
        Math.min(8, h3Count * 1.5) +
        (metaDesc ? Math.min(12, Math.floor(metaDesc.length / 15)) : -6),
      0,
      100
    );

    // Call OpenAI (real analysis)
    let ai: Awaited<ReturnType<typeof callOpenAI>> | null = null;
    try {
      ai = await callOpenAI({
        url,
        title: metaTitle,
        description: metaDesc,
        h1Count,
        h2Count,
        h3Count,
        sampleText: plain,
      });
      write(res, "progress", { value: 75 });
    } catch (e) {
      ai = null; // will fall back below
    }

    // Normalize AI output
    const findings: Suggestion[] =
      (ai?.findings || []).map((f) => ({
        title: String(f.title || "").slice(0, 140),
        impact: (["high", "medium", "low"] as const).includes(
          (f.impact || "low") as any
        )
          ? (f.impact as ImpactStr)
          : "low",
        recommendation: String(f.recommendation || "").slice(0, 800),
      })) || [];

    const quick_wins: string[] = (ai?.quick_wins || []).map((s) =>
      String(s).slice(0, 220)
    );

    const prioritized_backlog: BacklogItem[] =
      (ai?.prioritized_backlog || [])
        .map((b) => {
          const n = Number(b.impact);
          const impact = n === 3 || n === 2 || n === 1 ? (n as 1 | 2 | 3) : 2;
          return {
            title: String(b.title || "").slice(0, 140),
            impact,
            effort: (["low", "medium", "high"] as const).includes(
              (b.effort || "medium") as any
            )
              ? (b.effort as any)
              : "medium",
            eta_days:
              typeof b.eta_days === "number"
                ? Math.max(1, Math.min(30, Math.round(b.eta_days)))
                : undefined,
            lift_percent:
              typeof (b as any).lift_percent === "number"
                ? clamp((b as any).lift_percent, 1, 50)
                : undefined,
            notes: b.notes ? String(b.notes).slice(0, 400) : undefined,
          };
        })
        .slice(0, 8) || [];

    const content_audit: ContentAuditItem[] =
      (ai?.content_audit || [])
        .map((c) => {
          const status =
            c.status === "ok" || c.status === "weak" || c.status === "missing"
              ? c.status
              : "weak";
          return {
            section: String(c.section || "section")
              .toLowerCase()
              .replace(/\s+/g, "_"),
            status,
            rationale: c.rationale
              ? String(c.rationale).slice(0, 600)
              : undefined,
            suggestions: Array.isArray(c.suggestions)
              ? c.suggestions.slice(0, 6).map((s) => String(s).slice(0, 220))
              : undefined,
          };
        })
        .slice(0, 20) || [];

    // If AI failed entirely, give a sensible fallback
    if (!ai) {
      write(res, "result", {
        ...base,
        score: heuristicScore,
        key_findings: [
          {
            title: "Clarify the primary value proposition in the hero",
            impact: "high",
            recommendation:
              "Rewrite the headline to clearly state the outcome and add a strong CTA above the fold.",
          },
          {
            title: "Add social proof near the CTA",
            impact: "medium",
            recommendation:
              "Place 2–3 short testimonials or logos near the primary CTA.",
          },
        ] as Suggestion[],
        findings: [
          // legacy alias (same content)
          {
            title: "Clarify the primary value proposition in the hero",
            impact: "high",
            recommendation:
              "Rewrite the headline to clearly state the outcome and add a strong CTA above the fold.",
          },
          {
            title: "Add social proof near the CTA",
            impact: "medium",
            recommendation:
              "Place 2–3 short testimonials or logos near the primary CTA.",
          },
        ] as Suggestion[],
        quick_wins: [
          "Add a descriptive meta description (120–160 chars) including the main benefit.",
          "Ensure exactly one H1 and 3–6 H2s structuring the page.",
          "Add ALT texts for hero images above the fold.",
        ],
        prioritized_backlog: [
          {
            title: "Rewrite hero for clarity",
            impact: 3,
            effort: "low",
            eta_days: 1,
            lift_percent: 10,
          },
          {
            title: "Add testimonials/logo strip",
            impact: 2,
            effort: "medium",
            eta_days: 2,
            lift_percent: 6,
          },
          {
            title: "Improve CTA contrast",
            impact: 2,
            effort: "low",
            eta_days: 1,
            lift_percent: 4,
          },
        ] as BacklogItem[],
        content_audit: [
          {
            section: "hero",
            status: h1Count ? "weak" : "missing",
            rationale: h1Count
              ? "Headline present but likely unclear"
              : "Missing clear H1",
            suggestions: [
              "State benefit + outcome in one sentence",
              "Include a strong primary CTA",
            ],
          },
          {
            section: "social_proof",
            status: sections.social_proof ? "ok" : "missing",
            suggestions: ["Add 2–3 short testimonials or trusted client logos"],
          },
          {
            section: "features",
            status: sections.features ? "ok" : "weak",
            suggestions: ["Bullet the top 3–5 benefits in user language"],
          },
        ] as ContentAuditItem[],
      });
      return res.end();
    }

    // With AI response
    const scoreFromAI =
      100 -
      (content_audit.filter((r) => r.status === "missing").length * 5 +
        content_audit.filter((r) => r.status === "weak").length * 2 +
        (findings.filter((f) => f.impact === "high").length * 10 +
          findings.filter((f) => f.impact === "medium").length * 5 +
          findings.filter((f) => f.impact === "low").length * 2));

    const result = {
      ...base,
      score: clamp(Math.round(scoreFromAI || heuristicScore), 0, 100),
      key_findings: findings, // new UI
      findings, // legacy alias
      quick_wins,
      prioritized_backlog,
      content_audit,
    };

    write(res, "progress", { value: 96 });
    write(res, "result", result);
    res.end();
  } catch (err: any) {
    try {
      write(res, "result", { error: err?.message || "Internal error" });
    } catch {}
    res.end();
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
