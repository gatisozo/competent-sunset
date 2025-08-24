// api/analyze.ts
// Free report (non-stream) endpoint — safe drop-in for production.
// Prefers POST { url, mode: "free" }, supports GET ?url=...&mode=free
// Requires: OPENAI_API_KEY
// Optional: OPENAI_MODEL, VITE_SCREENSHOT_URL_TMPL

import type { VercelRequest, VercelResponse } from "@vercel/node";

const UA = "Mozilla/5.0 (compatible; HolboxAudit/1.0; +https://example.com)";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

type ImpactStr = "high" | "medium" | "low";
type Suggestion = { title: string; impact: ImpactStr; recommendation: string };
type LegacyAuditItem = {
  section: string;
  present: boolean;
  quality: "good" | "poor";
  suggestion?: string;
};
type NewAuditItem = {
  section: string;
  status: "ok" | "weak" | "missing";
  rationale?: string;
  suggestions?: string[];
};
type BacklogItem = {
  title: string;
  impact: 1 | 2 | 3;
  effort?: "low" | "medium" | "high";
  eta_days?: number;
  lift_percent?: number;
  notes?: string;
};

function normalizeUrl(u: string) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`;
}
function screenshotUrl(u: string) {
  const url = normalizeUrl(u);
  const tmpl = process.env.VITE_SCREENSHOT_URL_TMPL;
  if (tmpl) return String(tmpl).replace("{URL}", encodeURIComponent(url));
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
function classifyLinks(html: string, baseUrl: string) {
  const host = (() => {
    try {
      return new URL(baseUrl).host;
    } catch {
      return "";
    }
  })();
  const hrefRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  let total = 0,
    internal = 0,
    external = 0;
  while ((m = hrefRe.exec(html))) {
    total++;
    const h = (m[1] || "").trim();
    if (!h) continue;
    if (/^https?:\/\//i.test(h)) {
      try {
        const u = new URL(h);
        if (u.host === host) internal++;
        else external++;
      } catch {
        /* ignore */
      }
    } else {
      internal++; // relative → treat as internal
    }
  }
  return { total, internal, external };
}
function analyzeImages(html: string) {
  const imgRe = /<img\b[^>]*>/gi;
  const altRe = /\balt=["']([^"']*)["']/i;
  const srcRe = /\bsrc=["']([^"']+)["']/i;
  const imgs = html.match(imgRe) || [];
  let total = imgs.length;
  let missingAlt = 0;
  for (const img of imgs) {
    const alt = img.match(altRe)?.[1];
    const src = img.match(srcRe)?.[1];
    if (!alt || !alt.trim()) missingAlt++;
    // ignore `src` here; could filter data-URI or tiny pixel if needed
  }
  return { total, missingAlt };
}

async function checkRobots(u: string) {
  try {
    const url = new URL(u);
    const base = `${url.protocol}//${url.host}`;
    const [r1, r2] = await Promise.allSettled([
      fetch(`${base}/robots.txt`, { headers: { "user-agent": UA } as any }),
      fetch(`${base}/sitemap.xml`, { headers: { "user-agent": UA } as any }),
    ]);
    const robotsTxtOk = r1.status === "fulfilled" && (r1.value as any).ok;
    const sitemapOk = r2.status === "fulfilled" && (r2.value as any).ok;
    return { robotsTxtOk, sitemapOk };
  } catch {
    return { robotsTxtOk: null, sitemapOk: null };
  }
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
  "prioritized_backlog": [{"title": string, "impact": 1|2|3, "effort": "low"|"medium"|"high", "eta_days": number, "notes": string, "lift_percent": number}],
  "content_audit": [{"section": string, "status": "ok"|"weak"|"missing", "rationale": string, "suggestions": [string]}]
}
- Be concise and practical. Up to 5–6 items per list.`;

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
  } catch {}
  return parsed as {
    findings?: Suggestion[];
    quick_wins?: string[];
    prioritized_backlog?: BacklogItem[];
    content_audit?: NewAuditItem[];
  };
}

function normalizeBacklog(aiList: BacklogItem[] | undefined): BacklogItem[] {
  const out: BacklogItem[] = [];
  for (const b of aiList || []) {
    const n = Number(b.impact);
    const impact = n === 1 || n === 2 || n === 3 ? (n as 1 | 2 | 3) : 2;
    out.push({
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
        typeof b.lift_percent === "number"
          ? Math.max(1, Math.min(50, Math.round(b.lift_percent)))
          : undefined,
      notes: b.notes ? String(b.notes).slice(0, 400) : undefined,
    });
  }
  return out.slice(0, 8);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const method = (req.method || "GET").toUpperCase();
    let url = "";
    if (method === "POST") {
      const body = (req.body || {}) as any;
      url = normalizeUrl(body?.url || "");
    } else {
      url = normalizeUrl((req.query?.url as string) || "");
    }
    const mode = (
      ((method === "POST"
        ? (req.body as any)?.mode
        : (req.query?.mode as string)) || "free") + ""
    ).toLowerCase();

    if (!url) {
      res.status(400).json({ error: "Missing url" });
      return;
    }

    // 1) Fetch page
    const { status, url: finalUrl, text } = await fetchText(url);
    if (status >= 400 || !text) {
      res
        .status(400)
        .json({
          error: `Could not fetch page (HTTP ${status})`,
          url,
          finalUrl,
        });
      return;
    }

    // 2) Parse structure/meta
    const metaTitle = extract(text, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const metaDesc = extract(
      text,
      /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
    );
    const canonical = extract(
      text,
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i
    );
    const h1Count = countTags(text, "h1");
    const h2Count = countTags(text, "h2");
    const h3Count = countTags(text, "h3");
    const headings = parseHeadings(text);
    const imgs = analyzeImages(text);
    const links = classifyLinks(text, finalUrl);
    const robots = await checkRobots(finalUrl);
    const plain = stripTags(text).slice(0, 120000);

    // 3) Call OpenAI for findings/backlog/audit
    let ai: Awaited<ReturnType<typeof callOpenAI>> | null = null;
    try {
      ai = await callOpenAI({
        url: finalUrl,
        title: metaTitle,
        description: metaDesc,
        h1Count,
        h2Count,
        h3Count,
        sampleText: plain,
      });
    } catch {
      ai = null;
    }

    // 4) Build response (keeps compatibility with FreeReport.tsx normalizer)
    const quick_wins: string[] = (ai?.quick_wins || []).map((s) =>
      String(s).slice(0, 220)
    );
    const findings: Suggestion[] = (ai?.findings || []).map((f) => ({
      title: String(f.title || "").slice(0, 140),
      impact: (["high", "medium", "low"] as const).includes(
        (f.impact || "low") as any
      )
        ? (f.impact as ImpactStr)
        : "low",
      recommendation: String(f.recommendation || "").slice(0, 800),
    }));
    const prioritized_backlog: BacklogItem[] = normalizeBacklog(
      ai?.prioritized_backlog
    );

    // content_audit jaunajā formātā;
    const content_audit_new: NewAuditItem[] = (ai?.content_audit || []).map(
      (c) => {
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
      }
    );

    // papildus: legacy formāts (present/quality/suggestion), ja kāds patērētājs to gaida
    const content_audit_legacy: LegacyAuditItem[] = content_audit_new.map(
      (n) => ({
        section: n.section,
        present: n.status !== "missing",
        quality: n.status === "ok" ? "good" : "poor",
        suggestion:
          (n.suggestions && n.suggestions[0]) || n.rationale || undefined,
      })
    );

    const result = {
      // jaunie lauki
      page: { url: finalUrl, title: metaTitle || undefined },
      meta: {
        title: metaTitle || undefined,
        description: metaDesc || undefined,
        canonical: canonical || undefined,
      },
      seo: {
        h1Count,
        h2Count,
        h3Count,
        canonicalPresent: !!canonical,
        metaDescriptionPresent: !!metaDesc,
      },
      images: imgs,
      links,
      robots,
      headingsOutline: headings,
      quick_wins,
      prioritized_backlog,
      findings,
      content_audit: content_audit_new, // FreeReport normalizators saprot arī jauno formātu
      assets: {
        screenshot_url: screenshotUrl(finalUrl),
        suggested_screenshot_url: screenshotUrl(finalUrl),
      },
      // ērtībai klientam:
      url: finalUrl,
      finalUrl,
      mode,
    };

    res.status(200).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Internal error" });
  }
}

export const config = {
  api: { bodyParser: true },
};
