// api/model-check.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const MODEL_PREF = process.env.OPENAI_MODEL || "gpt-5";
const MODEL_FALLBACKS = [MODEL_PREF, "gpt-5-mini", "gpt-4o-mini"] as const;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key)
      return res
        .status(500)
        .json({ ok: false, error: "OPENAI_API_KEY is not set" });

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
          temperature: 0,
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "Return exactly: OK" },
          ],
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
      )
        continue;
      r = resp;
      break;
    }
    if (!r || !r.ok) {
      return res
        .status(200)
        .json({
          ok: false,
          tried: MODEL_FALLBACKS,
          error: lastErrText || r?.statusText || "request failed",
        });
    }
    const j = await r.json();
    const out = j?.choices?.[0]?.message?.content?.trim();
    res.setHeader("x-model-used", usedModel);
    return res
      .status(200)
      .json({
        ok: true,
        chosen_model: usedModel,
        tried: MODEL_FALLBACKS,
        sample: out,
      });
  } catch (e: any) {
    return res
      .status(200)
      .json({ ok: false, error: e?.message || "Unexpected error" });
  }
}
