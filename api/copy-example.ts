// api/copy-example.ts
export const config = { runtime: "nodejs" };

import OpenAI from "openai";

const MODEL_PREF = process.env.OPENAI_MODEL || "gpt-5";
const MODEL_FALLBACKS = [MODEL_PREF, "gpt-5-mini", "gpt-4o-mini"] as const;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.json({ ok: false, error: "Method Not Allowed" });
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.statusCode = 501;
    res.json({ ok: false, error: "OpenAI is not configured" });
    return;
  }
  const client = new OpenAI({ apiKey });

  const {
    field,
    current,
    recommended,
    url,
    title,
    metaDescription,
    audienceHint,
  } = req.body || {};
  const sys = `You are a senior direct-response copywriter. Produce one concise example for the requested field.`;

  const prompt =
    `FIELD: ${field || "headline"}\n` +
    `CURRENT: ${current || ""}\n` +
    `RECOMMENDED: ${recommended || ""}\n` +
    (url ? `URL: ${url}\n` : "") +
    (title ? `TITLE: ${title}\n` : "") +
    (metaDescription ? `META: ${metaDescription}\n` : "") +
    (audienceHint ? `AUDIENCE: ${audienceHint}\n` : "") +
    `\nReturn only the text example without commentary.`;

  let resp: any = null;
  let lastError: any = null;
  let usedModel = "";
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
      usedModel = m;
      break;
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
    res.statusCode = 502;
    res.json({
      ok: false,
      error: lastError?.message || "OpenAI request failed",
    });
    return;
  }

  const example = resp.choices?.[0]?.message?.content?.trim();
  if (!example) {
    res.statusCode = 500;
    res.json({ ok: false, error: "No content" });
    return;
  }
  res.setHeader("x-model-used", usedModel);
  res.statusCode = 200;
  res.json({ ok: true, example, chosen_model: usedModel });
}
