// src/lib/analyze.ts
// Klienta palīgfunkcijas + tipi Free/Full reportiem.
// Nekādu tipu importu no /api/* — viss definēts lokāli.

export type Impact = "low" | "medium" | "high";

export type Suggestion = {
  title: string;
  impact: Impact;
  recommendation: string;
};

export type ContentAuditItem = {
  section: string; // piem.: "Hero", "Value Prop", ...
  present: boolean; // vai sadaļa ir atrodama
  quality: "good" | "poor"; // kvalitātes heuristika
  suggestion?: string; // īss ieteikums
};

export type BacklogItem = {
  title: string;
  impact?: number; // 1..3 (augstāks = lielāks efekts)
  effort_days?: number; // aptuvenais ieguldījums dienās
  eta_days?: number; // paredzamais termiņš
  notes?: string; // detalizēts paskaidrojums
  lift_percent?: number; // ≈+x% leads emblēmai UI pusē
};

export type FullReport = {
  page?: { url?: string; title?: string };
  assets?: { screenshot_url?: string | null };
  screenshots?: { hero?: string | null };
  sections_detected?: Record<
    | "hero"
    | "value_prop"
    | "social_proof"
    | "pricing"
    | "features"
    | "faq"
    | "contact"
    | "footer",
    boolean
  >;
  quick_wins?: string[];
  prioritized_backlog?: BacklogItem[];
  findings?: Suggestion[];
  content_audit?: ContentAuditItem[];

  // papildu lauki bagātināšanai (gan server, gan klienta pusē)
  meta?: any;
  seo?: any;
  images?: any;
  links?: any;
  social?: any;
  robots?: any;
  text_snippets?: string;

  score?: number; // aprēķinātais kopvērtējums (ja serveris dod)
};

/* ───────────────────────── helpers ───────────────────────── */

function normalizeUrl(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`;
}

async function getJson<T = any>(path: string): Promise<T> {
  const r = await fetch(path, { method: "GET" });
  if (!r.ok) {
    // mēģinām nolasīt kļūdas ziņu, ja ir
    let err = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      if (j?.error) err = j.error;
    } catch {}
    throw new Error(err);
  }
  return (await r.json()) as T;
}

/* ─────────────────────── public API ─────────────────────── */

/**
 * Bezmaksas testa analīze (JSON) – izmanto Free reportā.
 * Atgriež tieši to pašu objektu, ko sūta /api/analyze: { ok, data } vai izmet error.
 */
export async function analyzeUrl(url: string, mode: "free" | "full" = "free") {
  const u = normalizeUrl(url);
  if (!u) throw new Error("Missing URL");

  // Free režīmam lietojam /api/analyze
  if (mode === "free") {
    const res = await getJson<{ ok: boolean; data?: any; error?: string }>(
      `/api/analyze?url=${encodeURIComponent(u)}`
    );
    if (!res.ok) throw new Error(res.error || "Analyze failed");
    return res.data;
  }

  // Full režīmā parasti izmanto SSE (/api/analyze-stream) – to apstrādā UI.
  // Šeit tikai atgriežam URL, ja kāds grib šo funkciju izmantot diagnosticēšanai.
  return { url: u };
}

/**
 * Īss alias Landing komponentam. Saglabā saderību ar esošo kodu:
 * atgriež { ok: true, data } vai { ok: false, error }.
 */
export async function runAnalyze(
  url: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const data = await analyzeUrl(url, "free");
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Analyze failed" };
  }
}

/* ─────────────────── noderīgs eksportam ─────────────────── */

export const utils = { normalizeUrl };
