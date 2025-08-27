// api/analyze.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

function normUrl(input: string) {
  let s = (input || "").trim();
  if (!s) return "";
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}
function countRe(html: string, re: RegExp) {
  return (html.match(re) || []).length;
}

async function analyze(url: string) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`Fetch failed: ${r.status} ${r.statusText}`);
  const html = await r.text();

  const title =
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || "";
  const metaDesc =
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(
      html
    )?.[1] || "";
  const canonical =
    /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(
      html
    )?.[1] || "";

  const h1Count = countRe(html, /<h1\b[^>]*>/gi);
  const h2Count = countRe(html, /<h2\b[^>]*>/gi);
  const h3Count = countRe(html, /<h3\b[^>]*>/gi);

  const og = Object.fromEntries(
    Array.from(
      html.matchAll(
        /<meta[^>]+property=["']og:([^"']+)["'][^>]*content=["']([^"']+)["']/gi
      )
    ).map((m) => [m[1], m[2]])
  );
  const twitter = Object.fromEntries(
    Array.from(
      html.matchAll(
        /<meta[^>]+name=["']twitter:([^"']+)["'][^>]*content=["']([^"']+)["']/gi
      )
    ).map((m) => [m[1], m[2]])
  );

  const imagesTotal = countRe(html, /<img\b[^>]*>/gi);
  const imagesMissingAlt = countRe(html, /<img\b(?![^>]*\balt=)[^>]*>/gi);

  return {
    url,
    meta: { title, description: metaDesc, canonical },
    seo: {
      h1Count,
      h2Count,
      h3Count,
      canonicalPresent: !!canonical,
      metaDescriptionPresent: !!metaDesc,
    },
    social: { og, twitter },
    images: { total: imagesTotal, missingAlt: imagesMissingAlt },
  };
}

async function aiQuickWins(summary: string) {
  if (!process.env.OPENAI_API_KEY || process.env.USE_OPENAI !== "1") return [];
  const model = process.env.OPENAI_MODEL || "gpt-5";

  // Dynamic import to avoid ESM/CJS conflicts
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const useChat = /chat/i.test(model);
  let text = "";
  if (useChat) {
    const resp = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a CRO/SEO analyst. Return 3–5 quick wins in plain business language with a rough lift %.",
        },
        { role: "user", content: summary },
      ],
      temperature: 0.3,
    });
    text = resp.choices?.[0]?.message?.content ?? "";
  } else {
    const resp = await client.responses.create({
      model,
      input: summary,
      instructions:
        "You are a CRO/SEO analyst. Return 3–5 quick wins in plain business language with a rough lift %.",
    });
    // Convenience helper to collect the text
    // @ts-ignore
    text = (resp as any).output_text ?? "";
  }
  return text
    .split("\n")
    .map((s) => s.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((item) => ({ item }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const urlParam =
      (req.query.url as string) || (req.body && (req.body as any).url);
    const url = normUrl(urlParam || "");
    if (!url)
      return res
        .status(400)
        .json({ ok: false, error: "Missing or invalid url" });

    // Base analysis must never crash the function
    let base;
    try {
      base = await analyze(url);
    } catch (err: any) {
      return res
        .status(502)
        .json({ ok: false, error: err?.message || "Fetch failed" });
    }

    // AI step is optional; swallow errors and still return base results
    let quickWins: Array<{ item: string }> = [];
    try {
      quickWins = await aiQuickWins(
        [
          `URL: ${url}`,
          `Title: ${base.meta.title || "(none)"}`,
          `Meta description: ${
            base.seo.metaDescriptionPresent ? "present" : "missing"
          }`,
          `H1/H2/H3: ${base.seo.h1Count}/${base.seo.h2Count}/${base.seo.h3Count}`,
          `OG tags: ${Object.keys(base.social.og).length}, Twitter tags: ${
            Object.keys(base.social.twitter).length
          }`,
          `Images: total=${base.images.total}, missingAlt=${base.images.missingAlt}`,
        ].join("\n")
      );
    } catch {
      /* ignore AI failure */
    }

    return res.status(200).json({ ok: true, data: { ...base, quickWins } });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "Internal error" });
  }
}
