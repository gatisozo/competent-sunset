// src/lib/analyze.ts
export type { FullReport, Suggestion, ContentAuditItem, BacklogItem } from "../../api/analyze"; // types reuse (Vite aliases may differ)

export async function analyzeUrl(url: string, mode: "free" | "full" = "free") {
  const q = `/api/analyze?url=${encodeURIComponent(url)}&mode=${mode}`;
  const r = await fetch(q);
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || "Analyze failed");
  return j.data;
}
