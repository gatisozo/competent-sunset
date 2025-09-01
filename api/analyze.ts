// api/analyze.ts
export const config = { runtime: "nodejs" };

const MODEL_PREF = process.env.OPENAI_MODEL || "gpt-5";
const MODEL_FALLBACKS = [MODEL_PREF, "gpt-5-mini", "gpt-4o-mini"] as const;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const UA = "Mozilla/5.0 (compatible; HolboxAudit/1.0; +https://example.com)";

type ImpactStr = "high" | "medium" | "low";
type Suggestion = { title: string; impact: ImpactStr; recommendation: string };
type NewAuditItem = {
  section: string;
  status: "ok" | "weak" | "missing";
  rationale: string;
  suggestions: string[];
};
type BacklogItem = {
  title: string;
  impact: 1 | 2 | 3;
  effort?: "low" | "medium" | "high";
  eta_days?: number;
  notes?: string;
  lift_percent?: number;
};

export default async function handler(req: any, res: any) {
  try {
    const mode = (
      (req.method === "GET"
        ? String(req.query?.mode || "")
        : String((req.body as any)?.mode || "")) || "free"
    ).toLowerCase();

    const urlParam =
      req.method === "GET"
        ? String(req.query?.url || "")
        : String((req.body as any)?.url || "");
    const url = normalizeUrl(urlParam);

    if (!url) {
      res.statusCode = 400;
      res.json({ error: "Missing url" });
      return;
    }

    const { status, text } = await fetchText(url);
    if (status >= 400 || !text) {
      res.statusCode = 400;
      res.json({ error: `Could not fetch page (HTTP ${status})`, url });
      return;
    }

    const metaTitle = extract(text, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const metaDesc = extract(
      text,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
    );
    const h1Count = countTags(text, "h1");
    const h2Count = countTags(text, "h2");
    const h3Count = countTags(text, "h3");
    const plain = toPlainText(text);

    const ai = await callOpenAI({
      url,
      title: metaTitle,
      description: metaDesc,
      h1Count,
      h2Count,
      h3Count,
      sampleText: plain,
    });

    res.setHeader("x-model-used", ai.chosen_model || "");
    res.statusCode = 200;
    res.json({
      ok: true,
      url,
      meta: { title: metaTitle, description: metaDesc },
      counts: { h1: h1Count, h2: h2Count, h3: h3Count },
      ...ai,
      mode,
      screenshot: screenshotUrl(url),
    });
  } catch (e: any) {
    res.statusCode = 500;
    res.json({ error: e?.message || "Unexpected error" });
  }
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
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}
async function fetchText(u: string) {
  const r = await fetch(u, { headers: { "user-agent": UA } as any });
  const text = await r.text();
  return { status: r.status, url: r.url, text };
}
function toPlainText(html: string) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
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

  const system = `You are a CRO/UX auditor for marketing landing pages.
Return only strict JSON with these fields:
{
  "findings": [{"title": string, "impact": "high"|"medium"|"low", "recommendation": string}],
  "quick_wins": [string],
  "prioritized_backlog": [{"title": string, "impact": 1|2|3, "effort": "low"|"medium"|"high", "eta_days": number, "notes": string, "lift_percent": number}],
  "content_audit": [{"section": string, "status": "ok"|"weak"|"missing", "rationale": string, "suggestions": [string]}]
}
- Be concise and practical. Max 6 items per list.`;

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

  let lastErrText = "";
  let r: any = null;
  let usedModel = "";
  for (const m of MODEL_FALLBACKS) {
    const resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: m,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, user as any],
      }),
    });
    if (resp.ok) {
      r = resp;
      usedModel = m;
      break;
    }
    lastErrText = await resp.text().catch(() => "");
    if (
      resp.status === 404 ||
      resp.status === 400 ||
      /model/i.test(lastErrText)
    ) {
      continue;
    }
    r = resp;
    break;
  }
  if (!r || !r.ok) {
    throw new Error(
      `OpenAI HTTP ${r?.status || "ERR"}: ${
        lastErrText || r?.statusText || "request failed"
      }`
    );
  }

  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content || "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch {}

  return { ...parsed, chosen_model: usedModel } as {
    findings?: Suggestion[];
    quick_wins?: string[];
    prioritized_backlog?: BacklogItem[];
    content_audit?: NewAuditItem[];
    chosen_model: string;
  };
}
