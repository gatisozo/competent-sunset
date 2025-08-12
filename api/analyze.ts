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

    const page = await fetch(url, {
      headers: { "User-Agent": "HolboxAI/1.0 (+https://holbox.ai)" },
      redirect: "follow",
    });
    if (!page.ok)
      return res.status(400).json({ error: `Fetch failed: ${page.status}` });
    const html = await page.text();

    const content = extractText(html);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `You are a CRO expert. Analyze landing pages for conversion best practices (above-the-fold clarity, message match, CTA prominence, trust, friction, mobile heuristics, Core Web Vitals hints from copy/markup). Output STRICT JSON according to the schema.`;

    const user = {
      role: "user",
      content: [
        { type: "text", text: `URL: ${url}` },
        { type: "text", text: `TEXT (truncated):\n${content}` },
      ],
    } as const;

    const schema = {
      name: "cro_audit",
      schema: {
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
      },
      strict: true,
    } as const;

    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        user,
        {
          role: "user",
          content: [
            { type: "text", text: "Return JSON only that matches the schema." },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: schema },
      max_output_tokens: 1200,
    });

    // @ts-ignore - helper to extract text across SDK versions
    const text =
      resp.output_text ||
      JSON.stringify(resp.output?.[0]?.content?.[0]?.text || resp);

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: "Invalid JSON from model", raw: text };
    }

    return res.status(200).json({ url, ...data });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
