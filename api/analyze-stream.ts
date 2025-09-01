// api/analyze-stream.ts
export const config = { runtime: "nodejs" };

// Tipspeci nav vajadzīgi; Vercel nodrošina Node handlera signatūru.
const MODEL_PREF = process.env.OPENAI_MODEL || "gpt-5";
const MODEL_FALLBACKS = [MODEL_PREF, "gpt-5-mini", "gpt-4o-mini"] as const;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const UA = "Mozilla/5.0 (compatible; HolboxAudit/1.0; +https://example.com)";

type ImpactStr = "high" | "medium" | "low";
type Suggestion = { title: string; impact: ImpactStr; recommendation: string };
type ContentAuditItem = {
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

function sseWrite(res: any, event: "progress" | "result", data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function normalizeUrl(u: string) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`;
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
function screenshotUrl(u: string) {
  const url = normalizeUrl(u);
  const tmpl = process.env.VITE_SCREENSHOT_URL_TMPL;
  if (tmpl) return String(tmpl).replace("{URL}", encodeURIComponent(url));
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}

export default async function handler(req: any, res: any) {
  // SSE headers PIRMS jebkādas darba loģikas
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("x-sse", "1");
  const heartbeat = setInterval(() => res.write(":\n\n"), 15000);

  try {
    if (req.method !== "GET") {
      sseWrite(res, "result", { ok: false, error: "Method Not Allowed" });
      res.end();
      return;
    }

    const urlParam = String(req.query?.url || "");
    const url = normalizeUrl(urlParam);
    if (!url) {
      sseWrite(res, "result", { ok: false, error: "Missing url" });
      res.end();
      return;
    }

    sseWrite(res, "progress", { stage: "fetch", message: "Fetching page…" });
    const { status, text } = await fetchText(url);
    if (status >= 400 || !text) {
      sseWrite(res, "result", {
        ok: false,
        error: `Could not fetch page (HTTP ${status})`,
      });
      res.end();
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

    sseWrite(res, "progress", {
      stage: "openai",
      message: "Analyzing with GPT…",
    });

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      sseWrite(res, "result", {
        ok: false,
        error: "OPENAI_API_KEY is not set",
      });
      res.end();
      return;
    }

    const system = `You are a CRO/UX auditor for marketing landing pages.
Return only strict JSON with these fields:
{
  "findings": [{"title": string, "impact": "high"|"medium"|"low", "recommendation": string}],
  "quick_wins": [string],
  "prioritized_backlog": [{"title": string, "impact": 1|2|3, "effort": "low"|"medium"|"high", "eta_days": number, "notes": string, "lift_percent": number}],
  "content_audit": [{"section": string, "status": "ok"|"weak"|"missing", "rationale": string, "suggestions": [string]}]
}
- Be concise and practical. Max ~6 items per list.`;

    const userMsg = {
      role: "user",
      content: [
        {
          type: "text",
          text: `URL: ${url}
Title: ${metaTitle || ""}
Meta description: ${metaDesc || ""}
H1/H2/H3: ${h1Count}/${h2Count}/${h3Count}

PAGE TEXT (first ~6-8k chars):
${plain.slice(0, 8000)}
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
          messages: [{ role: "system", content: system }, userMsg as any],
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
        sseWrite(res, "progress", {
          stage: "openai",
          message: `Falling back…`,
        });
        continue;
      }
      r = resp;
      break;
    }

    if (!r || !r.ok) {
      sseWrite(res, "result", {
        ok: false,
        error: `OpenAI HTTP ${r?.status || "ERR"}: ${
          lastErrText || r?.statusText || "request failed"
        }`,
        tried: MODEL_FALLBACKS,
      });
      res.end();
      return;
    }

    const j = await r.json();
    const textOut = j?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(textOut);
    } catch {}

    const payload = {
      ok: true,
      url,
      meta: { title: metaTitle, description: metaDesc },
      counts: { h1: h1Count, h2: h2Count, h3: h3Count },
      screenshot: screenshotUrl(url),
      ...parsed,
      chosen_model: usedModel,
    };
    res.setHeader("x-model-used", usedModel);
    sseWrite(res, "result", payload);
    res.end();
  } catch (e: any) {
    sseWrite(res, "result", {
      ok: false,
      error: e?.message || "Unexpected error",
    });
    res.end();
  } finally {
    clearInterval(heartbeat);
  }
}
