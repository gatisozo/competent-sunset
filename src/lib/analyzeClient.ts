// src/lib/analyzeClient.ts
// Klienta helpers Free reportam (Landing/FreeReport).
// Saglabā veco API formu: runAnalyze(url, signal?) -> { ok, data? , error? }

function normalizeUrl(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`;
}

export async function runAnalyze(
  url: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const u = normalizeUrl(url);
    if (!u) throw new Error("Missing URL");

    const r = await fetch(`/api/analyze?url=${encodeURIComponent(u)}`, {
      method: "GET",
      signal,
      headers: { "cache-control": "no-store" },
    });

    // mēģinām nolasīt JSON neatkarīgi no statusa
    let j: any = {};
    try {
      j = await r.json();
    } catch {
      /* ignore */
    }

    if (!r.ok || j?.ok === false) {
      throw new Error(j?.error || `Analyze failed (HTTP ${r.status})`);
    }

    return { ok: true, data: j.data };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return { ok: false, error: "Request aborted" };
    }
    return { ok: false, error: e?.message || "Analyze failed" };
  }
}

export default { runAnalyze };
