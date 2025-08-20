// src/lib/analyzeClient.ts
// Klienta helpers Free reportam (Landing/FreeReport).
// Atgriež { ok: true, data } / { ok: false, error } un nekad nemet SyntaxError,
// ja serveris atbild ar HTML vai citu ne-JSON satura tipu.

export type AnalyzeResponse =
  | { ok: true; data: any }
  | { ok: false; error: string; code?: string };

function normalizeUrl(input: string): string {
  let s = (input ?? "").trim();
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

export async function runAnalyze(
  input: string,
  signal?: AbortSignal
): Promise<AnalyzeResponse> {
  const url = normalizeUrl(input);

  try {
    const r = await fetch(`/api/analyze?url=${encodeURIComponent(url)}`, {
      method: "GET",
      signal,
      headers: {
        accept: "application/json",
        "cache-control": "no-store",
      },
    });

    // mēģinām saprast, vai atbilde vispār ir JSON
    const ctype = r.headers.get("content-type") || "";
    const isJson = ctype.includes("application/json");

    if (!r.ok) {
      // mēģinām izvilkt kļūdas ziņu no JSON, ja tāds ir
      if (isJson) {
        try {
          const j = await r.json();
          const msg =
            j?.error || j?.message || `Analyze failed (HTTP ${r.status})`;
          return { ok: false, error: String(msg) };
        } catch {
          /* fall through */
        }
      }
      // ne-JSON kļūda (piem., Vercel HTML “A server error has occurred”)
      return { ok: false, error: `Analyze failed (HTTP ${r.status})` };
    }

    // 2xx – ja JSON, atgriežam to; citādi kļūda
    if (isJson) {
      const j = await r.json();
      // sagaidām /api/analyze atbildi formā { ok, data?, error? }
      if (j && j.ok) return { ok: true, data: j.data };
      return { ok: false, error: j?.error || "Analyze failed" };
    }

    return { ok: false, error: "Analyze failed: unexpected response type" };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return { ok: false, error: "Request aborted", code: "ABORTED" };
    }
    return { ok: false, error: e?.message || "Network error" };
  }
}

export default { runAnalyze };
