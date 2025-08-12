// api/analyze.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

function extractText(html: string, maxChars = 20000) {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = noScript
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxChars);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { url } = req.body || {};
    if (!url || typeof url !== "string")
      return res.status(400).json({ error: "Missing 'url'" });

    // 1) Fetch page HTML (public only)
    const page = await fetch(url, {
      headers: { "User-Agent": "HolboxAI/1.0 (+https://holbox.ai)" },
      redirect: "follow",
    });
    if (!page.ok)
      return res.status(400).json({ error: `Fetch failed: ${page.status}` });
    const html = await page.text();
    const content = extractText(html);

    // 2) OpenAI client
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    // 3) Schema (documentation in prompt; parsing enforced via json_object)
    const schemaShape = {
      type: "object",
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        summary: { type: "string" },
        key_findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              impact: { type: "string", enum: ["high", "medium", "low"] },
              recommendation: { type: "string" },
            },
            required: ["title", "impact", "recommendation"],
          },
          maxItems: 8,
        },
        quick_wins: { type: "array", items: { type: "string" }, maxItems: 5 },
        risks: { type: "array", items: { type: "string" }, maxItems: 5 },
      },
      required: ["score", "summary", "key_findings", "quick_wins"],
      additionalProperties: false,
    };

    const system = [
      "You are a senior CRO expert.",
      "Analyze landing pages for: above-the-fold clarity, message match, CTA prominence, trust, friction, mobile heuristics.",
      "Return ONLY compact JSON (no prose) matching the provided schema.",
    ].join(" ");

    const userPrompt = [
      `URL: ${url}`,
      `TEXT (truncated):\n${content}`,
      "Use this JSON schema (shape) exactly:",
      JSON.stringify(schemaShape),
      "Rules:",
      "- Score 0..100, integer.",
      "- key_findings: max 8 items; include plain, actionable titles + recommendations.",
      "- quick_wins: 3–5 concise strings.",
      "- Output JSON only.",
    ].join("\n\n");

    // 4) Call Chat Completions with JSON output
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    const text = completion.choices?.[0]?.message?.content || "{}";

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return res
        .status(500)
        .json({ error: "Model returned non-JSON output", raw: text });
    }

    return res.status(200).json({ url, ...data });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
