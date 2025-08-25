// api/copy-example.ts
// POST JSON: { field?, current, recommended, url?, title?, metaDescription?, audienceHint? }
// Atbilde: { ok: true, example: string } vai { ok: false, error: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

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

  try {
    const {
      field,
      current,
      recommended,
      url,
      title,
      metaDescription,
      audienceHint,
    } = req.body || {};
    const client = new OpenAI({ apiKey });

    const sys = [
      "You are a concise conversion copywriter.",
      "Return only the improved copy with no extra commentary or lists.",
    ].join(" ");

    // īss konteksts modelim
    const prompt = [
      audienceHint ? `Audience: ${audienceHint}.` : "",
      url ? `URL: ${url}.` : "",
      title ? `Title: ${title}.` : "",
      metaDescription ? `Meta description: ${metaDescription}.` : "",
      field ? `Field: ${field}.` : "",
      recommended ? `Guideline: ${recommended}.` : "",
      current ? `Current text: "${current}".` : "",
      "",
      "Write ONE improved example in the site's language (keep tone natural).",
      "If field is 'Meta description', aim for 145–160 characters and include benefit + brand + CTA.",
      "If field is 'Hero headline', keep it crisp, outcome/benefit-first.",
      "If field is 'CTA copy', keep it action-oriented (1 short line).",
    ]
      .filter(Boolean)
      .join("\n");

    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
    });

    const example = resp.choices?.[0]?.message?.content?.trim();
    if (!example) {
      res.status(500).json({ ok: false, error: "No content" });
      return;
    }
    res.status(200).json({ ok: true, example });
  } catch (e: any) {
    res
      .status(500)
      .json({ ok: false, error: e?.message || "Generation failed" });
  }
}
