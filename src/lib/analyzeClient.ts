// src/lib/analyzeClient.ts
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
    });
    const json = (await r.json()) as AnalyzeResponse;
    return json;
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error" };
  }
}
