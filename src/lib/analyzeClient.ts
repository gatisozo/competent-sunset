// src/lib/analyzeClient.ts
// Klienta helpers Free reportam (Landing/FreeReport).
// Atgriež { ok: true, data } / { ok: false, error } un nekrīt,
// ja serveris atbild ar HTML (Vercel 500 u.c.)

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

    const ctype = r.headers.get("content-type") || "";
    const isJson = ctype.includes("application/json");

    if (!r.ok) {
      if (isJson) {
        try {
          const j = await r.json();
          return {
            ok: false,
            error: String(j?.error || `Analyze failed (HTTP ${r.status})`),
          };
        } catch {
          /* ignore */
        }
      }
      return { ok: false, error: `Analyze failed (HTTP ${r.status})` };
    }

    if (!isJson) {
      return { ok: false, error: "Analyze failed: unexpected response type" };
    }

    const j = await r.json();
    if (j && j.ok) return { ok: true, data: j.data };
    return { ok: false, error: j?.error || "Analyze failed" };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return { ok: false, error: "Request aborted", code: "ABORTED" };
    }
    return { ok: false, error: e?.message || "Network error" };
  }
}

export default { runAnalyze };
