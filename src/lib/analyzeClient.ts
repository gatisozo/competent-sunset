// src/lib/analyzeClient.ts
function normalizeUrl(input: string): string {
  let s = (input || "").trim();
  if (!s) return s;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol)) throw new Error();
    u.hash = "";
    return u.toString();
  } catch {
    return s;
  }
}

export type AnalyzeOk = { ok: true; data: any };
export type AnalyzeErr = { ok: false; error: string };
export type AnalyzeResult = AnalyzeOk | AnalyzeErr;

/**
 * Free report analīze no galvenās lapas (Landing).
 * Backend: /api/analyze — jāatstāj neskarts; te tikai noturīga klienta apstrāde.
 */
export async function runAnalyze(inputUrl: string): Promise<AnalyzeResult> {
  const url = normalizeUrl(inputUrl);
  if (!url) return { ok: false, error: "Empty URL" };

  const endpoint = `/api/analyze?url=${encodeURIComponent(url)}&mode=free`;

  try {
    const r = await fetch(endpoint, { method: "GET" });
    const text = await r.text();

    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        const j = JSON.parse(text);
        msg = j?.error || j?.message || msg;
      } catch {
        // teksta kļūdas no Vercel edge – atstājam kā ir
        msg = text || msg;
      }
      return { ok: false, error: msg };
    }

    try {
      const data = JSON.parse(text);
      return { ok: true, data };
    } catch {
      return { ok: false, error: "Invalid JSON from /api/analyze" };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}
