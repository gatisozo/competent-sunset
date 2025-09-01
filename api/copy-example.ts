// api/copy-example.ts
// POST JSON: { field?, current, recommended, url?, title?, metaDescription?, audienceHint? }
// Atbilde: { ok: true, example: string } vai { ok: false, error: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

// ---- OpenAI model selection (adds GPT-5 support with safe fallbacks) ----
const MODEL_PREF = process.env.OPENAI_MODEL || "gpt-5";
const MODEL_FALLBACKS = [MODEL_PREF, "gpt-5-mini", "gpt-4o-mini"] as const;
// ------------------------------------------------------------------------

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

  // ... (prompta sagatavošana kā līdz šim)

  let resp: any = null;
  let lastError: any = null;
  for (const m of MODEL_FALLBACKS) {
    try {
      resp = await client.chat.completions.create({
        model: m,
        temperature: 0.7,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: prompt },
        ],
      });
      if (resp) break;
    } catch (e: any) {
      lastError = e;
      const msg = (e?.message || "").toString();
      if (/model/i.test(msg) || /not found/i.test(msg) || /access/i.test(msg)) {
        continue;
      }
      throw e;
    }
  }
  if (!resp) {
    res
      .status(502)
      .json({
        ok: false,
        error: lastError?.message || "OpenAI request failed",
      });
    return;
  }

  const example = resp.choices?.[0]?.message?.content?.trim();
  if (!example) {
    res.status(500).json({ ok: false, error: "No content" });
    return;
  }
  res.status(200).json({ ok: true, example });
}
