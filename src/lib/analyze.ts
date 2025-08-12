export type CroFinding = {
  title: string;
  impact: "high" | "medium" | "low";
  recommendation: string;
};
export type CroAudit = {
  score: number;
  summary: string;
  key_findings: CroFinding[];
  quick_wins: string[];
  risks?: string[];
};

export async function analyzeUrl(url: string): Promise<CroAudit> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Analyze failed: ${res.status}`);
  return (await res.json()) as CroAudit;
}
