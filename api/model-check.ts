// api/model-check.ts
export const config = { runtime: "nodejs" };

const MODEL_PREF = process.env.OPENAI_MODEL || "gpt-5";
const MODEL_FALLBACKS = [MODEL_PREF, "gpt-5-mini", "gpt-4o-mini"] as const;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export default async function handler(_req: any, res: any) {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      res.statusCode = 500;
      res.json({ ok: false, error: "OPENAI_API_KEY is not set" });
      return;
    }
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
      res.statusCode = 200;
      res.json({
        ok: false,
        tried: MODEL_FALLBACKS,
        error: lastErrText || r?.statusText || "request failed",
      });
      return;
    }
    const j = await r.json();
    const out = j?.choices?.[0]?.message?.content?.trim();
    res.setHeader("x-model-used", usedModel);
    res.statusCode = 200;
    res.json({
      ok: true,
      chosen_model: usedModel,
      tried: MODEL_FALLBACKS,
      sample: out,
    });
  } catch (e: any) {
    res.statusCode = 200;
    res.json({ ok: false, error: e?.message || "Unexpected error" });
  }
}
