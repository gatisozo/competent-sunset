// src/lib/grading.ts
// Minimal, self-contained grading helpers for the Free report on the landing

export type Impact = "high" | "medium" | "low";

export type Finding = {
  title: string;
  impact: Impact;
  recommendation?: string;
  section?: string; // e.g., "hero", "value_prop"
};

export type BacklogItem = {
  title: string;
  impact: Impact;
  eta_days?: number;
  uplift_pct?: number; // if present, we'll use it directly
};

export type SectionsPresent = Record<string, boolean>;

export type FreeReport = {
  score?: number; // overall (0..100) if provided by API
  findings?: Finding[]; // optional in “free” mode
  quick_wins?: string[];
  prioritized_backlog?: BacklogItem[];
  sections_present?: SectionsPresent;
  screenshot_url?: string | null;
};

export type FreeReportNormalized = {
  score: number; // guaranteed
  findings: Finding[];
  quick_wins: string[];
  prioritized_backlog: BacklogItem[];
  sections_present: SectionsPresent;
  screenshot_url?: string | null;

  // derived
  structureScore: number; // 0..100
  contentScore: number; // 0..100
};

// --- Internal weights --------------------------------------------------------

const IMPACT_WEIGHT: Record<Impact, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const DEFAULT_SECTIONS: string[] = [
  "hero",
  "value prop",
  "social proof",
  "features",
  "pricing",
  "faq",
  "contact",
  "footer",
];

// --- Helpers ----------------------------------------------------------------

/** Clamp into [min,max] */
const clamp = (v: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, v));

/** A..F grade from 0..100 */
export function letterFromScore(
  score: number
): "A" | "B" | "C" | "D" | "E" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  if (score >= 50) return "E";
  return "F";
}

/** Picks worst N findings (order: high > medium > low, then by index) */
export function topFindings(findings: Finding[], n = 5): Finding[] {
  return [...findings]
    .sort((a, b) => {
      const wa = IMPACT_WEIGHT[a.impact] ?? 0;
      const wb = IMPACT_WEIGHT[b.impact] ?? 0;
      return wb - wa;
    })
    .slice(0, n);
}

/** Naive uplift estimator if items don't carry explicit `uplift_pct`. */
function estimateUpliftForItem(item: BacklogItem): number {
  if (typeof item.uplift_pct === "number") return item.uplift_pct;
  const base = { high: 12, medium: 6, low: 3 }[item.impact] ?? 3;
  // small ETA adjustment, shorter is better
  const eta = item.eta_days ?? 3;
  const etaAdj = eta <= 2 ? 1.2 : eta <= 5 ? 1.0 : 0.8;
  return Math.round(base * etaAdj);
}

/** Aggregate potential uplift for the short list (cap at 35% to be conservative). */
export function estimateUpliftPct(backlog: BacklogItem[], cap = 35): number {
  const sum = backlog
    .slice(0, 5)
    .reduce((acc, it) => acc + estimateUpliftForItem(it), 0);
  return clamp(sum, 0, cap);
}

/** Normalizes a possibly sparse “free” report and derives content/structure scores. */
export function normalizeFreeReport(
  r: Partial<FreeReport>
): FreeReportNormalized {
  const findings = Array.isArray(r.findings) ? r.findings : [];
  const quick_wins = Array.isArray(r.quick_wins) ? r.quick_wins : [];
  const prioritized_backlog = Array.isArray(r.prioritized_backlog)
    ? r.prioritized_backlog
    : [];
  const sections_present: SectionsPresent = {
    ...DEFAULT_SECTIONS.reduce(
      (m, k) => ((m[k] = false), m),
      {} as SectionsPresent
    ),
    ...(r.sections_present || {}),
  };

  // structure score from section coverage
  const presentCount = DEFAULT_SECTIONS.reduce(
    (acc, key) => acc + (sections_present[key] ? 1 : 0),
    0
  );
  const structureScore = Math.round(
    (presentCount / DEFAULT_SECTIONS.length) * 100
  );

  // content score from finding severities (less severe => higher score)
  const maxPenalty = findings.length * IMPACT_WEIGHT.high; // worst case: all HIGH
  const actualPenalty = findings.reduce(
    (acc, f) => acc + (IMPACT_WEIGHT[f.impact] ?? 0),
    0
  );
  const contentScore =
    maxPenalty === 0
      ? 100
      : clamp(100 - Math.round((actualPenalty / maxPenalty) * 100));

  // overall score: if backend gave one, prefer it; otherwise combine asss
  const score =
    typeof r.score === "number"
      ? clamp(r.score)
      : clamp(Math.round(0.55 * structureScore + 0.45 * contentScore));

  return {
    score,
    findings,
    quick_wins,
    prioritized_backlog,
    sections_present,
    screenshot_url: r.screenshot_url ?? null,
    structureScore,
    contentScore,
  };
}
