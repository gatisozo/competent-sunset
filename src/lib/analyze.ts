export type ImpactLevel = "high" | "medium" | "low";

export type Suggestion = {
  title: string;
  impact: ImpactLevel;
  recommendation: string;
};

export type SectionPresence = Record<string, boolean>;

export type BacklogItem = {
  title: string;
  impact: number; // 1..3
  effort: number; // 1..3
  eta_days?: number;
  notes?: string;
};

export type ContentAuditItem = {
  section: string; // "hero" | "value_prop" | ...
  status: "ok" | "weak" | "missing";
  rationale?: string;
  suggestions?: string[];
};

export type FreeReport = {
  score?: number;
  summary?: string;
  key_findings?: Suggestion[];
  quick_wins?: string[];
  risks?: string[];
  sections_detected?: SectionPresence;
  hero?: { suggestions?: Suggestion[] };
  next_section?: { suggestions?: Suggestion[] };
  assets?: { screenshot_url?: string | null };
  url?: string;
};

export type FullReport = {
  score: number;
  summary: string;
  key_findings: Suggestion[];
  quick_wins: string[];
  risks?: string[];
  sections_detected?: SectionPresence;

  findings: Suggestion[];
  prioritized_backlog?: BacklogItem[];
  content_audit?: ContentAuditItem[];

  page?: { url?: string; title?: string };
  assets?: {
    screenshot_url?: string | null;
    suggested_screenshot_url?: string | null;
  };
};

export type CroReport = FreeReport | FullReport;

export async function analyzeUrl(
  url: string,
  mode: "free" | "full" = "free"
): Promise<CroReport> {
  const normalized = normalizeUrl(url);
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: normalized, mode }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Analyze failed: ${res.status} ${text}`);
  }
  return (await res.json()) as CroReport;
}

export function normalizeUrl(input: string): string {
  const s = input.trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}
