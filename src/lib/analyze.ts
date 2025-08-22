/** Shared types for free/full reports + single client function to call the API */

export type Impact = "high" | "medium" | "low";

export type Suggestion = {
  title: string;
  impact: Impact;
  recommendation: string;
};

export type SectionPresence = {
  hero?: boolean;
  value_prop?: boolean;
  social_proof?: boolean;
  features?: boolean;
  pricing?: boolean;
  faq?: boolean;
  contact?: boolean;
  footer?: boolean;
  // allow extra flags without TS errors
  [k: string]: boolean | undefined;
};

export type FreeReport = {
  page?: { url?: string; title?: string };
  assets?: { screenshot_url?: string | null };
  score?: number; // may be missing on free
  sections_detected?: SectionPresence;
  hero?: { suggestions?: Suggestion[] | null };
  next_section?: { name?: string; suggestions?: Suggestion[] | null };
  // some API versions may attach aggregated suggestions:
  findings?: Suggestion[];
  // allow extra fields
  [k: string]: any;
};

/** Content audit row for full report (and we reuse a subset in free UI too) */
export type ContentAuditItem = {
  section: string; // e.g., "hero", "value_prop"
  present: boolean;
  quality?: "good" | "ok" | "poor";
  suggestion?: string; // short copy hint
};

/** Backlog item used in full report */
export type BacklogItem = {
  title: string;
  impact: Impact;
  effort_days: number; // estimation for dev/design
  eta_days: number; // suggested timeframe
  lift_percent: number; // +X% leads estimate
};

/** Full report extends free with more structure */
export type FullReport = FreeReport & {
  quick_wins?: string[];
  content_audit?: ContentAuditItem[];
  prioritized_backlog?: BacklogItem[];
  screenshots?: {
    hero?: string | null;
    sections?: Record<string, string | null>;
  };
};

export type CroReport = FreeReport | FullReport;

/** Single client function (free or full) */
export async function analyzeUrl(
  url: string,
  mode: "free" | "full" = "free"
): Promise<CroReport> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, mode }),
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Analyze failed: ${res.status}`);
  }
  if (!res.ok || json?.error) {
    const msg =
      typeof json?.error === "string"
        ? json.error
        : json?.error?.message || `Analyze failed: ${res.status}`;
    throw new Error(msg);
  }
  return json as CroReport;
}
