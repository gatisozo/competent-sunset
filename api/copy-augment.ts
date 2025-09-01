// api/copy-augment.ts
// POST { url: string, meta?: { title?: string; description?: string } }
// -> { ok: true, rows: { field, current, recommended, priority, lift_percent }[] }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

// ---- OpenAI model selection (adds GPT-5 support with safe fallbacks) ----
const MODEL_PREF = process.env.OPENAI_MODEL || "gpt-5";
const MODEL_FALLBACKS = [MODEL_PREF, "gpt-5-mini", "gpt-4o-mini"] as const;
// ------------------------------------------------------------------------

const UA = "Mozilla/5.0 (compatible; HolboxAudit/1.1; +https://example.com)";

async function fetchHtml(u: string): Promise<string> {
  const resp = await fetch(u, { headers: { "user-agent": UA } });
  if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`);
  return await resp.text();
}
// ... (helperi paliek nemainīti)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(501).json({ ok: false, error: "OpenAI is not configured" });
    return;
  }
  const client = new OpenAI({ apiKey });

  // ... (html ielāde, prompta sagatavošana kā līdz šim)

  // Try preferred model first; fall back if the account lacks access
  let resp: any = null;
  let lastError: any = null;
  for (const m of MODEL_FALLBACKS) {
    try {
      resp = await client.chat.completions.create({
        model: m,
        temperature: 0.6,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify(user) },
        ],
        response_format: { type: "json_object" },
      });
      if (resp) break;
    } catch (e: any) {
      lastError = e;
      const msg = (e?.message || "").toString();
      if (/model/i.test(msg) || /not found/i.test(msg) || /access/i.test(msg)) {
        continue; // try next fallback
      }
      throw e;
    }
  }
  if (!resp) {
    throw lastError || new Error("OpenAI request failed");
  }

  const raw = resp.choices?.[0]?.message?.content?.trim() || "{}";
  // ... (parsē un atgriez atbildi kā līdz šim)
}
