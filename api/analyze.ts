// src/lib/analyze.ts
// ✅ Lokāli tipi + klienta palīgi Full/Free reportam.
// ❌ Nekādus importus no /api/* te nevajag (tie nav TypeScript moduļi).

export type Impact = "low" | "medium" | "high";

export type Suggestion = {
  title: string;
  impact: Impact;
  recommendation: string;
};

export type ContentAuditItem = {
  section: string; // "Hero", "Value Prop", ...
  present: boolean;
  quality: "good" | "poor";
  suggestion?: string;
};

export type BacklogItem = {
  title: string;
  impact?: number; // 1..3
  effort_days?: number;
  eta_days?: number;
  notes?: string;
  lift_percent?: number; // ≈ +x% leads emblēmai
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

  // bagātināšanas lauki
  meta?: any;
  seo?: any;
  images?: any;
  links?: any;
  social?: any;
  robots?: any;
  text_snippets?: string;

  score?: number;
};

/* ───────────────── helpers ───────────────── */

function normalizeUrl(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`;
}

async function getJson<T = any>(path: string): Promise<T> {
  const r = await fetch(path, { method: "GET" });
  if (!r.ok) {
    let err = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      if (j?.error) err = j.error;
    } catch {}
    throw new Error(err);
  }
  return (await r.json()) as T;
}

/* ─────────────── publiskās funkcijas ─────────────── */

/**
 * Bezmaksas analīze (izmanto Free reportā, ja vajag).
 * Atgriež to pašu struktūru, ko sūta /api/analyze: { ok, data }.
 */
export async function analyzeUrl(url: string, mode: "free" | "full" = "free") {
  const u = normalizeUrl(url);
  if (!u) throw new Error("Missing URL");

  if (mode === "free") {
    const res = await getJson<{ ok: boolean; data?: any; error?: string }>(
      `/api/analyze?url=${encodeURIComponent(u)}`
    );
    if (!res.ok) throw new Error(res.error || "Analyze failed");
    return res.data;
  }

  // Full režīmu parasti lasām ar SSE /api/analyze-stream (UI pusē).
  return { url: u };
}

/**
 * Saderīgs alias (dažviet projektā tiek saukts runAnalyze).
 * Atgriež { ok: true, data } vai { ok: false, error }.
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

/* ─────────────── noderīgs eksports ─────────────── */
export const utils = { normalizeUrl };
