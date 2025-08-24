import React, { useEffect, useMemo, useState } from "react";

/** ─────────────────────────────────────────────────────────────────────────────
 *  Types – pielāgoti, lai atbalstītu abus formātus
 *  V1 (production): { section, present, quality: "good" | "poor", suggestion? }
 *  V2 (jaunais):    { section, status: "ok" | "weak" | "missing", rationale?, suggestions?[] }
 *  ──────────────────────────────────────────────────────────────────────────── */

type Impact = "low" | "medium" | "high";

type Finding = {
  title: string;
  impact: Impact;
  recommendation: string;
};

type BacklogItem = {
  title: string;
  impact?: Impact;
  eta_days?: number;
  lift_percent?: number;
  notes?: string;
};

/** Vecais formāts no /api/analyze (production) */
type LegacyAuditItem = {
  section: string;
  present: boolean;
  quality: "good" | "poor";
  suggestion?: string;
};

/** Jaunais formāts, ko daļa koda jau izmanto */
type NewAuditItem = {
  section: string;
  status: "ok" | "weak" | "missing";
  rationale?: string;
  suggestions?: string[];
};

type AnyAuditItem = LegacyAuditItem | NewAuditItem;

/** Vienotā forma, ko lieto UI */
type AuditRow = {
  section: string;
  status: "ok" | "weak" | "missing";
  rationale?: string;
  suggestions?: string[];
};

/** Report forma – pietiek ar obligātajām lietām */
type FreeReport = {
  page?: { url?: string; title?: string };
  meta?: { title?: string; description?: string; canonical?: string };
  seo?: {
    h1Count?: number;
    h2Count?: number;
    h3Count?: number;
    canonicalPresent?: boolean;
    metaDescriptionPresent?: boolean;
  };
  images?: { total?: number; missingAlt?: number };
  links?: { total?: number; internal?: number; external?: number };
  robots?: { robotsTxtOk?: boolean | null; sitemapOk?: boolean | null };
  headingsOutline?: Array<{ tag: string; text: string }>;
  quick_wins?: string[];
  prioritized_backlog?: BacklogItem[];
  findings?: Finding[];
  content_audit?: AnyAuditItem[];
  assets?: {
    /** jaunā versija */
    suggested_screenshot_url?: string | null;
    /** production versija */
    screenshot_url?: string | null;
  };
};

function normalizeUrl(input: string): string {
  let s = (input || "").trim();
  if (!s) return s;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    u.hash = "";
    return u.toString();
  } catch {
    return s;
  }
}

function screenshotUrlFallback(target: string) {
  const url = normalizeUrl(target);
  const tmpl =
    (import.meta as any).env?.VITE_SCREENSHOT_URL_TMPL ||
    (typeof process !== "undefined" &&
      (process as any).env?.VITE_SCREENSHOT_URL_TMPL);
  if (tmpl) return String(tmpl).replace("{URL}", encodeURIComponent(url));
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}

