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

function setLastAnalyzedUrl(u: string) {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(LAST_KEY, u);
    }
  } catch {}
}

export type AnalyzeOk = { ok: true; data: any };
export type AnalyzeErr = { ok: false; error: string };
export type AnalyzeResult = AnalyzeOk | AnalyzeErr;

/**
 * Free report klients:
 * 1) mēģina POST /api/analyze { url, mode:"free" }
 * 2) ja 405/404 vai tīkls krīt — GET fallback uz /api/analyze?url=...&mode=free
 */
export async function runAnalyze(inputUrl: string): Promise<AnalyzeResult> {
  const url = normalizeUrl(inputUrl);
  if (!url) return { ok: false, error: "Empty URL" };

  // --- 1) POST ---
  try {
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, mode: "free" }),
    });
    const text = await r.text();

    if (r.ok) {
      try {
        const data = JSON.parse(text);
        const last = data?.finalUrl || data?.url || url;
        if (last) setLastAnalyzedUrl(last);
        return { ok: true, data };
      } catch {
        return { ok: false, error: "Invalid JSON from /api/analyze" };
      }
    }

    if (r.status !== 405 && r.status !== 404) {
      try {
        const j = JSON.parse(text);
        return {
          ok: false,
          error: j?.error || j?.message || `HTTP ${r.status}`,
        };
      } catch {
        return { ok: false, error: text || `HTTP ${r.status}` };
      }
    }
    // 405/404 → turpinām ar GET fallback
  } catch {
    // tīkla kļūda → mēģinām GET
  }

  // --- 2) GET fallback ---
  try {
    const r2 = await fetch(
      `/api/analyze?url=${encodeURIComponent(url)}&mode=free`,
      {
        method: "GET",
      }
    );
    const text2 = await r2.text();

    if (!r2.ok) {
      try {
        const j = JSON.parse(text2);
        return {
          ok: false,
          error: j?.error || j?.message || `HTTP ${r2.status}`,
        };
      } catch {
        return { ok: false, error: text2 || `HTTP ${r2.status}` };
      }
    }

    try {
      const data = JSON.parse(text2);
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
