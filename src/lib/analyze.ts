// src/lib/analyze.ts

/** ----------------- Types ----------------- */
export type ImpactLevel = "high" | "medium" | "low";

export type Suggestion = {
  title: string;
  impact: ImpactLevel;
  recommendation: string;
};

export type SectionPresence = Record<string, boolean>;

export type BacklogItem = {
  title: string;
  impact: number; // 1..3 (higher = bigger impact)
  effort: number; // 1..3 (higher = more effort)
  eta_days?: number;
  notes?: string;
};

export type ContentAuditItem = {
  section: string; // e.g., "hero" | "value_prop" | "social_proof" | ...
  status: "ok" | "weak" | "missing";
  rationale?: string;
  suggestions?: string[];
};

/** Minimal/free report (what the landing shows without email) */
export type FreeReport = {
  score?: number;
  summary?: string;
  key_findings?: Suggestion[];
  quick_wins?: string[];
  risks?: string[];
  sections_detected?: SectionPresence;

  // lightweight copy hints for UI
  hero?: { suggestions?: Suggestion[] };
  next_section?: { suggestions?: Suggestion[] };

  // assets + url fallback
  assets?: { screenshot_url?: string | null };
  url?: string;
};

/** Full report (after purchase/dev shortcut) */
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

/** ----------------- Helpers ----------------- */
export function normalizeUrl(input: string): string {
  const s = (input || "").trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

/** ----------------- API Client ----------------- */
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

  // Read as text first so HTML error pages don’t crash .json()
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON; surface the raw body for debugging
    throw new Error(`Analyze failed: ${res.status} ${text}`);
  }

  if (!res.ok) {
    // Server already sent JSON error; include it verbatim
    throw new Error(`Analyze failed: ${res.status} ${JSON.stringify(json)}`);
  }

  return json as CroReport;
}
