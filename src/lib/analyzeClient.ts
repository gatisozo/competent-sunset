// src/lib/analyzeClient.ts
import { normalizeUrl } from "../utils/normalizeUrl";
export type AnalyzeResponse =
  | { ok: true; data: any }
  | { ok: false; error: string; code?: string };

export async function runAnalyze(
  input: string,
  signal?: AbortSignal
): Promise<AnalyzeResponse> {
  let s = (input ?? "").trim();
  if (s && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  const url = s;

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