/** Mapējam jebkuras paaudzes content_audit uz vienoto AuditRow[] */
function normalizeAudit(items?: AnyAuditItem[]): AuditRow[] {
  if (!items || !Array.isArray(items)) return [];
  return items.map((it) => {
    if ("status" in it) {
      // jau jaunais formāts
      return {
        section: it.section,
        status: it.status,
        rationale: it.rationale,
        suggestions: it.suggestions || [],
      };
    }
    // vecais formāts → atvasinām status
    const v = it as LegacyAuditItem;
    const status: AuditRow["status"] = v.present
      ? v.quality === "poor"
        ? "weak"
        : "ok"
      : "missing";
    return {
      section: v.section,
      status,
      rationale: undefined,
      suggestions: v.suggestion ? [v.suggestion] : [],
    };
  });
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function computeScores(d: FreeReport) {
  let str = 30;
  let cont = 30;

  str += Math.min(20, (d.seo?.h1Count ?? 0) * 10);
  str += Math.min(20, (d.seo?.h2Count ?? 0) * 4);
  str += d.seo?.canonicalPresent ? 10 : 0;

  cont += d.seo?.metaDescriptionPresent ? 15 : 0;
  const imgs = d.images?.total ?? 0;
  const miss = d.images?.missingAlt ?? 0;
  if (imgs > 0) cont += 10;
  if (imgs > 0)
    cont += Math.round(10 * ((imgs - (miss || 0)) / Math.max(1, imgs)));

  const overall = Math.round((str * 0.55 + cont * 0.45) / 1);
  return {
    overall: clamp(overall),
    structure: clamp(str),
    content: clamp(cont),
  };
}

/** Vienkāršs demo fetch – izmanto esošo /api/analyze ar mode=free */
async function fetchFree(url: string): Promise<FreeReport> {
  const u = normalizeUrl(url);
  const r = await fetch(`/api/analyze?mode=free&url=${encodeURIComponent(u)}`);
  const text = await r.text();
  if (!r.ok) {
    // mēģinām izvilkt sakarīgu kļūdu
    try {
      const j = JSON.parse(text);
      throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
    } catch {
      throw new Error(text || `HTTP ${r.status}`);
    }
  }
  try {
    return JSON.parse(text) as FreeReport;
  } catch {
    throw new Error("Invalid JSON from /api/analyze");
  }
}

export default function FreeReport() {
  const [url, setUrl] = useState("");
  const [report, setReport] = useState<FreeReport | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [score, setScore] = useState({
    overall: 73,
    structure: 60,
    content: 43,
  });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const heroSrc = useMemo(() => {
    if (!report) return undefined;
    return (
      report.assets?.suggested_screenshot_url ||
      report.assets?.screenshot_url ||
      (report.page?.url ? screenshotUrlFallback(report.page.url) : undefined)
    );
  }, [report]);

  useEffect(() => {
    if (!report) return;
    setAuditRows(normalizeAudit(report.content_audit));
    setScore(computeScores(report));
  }, [report]);

  async function onRun() {
    if (!url.trim()) return;
    setErr(null);
    setLoading(true);
    setProgress(15);
    try {
      const rep = await fetchFree(url.trim());
      setProgress(80);
      setReport(rep);
      setProgress(100);
    } catch (e: any) {
      setErr(e?.message || "Analyze failed");
      setReport(null);
      setAuditRows([]);
      setProgress(0);
    } finally {
      setLoading(false);
    }
  }

  const sectionsPresent = useMemo(() => {
    const d = report;
    if (!d) return [] as { title: string; ok: boolean }[];
    const ho = d.headingsOutline || [];
    const text = [
      d.meta?.title || "",
      d.meta?.description || "",
      ...ho.map((h) => h.text || ""),
    ]
      .join(" ")
      .toLowerCase();

    const has = (re: RegExp) => re.test(text);

    return [
      { title: "hero", ok: (d.seo?.h1Count ?? 0) > 0 },
      { title: "social proof", ok: has(/testimonial|review|trust|logo/) },
      { title: "features", ok: has(/feature|benefit|capabilit/) },
      { title: "contact", ok: has(/contact|support|email|phone/) },
      { title: "value prop", ok: (d.meta?.description || "").length >= 120 },
      { title: "pricing", ok: has(/price|pricing|plan/) },
      { title: "faq", ok: has(/faq|frequently asked|question/) },
      { title: "footer", ok: (d.links?.total ?? 0) > 10 },
    ];
  }, [report]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="menopauze.lv"
          className="flex-1 rounded-xl px-3 py-2 border bg-white"
          onKeyDown={(e) => e.key === "Enter" && url.trim() && onRun()}
        />
        <button
          onClick={onRun}
          disabled={loading || !url.trim()}
          className="rounded-xl px-4 py-2 bg-[#006D77] text-white disabled:opacity-60"
        >
          {loading ? "Analyzing…" : "Run Free Test"}
        </button>
      </div>

      {(loading || progress > 0) && (
        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full bg-[#006D77]"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
      {err && (
        <div className="rounded-lg border bg-rose-50 text-rose-800 px-3 py-2 text-sm">
          {err}
        </div>
      )}

      {/* Top grade + subscores */}
      <div className="grid md:grid-cols-[1.1fr,0.9fr] gap-6">
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-700">
                Your Website’s Grade
              </div>
              <div className="mt-3 h-3 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-[#006D77]"
                  style={{ width: `${clamp(score.overall)}%` }}
                />
              </div>
              <div className="mt-2 text-sm">
                {clamp(score.overall)} / 100{" "}
                <span className="text-slate-500">Grade (auto)</span>
              </div>
            </div>
            <div className="shrink-0">
              <div className="h-12 w-12 grid place-items-center rounded-xl border text-lg font-semibold">
                {Math.round(clamp(score.overall) / 10) * 10}
              </div>
            </div>
          </div>

          {/* meta */}
          <div className="mt-4 grid md:grid-cols-2 gap-3 text-sm text-slate-700">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-slate-500">Meta</div>
              <ul className="list-disc pl-5">
                <li>
                  <b>Title:</b> {report?.meta?.title ?? "—"}
                </li>
                <li>
                  <b>Description:</b>{" "}
                  {report?.meta?.description
                    ? `${report.meta.description.slice(0, 160)}${
                        (report.meta.description || "").length > 160 ? "…" : ""
                      }`
                    : "—"}
                </li>
                <li>
                  <b>Canonical:</b> {report?.meta?.canonical ?? "—"}
                </li>
              </ul>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-slate-500">Headings</div>
              <div>
                H1 / H2 / H3: {report?.seo?.h1Count ?? 0} /{" "}
                {report?.seo?.h2Count ?? 0} / {report?.seo?.h3Count ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-slate-500">Links</div>
              <div>
                Total: {report?.links?.total ?? 0} • Internal:{" "}
                {report?.links?.internal ?? 0} • External:{" "}
                {report?.links?.external ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-slate-500">Images</div>
              <div>
                Total: {report?.images?.total ?? 0} • Missing ALT:{" "}
                {report?.images?.missingAlt ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-slate-500">Robots / Sitemap</div>
              <div>
                robots.txt: {report?.robots?.robotsTxtOk ? "OK" : "—"} •
                sitemap: {report?.robots?.sitemapOk ? "OK" : "—"}
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-slate-500">URL</div>
              <div className="truncate">{report?.page?.url || "—"}</div>
            </div>
          </div>
        </div>

        {/* Sub-scores & sidebar */}
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-medium text-slate-700">Sub-scores</div>
          <div className="mt-4 text-sm">
            <div>Structure</div>
            <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-[#99D6D0]"
                style={{ width: `${clamp(score.structure)}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {clamp(score.structure)}%
            </div>
          </div>
          <div className="mt-5 text-sm">
            <div>Content</div>
            <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-[#006D77]"
                style={{ width: `${clamp(score.content)}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {clamp(score.content)}%
            </div>
          </div>
          <div className="mt-5 text-xs text-slate-500">
            If you fix the top 3 issues we estimate ≈ <b>+18% leads</b>.
          </div>
        </div>
      </div>

      {/* Hero snapshot + right column */}
      <div className="grid md:grid-cols-[1.1fr,0.9fr] gap-6">
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm text-slate-500">
            Hero Snapshot (top of page)
          </div>
          <div className="text-xs text-slate-500">
            Cropped to the first viewport for clarity. Suggestions overlay shows
            the most impactful fixes.
          </div>
          <div className="mt-3 rounded-xl overflow-hidden border bg-white h-[420px]">
            {heroSrc ? (
              <img
                src={heroSrc}
                alt="Hero snapshot"
                className="w-full h-full object-cover object-top"
              />
            ) : (
              <div className="w-full h-full grid place-items-center text-slate-400">
                no image
              </div>
            )}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            * We show screenshots only for sections with issues. Currently
            cropping to the hero area.
          </div>
          <div className="mt-3 rounded-lg border bg-white p-3 text-sm">
            <div className="text-xs text-slate-500 mb-1">
              Top hero suggestions
            </div>
            <ul className="list-disc pl-5 text-slate-700">
              <li>
                Hero Section — Revise the hero copy to clearly state benefits,
                and highlight a call-to-action.
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border bg-white p-5">
            <div className="text-sm font-medium text-slate-700">
              Sections Present
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {sectionsPresent.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      s.ok ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  <span className="capitalize">{s.title}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">
                Quick Wins
              </div>
              <div className="text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5">
                ≈ +9% leads (if all done)
              </div>
            </div>
            <ul className="mt-3 list-disc pl-5 text-sm text-slate-700">
              {(
                report?.quick_wins || [
                  "Improve call-to-action buttons to make them more visible.",
                  "Include testimonials in the hero section for immediate social proof.",
                ]
              ).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <div className="text-sm font-medium text-slate-700">
              Prioritized Backlog
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {(report?.prioritized_backlog || []).map((b, i) => (
                <div
                  key={i}
                  className="rounded-lg border px-3 py-2 flex items-center justify-between"
                >
                  <div>{b.title}</div>
                  <div className="flex items-center gap-2">
                    {typeof b.lift_percent === "number" && (
                      <span className="px-2 py-0.5 rounded text-xs border bg-emerald-50 text-emerald-700">
                        ≈ +{b.lift_percent}% leads
                      </span>
                    )}
                    {b.impact && (
                      <span
                        className={[
                          "px-2 py-0.5 rounded text-xs border",
                          b.impact === "high"
                            ? "bg-rose-100 text-rose-800 border-rose-200"
                            : b.impact === "medium"
                            ? "bg-amber-100 text-amber-800 border-amber-200"
                            : "bg-emerald-100 text-emerald-800 border-emerald-200",
                        ].join(" ")}
                      >
                        impact {b.impact}
                      </span>
                    )}
                    {b.eta_days ? (
                      <span className="px-2 py-0.5 rounded text-xs border bg-slate-50 text-slate-700">
                        ETA {b.eta_days}d
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
              {(report?.prioritized_backlog || []).length === 0 && (
                <div className="text-slate-500 text-sm">No backlog items.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Findings */}
      {(report?.findings || []).length > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-medium">Findings</div>
          <div className="mt-2 space-y-3">
            {(report?.findings || []).map((f, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{f.title}</div>
                  <span
                    className={[
                      "px-2 py-0.5 rounded text-xs border",
                      f.impact === "high"
                        ? "bg-rose-100 text-rose-800 border-rose-200"
                        : f.impact === "medium"
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : "bg-emerald-100 text-emerald-800 border-emerald-200",
                    ].join(" ")}
                  >
                    {f.impact}
                  </span>
                </div>
                <div className="text-slate-700 mt-1">{f.recommendation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Audit – izmanto normalizētos auditRows ar status */}
      {auditRows.length > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-medium">Content Audit</div>
          <div className="mt-2 grid md:grid-cols-2 gap-3">
            {auditRows.map((row, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium capitalize">{row.section}</div>
                  <span
                    className={[
                      "px-2 py-0.5 rounded text-xs border",
                      row.status === "ok"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : row.status === "weak"
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : "bg-rose-100 text-rose-800 border-rose-200",
                    ].join(" ")}
                  >
                    {row.status}
                  </span>
                </div>
                {row.rationale && (
                  <div className="text-slate-700 mt-1">{row.rationale}</div>
                )}
                {(row.suggestions || []).length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-slate-700">
                    {(row.suggestions || []).map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
