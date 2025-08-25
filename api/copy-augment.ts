// api/copy-augment.ts
// POST { url: string, meta?: { title?: string; description?: string } }
// -> { ok: true, rows: { field, current, recommended, priority, lift_percent }[] }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const UA = "Mozilla/5.0 (compatible; HolboxAudit/1.1; +https://example.com)";

async function fetchHtml(u: string): Promise<string> {
  const resp = await fetch(u, { headers: { "user-agent": UA } });
  if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`);
  return await resp.text();
}
function normalizeUrl(u: string) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`;
}
function stripTags(s: string) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
    const { url, meta } = (req.body || {}) as {
      url?: string;
      meta?: { title?: string; description?: string };
    };
    const target = normalizeUrl(url || "");
    if (!target) {
      res.status(400).json({ ok: false, error: "Missing url" });
      return;
    }

    let html = "";
    try {
      html = await fetchHtml(target);
    } catch (e: any) {
      // ja nevar nolasīt HTML, strādāsim tikai ar meta
      html = "";
    }
    const text = stripTags(html).slice(0, 16000); // pietiekami kontekstam

    const client = new OpenAI({ apiKey });
    const sys =
      "You are a senior conversion copywriter. Return ONLY valid JSON; no commentary, no markdown.";

    const user = {
      instruction:
        "From the landing page content and meta, propose 3–5 additional copy improvements focused on: features section, value proposition, and non-selling headings.",
      language_hint:
        "Write in the detected site language (if Latvian, write Latvian). Keep copy concise and natural.",
      required_shape:
        "Return an array of objects with keys: field, current, recommended, priority, lift_percent. " +
        "priority in {low, med, high}. lift_percent is an integer estimate (0..12).",
      context: {
        url: target,
        meta_title: meta?.title || "",
        meta_description: meta?.description || "",
        extracted_text_snippet: text.slice(0, 4000),
      },
      examples: [
        {
          field: "Features section",
          current: "Nav atrasts",
          recommended:
            "3–5 īsi punkti, katrs sākas ar darbības vārdu un sasaista funkciju ar ieguvumu.",
          priority: "med",
          lift_percent: 4,
        },
        {
          field: "Value proposition",
          current: "Nav skaidrs, ko tieši iegūst lietotājs",
          recommended:
            "Viena skaidra frāze: ko dod produkts, kam, un kāds ir rezultāts (benefits-first).",
          priority: "high",
          lift_percent: 6,
        },
        {
          field: "H2 heading",
          current: "Par mums",
          recommended:
            "Kāpēc klientiem rūp — īss solījums ar konkrētu iznākumu (nozīmīgāks nekā “Par mums”).",
          priority: "low",
          lift_percent: 2,
        },
      ],
    };

    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: JSON.stringify(user) },
      ],
      response_format: { type: "json_object" },
    });

    const raw = resp.choices?.[0]?.message?.content?.trim() || "{}";
    // gaidām objektu ar { items: [...] } VAI tieši masīvu; atbalstām abus
    let rows: any[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) rows = parsed;
      else if (Array.isArray(parsed.items)) rows = parsed.items;
      else if (Array.isArray(parsed.rows)) rows = parsed.rows;
      else if (Array.isArray(parsed.suggestions)) rows = parsed.suggestions;
    } catch {
      rows = [];
    }

    // sanitizācija
    const out = rows
      .map((x) => {
        const field = (x.field || "").toString().trim() || "Copy";
        const current = (x.current || "").toString().trim() || "Nav atrasts";
        const recommended = (x.recommended || "").toString().trim();
        let priority = (x.priority || "med").toString().toLowerCase();
        if (priority === "medium") priority = "med";
        let lift = Number.isFinite(x.lift_percent)
          ? Number(x.lift_percent)
          : undefined;
        if (typeof lift === "number") {
          if (lift < 0) lift = 0;
          if (lift > 12) lift = 12;
        }
        return { field, current, recommended, priority, lift_percent: lift };
      })
      .filter((r) => r.recommended);

    res.status(200).json({ ok: true, rows: out.slice(0, 5) });
  } catch (e: any) {
    res
      .status(500)
      .json({ ok: false, error: e?.message || "AI augmentation failed" });
  }
}
