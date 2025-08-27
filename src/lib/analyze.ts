// src/lib/analyze.ts
// PURE TYPE FILE for the frontend – no server-only imports here.

// Impact level (pieļaujam arī "medium", jo sample.ts to lieto)
export type Impact = "low" | "med" | "medium" | "high";

// Viena ieteikuma ieraksts (sample.ts izmanto arī `recommendation`)
export type Suggestion = {
  id?: string;
  title: string;
  impact: Impact; // "low" | "medium" | "high"
  effort?: string; // piem., "low", "2–4h", "dev + copy"
  estLift?: string; // piem., "≈ +3% leads"
  recommendation?: string;
  hint?: string;
};

// Content audit ieraksts (sample.ts pievieno `present` un `section`)
export type ContentAuditItem = {
  section?: string; // piem., "Hero", "Pricing"
  field: string; // piem., "Meta description"
  present?: boolean | "yes" | "no"; // sample.ts izmanto "present"
  current?: string; // pašreizējā vērtība/diagnoze
  recommended?: string; // ieteiktais labojums/teksts
  estLift?: string; // pēc izvēles, ietekmes piezīme
};

// Dažkārt sample.ts ieliek objektu { url, title } "page" laukā
export type PageRef = string | { url: string; title: string };

export interface FullReport {
  page?: PageRef; // <-- pieļauj gan string, gan {url,title}
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
    priority: Impact;
    effort?: string;
    estLift?: string;
  }>;

  contentAudit?: ContentAuditItem[];
}
