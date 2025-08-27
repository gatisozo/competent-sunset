// src/lib/analyzeClient.ts
export async function runAnalyze(url: string) {
  try {
    const res = await fetch(`/api/analyze?url=${encodeURIComponent(url)}`, {
      method: "GET",
    });
    const data = await res.json();
    return data;
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}
