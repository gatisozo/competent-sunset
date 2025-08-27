// src/lib/analyze.ts
export type Impact = "low" | "med" | "high";

export type Suggestion = {
  id?: string;
  title: string;
  impact: Impact;
  effort?: string;
  estLift?: string; // e.g. "≈ +3% leads"
  hint?: string;
};

export type ContentAuditItem = {
  field: string; // e.g. "Meta description"
  current?: string; // current value/diagnosis
  recommended?: string; // proposed copy/fix
  estLift?: string;
};

export interface FullReport {
  url: string;
  meta: { title?: string; description?: string; canonical?: string };
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
  images: { total: number; missingAlt: number };
  quickWins?: Suggestion[];
  prioritized?: Array<{
    task: string;
    priority: Impact;
    effort?: string;
    estLift?: string;
  }>;
  contentAudit?: ContentAuditItem[];
}
