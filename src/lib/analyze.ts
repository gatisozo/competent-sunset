// src/lib/analyze.ts
export type Impact = "high" | "medium" | "low";
export type Effort = "low" | "medium" | "high";

export type SectionPresence = {
  hero?: boolean;
  value_prop?: boolean;
  social_proof?: boolean;
  features?: boolean;
  pricing?: boolean;
  faq?: boolean;
  contact?: boolean;
  footer?: boolean;
};

export type Suggestion = {
  title: string;
  recommendation: string;
  impact: Impact;
};
export type Overlay = { x: number; y: number; w: number; h: number };

export type CroFinding = {
  title: string;
  impact: Impact;
  recommendation: string;
};
export type CroAudit = {
  score: number;
  summary?: string;
  key_findings?: CroFinding[];
  quick_wins?: string[];
  risks?: string[];
};

export type FreeReport = {
  url: string;
  score?: number;
  summary?: string;
  assets?: { screenshot_url?: string | null };
  sections_detected?: SectionPresence;
  hero?: { text?: any; suggestions?: Suggestion[]; overlay?: Overlay | null };
  next_section?: {
    type?: string;
    text?: any;
    suggestions?: Suggestion[];
    overlay?: Overlay | null;
  };
  quick_wins?: string[];
  risks?: string[];
};

export type FullFinding = {
  title: string;
  impact: Impact;
  effort?: Effort;
  owner?: string;
  section?: string;
  recommendation: string;
};

export type FullReport = FreeReport & {
  findings?: FullFinding[];
  prioritized_backlog?: {
    title: string;
    impact: number;
    effort: number;
    eta_days?: number;
  }[];
};

export type CroReport = FreeReport | FullReport;

export async function analyzeUrl(
  url: string,
  mode: "free" | "full" = "free"
): Promise<CroReport> {
  const norm = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: norm(url), mode }),
  });
  if (!res.ok) {
    let msg = `Analyze failed: ${res.status}`;
    try {
      const d = await res.json();
      if (d?.error) msg += ` – ${d.error}`;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as CroReport;
}
