// src/lib/analyzeClient.ts
const LAST_KEY = "holbox:lastAnalyzedUrl";

function normalizeUrl(input: string): string {
  let s = (input || "").trim();
  if (!s) return s;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    u.hash = "";
    return u.toString();
  } catch {
    return s;
  }
}

export function setLastAnalyzedUrl(u: string) {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(LAST_KEY, u);
    }
  } catch {}
}

export function getLastAnalyzedUrl(): string | null {
  try {
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage.getItem(LAST_KEY);
    }
  } catch {}
  return null;
}

export type AnalyzeOk = { ok: true; data: any };
export type AnalyzeErr = { ok: false; error: string };
export type AnalyzeResult = AnalyzeOk | AnalyzeErr;

/**
 * Free report analīze no galvenās lapas (Landing).
 * Backend: /api/analyze — paliek tāds pats, te tikai noturīga klienta apstrāde.
 */
export async function runAnalyze(inputUrl: string): Promise<AnalyzeResult> {
  const url = normalizeUrl(inputUrl);
  if (!url) return { ok: false, error: "Empty URL" };

  const endpoint = `/api/analyze?url=${encodeURIComponent(url)}&mode=free`;

  try {
    const r = await fetch(endpoint, { method: "GET" });
    const text = await r.text();

    if (!r.ok) {
      // mēģinām izvilkt kļūdas ziņu no JSON; ja ne – atstājam tekstu
      let msg = `HTTP ${r.status}`;
      try {
        const j = JSON.parse(text);
        msg = j?.error || j?.message || msg;
      } catch {
        msg = text || msg;
      }
      return { ok: false, error: msg };
    }

    // veiksmīgs gadījums – jābūt JSON
    try {
      const data = JSON.parse(text);

      // saglabājam pēdējo URL — izmanto Order Full Audit
      const last = data?.finalUrl || data?.url || url;
      if (last) setLastAnalyzedUrl(last);

      return { ok: true, data };
    } catch {
      return { ok: false, error: "Invalid JSON from /api/analyze" };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}
