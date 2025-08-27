// api/analyze.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

function normUrl(input: string) {
  /* ... kā iepriekš dotajā v3 ... */
}
function countRe(html: string, re: RegExp) {
  /* ... */
}
async function analyze(url: string) {
  /* ... */
}
async function aiQuickWins(summary: string) {
  /* dynamic import "openai"; supports gpt-5 or chat alias */
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

    let base;
    try {
      base = await analyze(url);
    } catch (err: any) {
      return res
        .status(502)
        .json({ ok: false, error: err?.message || "Fetch failed" });
    }

    let quickWins: Array<{ item: string }> = [];
    try {
      quickWins = await aiQuickWins(/* kopsavilkums */);
    } catch {
      /* neatmetam 500; atgriežam bez AI */
    }

    return res.status(200).json({ ok: true, data: { ...base, quickWins } });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "Internal error" });
  }
}
