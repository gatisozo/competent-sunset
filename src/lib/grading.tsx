// src/lib/grading.ts
export type Finding = {
  title: string;
  impact?: "high" | "medium" | "low";
  recommendation?: string;
};

export type BacklogItem = {
  title: string;
  impact?: "high" | "medium" | "low";
  effort_days?: number;
  uplift_pct?: number; // e.g. 20 means +20% leads
  note?: string;
};

export type FreeReportNormalized = {
  url?: string;
  score?: number; // 0..100
  structure_pct?: number; // 0..100
  content_pct?: number; // 0..100
  sections_present?: string[];
  sections_missing?: string[];
  quick_wins?: string[];
  prioritized_backlog?: BacklogItem[];
  findings?: Finding[];
  hero_screenshot?: string | null;
};

/** Safe getter helpers */
const arr = (v: any) => (Array.isArray(v) ? v : []);
const num = (v: any, d = 0) => (typeof v === "number" && !isNaN(v) ? v : d);
const str = (v: any, d = "") => (typeof v === "string" ? v : d);

/** Letter grades from score */
export function letterFromScore(score: number): "A" | "B" | "C" | "D" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  return "D";
}

/** Normalize whatever /api/analyze returns into FreeReportNormalized */
export function normalizeFreeReport(input: any): FreeReportNormalized {
  const sections = arr(input?.sections_present || input?.sections || []);
  const totalSections = 8;
  const presentCount = sections.length;
  const structureGuess =
    input?.structure_pct ?? Math.round((presentCount / totalSections) * 100);

  // Try to infer content quality from "findings" (more highs -> lower content)
  const findings = arr(input?.findings || input?.key_findings).map(
    (f: any) => ({
      title: str(f?.title),
      impact: (f?.impact as any) || "medium",
      recommendation: str(f?.recommendation),
    })
  );

  const high = findings.filter((f) => f.impact === "high").length;
  const med = findings.filter((f) => f.impact === "medium").length;
  const baseContent = 82 - high * 10 - med * 4;
  const contentGuess = Math.max(
    40,
    Math.min(96, num(input?.content_pct, baseContent))
  );

  const score =
    typeof input?.score === "number"
      ? input.score
      : Math.round((structureGuess + contentGuess) / 2);

  // Sections missing if provided
  const all = [
    "hero",
    "value prop",
    "social proof",
    "features",
    "pricing",
    "faq",
    "contact",
    "footer",
  ];
  const missing = all.filter((s) => !sections.includes(s));

  // backlog uplift estimate if present
  const backlogRaw = arr(input?.prioritized_backlog || input?.backlog).map(
    (b: any) => ({
      title: str(b?.title || b?.name),
      impact: (b?.impact as any) || "high",
      effort_days: num(b?.effort_days || b?.effort || b?.days, undefined),
      uplift_pct: num(b?.uplift_pct || b?.uplift || b?.gain, undefined),
      note: str(b?.note),
    })
  );

  return {
    url: str(input?.url),
    score,
    structure_pct: structureGuess,
    content_pct: contentGuess,
    sections_present: sections,
    sections_missing: missing,
    quick_wins: arr(input?.quick_wins || input?.wins || []),
    prioritized_backlog: backlogRaw,
    findings,
    hero_screenshot:
      str(input?.hero_screenshot) || input?.screens?.hero || null,
  };
}

/** Select top 3–5 findings by impact (high > medium > low) */
export function topFindings(n: FreeReportNormalized, max = 5): Finding[] {
  const order = { high: 3, medium: 2, low: 1 } as const;
  const list = arr(n.findings)
    .slice()
    .sort((a, b) => {
      const sa = order[a.impact || "medium"] || 2;
      const sb = order[b.impact || "medium"] || 2;
      return sb - sa;
    });
  return list.slice(0, max);
}

/** Estimate cumulative uplift if all quick wins/backlog done */
export function estimateUpliftPct(n: FreeReportNormalized): number {
  const fromBacklog = arr(n.prioritized_backlog)
    .map((b) => num(b.uplift_pct, 0))
    .filter((x) => x > 0);
  const fromWins = arr(n.quick_wins)
    .map(() => 2) // if nav default wins, count ~2% each as placeholder
    .slice(0, 5);

  const total = [...fromBacklog, ...fromWins].reduce((a, b) => a + b, 0);
  // cap to avoid unrealistic numbers
  return Math.max(5, Math.min(40, total || 18));
}
