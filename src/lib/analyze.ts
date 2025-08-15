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
  [k: string]: boolean | undefined;
};

export type FreeReport = {
  page?: { url?: string; title?: string };
  assets?: { screenshot_url?: string | null };
  score?: number; // var nebūt
  sections_detected?: SectionPresence;
  hero?: { suggestions?: Suggestion[] | null };
  next_section?: { name?: string; suggestions?: Suggestion[] | null };
  // Dažos variantos var būt arī kopējie atradumi:
  // findings?: Suggestion[];
};

export type CroReport = FreeReport; // šobrīd pietiek; pilnajam reportam varēsi paplašināt

/** Vienkāršs klienta fetch uz mūsu Vercel API. */
export async function analyzeUrl(
  url: string,
  mode: "free" | "full" = "free"
): Promise<CroReport> {
  const body = JSON.stringify({ url, mode });
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  // API var sūtīt 200 ar kļūdas objektu – normalizējam:
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
