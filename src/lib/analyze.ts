// src/lib/analyze.ts
// PURE TYPE FILE for the frontend – no server-only imports here.

//
// Impact level used across suggestions/backlog.
// Support both "med" and "medium", because sample.ts uses "medium".
//
export type Impact = "low" | "med" | "medium" | "high";

//
// A single actionable suggestion item.
//
export type Suggestion = {
  id?: string;
  title: string;
  impact: Impact; // e.g. "low" | "medium" | "high"
  effort?: string; // e.g. "low", "2–4h", "dev + copy"
  estLift?: string; // e.g. "≈ +3% leads"
  recommendation?: string; // sample.ts uses this field
  hint?: string;
};

//
// Content audit line item (used by sample.ts).
//
export type ContentAuditItem = {
  section?: string; // sample.ts provides a section name (e.g. "Hero", "Pricing")
  field: string; // e.g. "Meta description"
  current?: string; // current value/diagnosis
  recommended?: string; // proposed copy/fix
  estLift?: string; // optional impact note
};

//
// The overall Full Report shape used by the UI and sample.ts.
//
export interface FullReport {
  page?: string; // sample.ts sometimes passes a 'page' label
  url: string;

  meta: {
    title?: string;
    description?: string;
    canonical?: string;
  };

  seo: {
    h1Count: number;
    h2Count: number;
    h3Count: number;
    canonicalPresent: boolean;
    metaDescriptionPresent: boolean;
  };

  social: {
    og: Record<string, string | undefined>;
    twitter: Record<string, string | undefined>;
  };

  images: {
    total: number;
    missingAlt: number;
  };

  quickWins?: Suggestion[];

  prioritized?: Array<{
    task: string;
    priority: Impact; // keep Impact here for consistency
    effort?: string;
    estLift?: string;
  }>;

  contentAudit?: ContentAuditItem[];
}
