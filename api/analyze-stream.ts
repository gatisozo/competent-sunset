// /api/analyze-stream.ts
// SSE endpoint for Full Report — emits "progress" events and a final "result".
// SAFE drop-in: keeps GET + SSE, progress/result events, query (?url, ?mode, ?sid),
// and returns fields used by both old and new UIs.
// Requires env: OPENAI_API_KEY
// Optional env: OPENAI_MODEL, VITE_SCREENSHOT_URL_TMPL

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ---- OpenAI model selection (adds GPT-5 support with safe fallbacks) ----
const MODEL_PREF = process.env.OPENAI_MODEL || "gpt-5";
const MODEL_FALLBACKS = [MODEL_PREF, "gpt-5-mini", "gpt-4o-mini"] as const;
// ------------------------------------------------------------------------

const UA = "Mozilla/5.0 (compatible; HolboxAudit/1.0; +https://example.com)";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

type ImpactStr = "high" | "medium" | "low";
type Suggestion = { title: string; impact: ImpactStr; recommendation: string };
type ContentAuditItem = {
  section: string;
  status: "ok" | "weak" | "missing";
  rationale: string;
  suggestions: string[];
};

// ... (paliek viss tavs esošais kods par screenshot, helper funkcijām utt.)

// vietā, kur veido OpenAI pieprasījumu:

const model = MODEL_PREF;

const system = `You are a CRO/UX auditor for marketing landing pages.
Return only strict JSON with these fields:
{
  "findings": [{"title": string, "impact": "high"|"medium"|"low", "recommendation": string}],
  "quick_wins": [string],
  "prioritized_backlog": [{"title": string, "impact": 1|2|3, "effort": "low"|"medium"|"high", "eta_days": number, "notes": string, "lift_percent": number}],
  "content_audit": [{"section": string, "status": "ok"|"weak"|"missing", "rationale": string, "suggestions": [string]}]
}
- Be concise and practical. Max ~6 items per list.`;

const user = {
  /* ... kā līdz šim ... */
};

// --------- jaunais retry bloks ----------
let lastErrText = "";
let r: any = null;
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
  write(res, "result", {
    error: `OpenAI HTTP ${r?.status || "ERR"}: ${
      lastErrText || r?.statusText || "request failed"
    }`,
  });
  return res.end();
}
// ---------------------------------------

const j = await r.json();
// ... turpini esošo parsēšanu, emitē "result"
