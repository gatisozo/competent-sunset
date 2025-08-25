import React, { useEffect, useMemo, useState } from "react";
import { runAnalyze } from "../lib/analyzeClient";

/** --- Kopējie tipi (vaļīgi, lai nesaplīstu ar esošo backend) --- */
type ImpactStr = "low" | "medium" | "high";
type Suggestion = { title: string; impact: ImpactStr; recommendation: string };
type BacklogItem = {
  title: string;
  impact?: 1 | 2 | 3 | "low" | "medium" | "high";
  effort?: "low" | "medium" | "high";
  eta_days?: number;
  lift_percent?: number;
  notes?: string;
};
type ContentAuditItem = {
  section: string;
  status: "ok" | "weak" | "missing";
  rationale?: string;
  suggestions?: string[];
};

type SectionsDetected = {
  hero?: boolean;
  value_prop?: boolean;
  social_proof?: boolean;
  pricing?: boolean;
  features?: boolean;
  faq?: boolean;
  contact?: boolean;
  footer?: boolean;
};

type Report = {
  url?: string;
  title?: string;
  score?: number;
  page?: { url?: string; title?: string };
  assets?: {
    screenshot_url?: string | null;
    suggested_screenshot_url?: string | null;
  };
  screenshots?: { hero?: string | null };
  sections_detected?: SectionsDetected;
  key_findings?: Suggestion[];
  findings?: Suggestion[];
  quick_wins?: string[];
  prioritized_backlog?: BacklogItem[];
  content_audit?: ContentAuditItem[];
  meta?: { title?: string; description?: string; canonical?: string };
};

/** Free-report izejas datu “aptuvenā” forma */
type FreeData = {
  meta?: { title?: string; description?: string; canonical?: string };
  headings?: { h1?: number; h2?: number; h3?: number };
  images?: { total?: number; missingAlt?: number };
  robots?: { robotsTxt?: "ok" | "missing"; sitemapXml?: "ok" | "missing" };
  social?: { og?: boolean; twitter?: boolean };
  links?: { internal?: number; external?: number };
  // ja free report jau iedod gatavus laukus:
  quick_wins_rows?: QuickWinRow[];
  backlog_rows?: BacklogRow[];
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}
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
function screenshotFallback(target?: string) {
  if (!target) return undefined;
  const url = normalizeUrl(target);
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}
function impactBadgeClasses(impact?: BacklogItem["impact"]) {
  if (impact === 3 || impact === "high")
    return "bg-rose-100 text-rose-800 border-rose-200";
  if (impact === 2 || impact === "medium")
    return "bg-amber-100 text-amber-800 border-amber-200";
  if (impact === 1 || impact === "low")
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
}
function toImpactLabel(impact?: BacklogItem["impact"]) {
  if (impact === 3) return "high";
  if (impact === 2) return "medium";
  if (impact === 1) return "low";
  if (impact === "high" || impact === "medium" || impact === "low")
    return impact;
  return "medium";
}

/** ---------- Copy suggestions no audit/sections (front-end heuristika) ---------- */
function buildCopySuggestions(r?: Report): string[] {
  if (!r) return [];
  const out: string[] = [];
  const sd = r.sections_detected || {};
  const audit = r.content_audit || [];
  const metaDesc = r.meta?.description;

  const heroRow = audit.find((a) => a.section.toLowerCase().includes("hero"));
  if (
    !sd.hero ||
    (heroRow && (heroRow.status === "weak" || heroRow.status === "missing"))
  ) {
    out.push(
      "Rewrite the hero headline to clearly state the main benefit and outcome in one sentence."
    );
    out.push(
      "Add a concise subheadline for the target audience and pain point."
    );
    out.push(
      "Tighten the primary CTA copy (e.g., “Get your free audit” → “Get my free audit in 60s”)."
    );
  }
  if (!sd.social_proof)
    out.push("Add 1–3 short testimonial snippets near the primary CTA.");
  if (!sd.features)
    out.push(
      "Turn features into short benefit bullets (start with a verb, <12 words)."
    );
  if (metaDesc && metaDesc.length < 120)
    out.push("Expand meta description to ~150 chars incl. benefit + CTA.");
  else if (!metaDesc)
    out.push("Add meta description (~120–160 chars) with main benefit + CTA.");
  if (!sd.pricing)
    out.push("Clarify pricing or add “from …” line to set expectations.");
  if (!sd.faq) out.push("Add 3–5 FAQs that address common objections.");
  return Array.from(new Set(out)).slice(0, 10);
}

/** ---------- Tabulu rindas (tāda pati struktūra kā Free report) ---------- */
type QuickWinRow = {
  field: string;
  current: string;
  recommended: string;
  liftPct?: number;
};
type BacklogRow = {
  task: string;
  current: string;
  recommended: string;
  priority: "low" | "med" | "high";
  effort: string; // piemēram "1–2h", "1–2d" u.tml.
  liftPct?: number;
};

/** Ja Free report jau atdod gatavas rindas – izmantojam tās.
 *  Ja nē, ģenerējam tās pašas rindas šeit no FreeData (meta/headings/images/..). */
function makeQuickWinsRows(f: FreeData): QuickWinRow[] {
  if (Array.isArray(f.quick_wins_rows) && f.quick_wins_rows.length)
    return f.quick_wins_rows;

  const rows: QuickWinRow[] = [];
  const h1 = f.headings?.h1 ?? 0;
  const desc = (f.meta?.description || "").trim();
  const missingAlt = f.images?.missingAlt ?? 0;
  const internalLinks = f.links?.internal ?? 0;

  rows.push({
    field: "Hero text",
    current: (f.meta?.title || "—").toUpperCase(),
    recommended: "Clear value. Start in minutes.",
    liftPct: 12,
  });
  rows.push({
    field: "Meta description",
    current: desc ? desc : "Nav atrasta",
    recommended:
      "≈150 chars with benefit + brand. Include CTA (e.g., “Get started in minutes”).",
    liftPct: 2,
  });
  rows.push({
    field: "Image ALT texts",
    current:
      missingAlt > 0
        ? `Trūkst: ${missingAlt} (${
            f.images?.total
              ? Math.round((missingAlt / (f.images?.total || 1)) * 100)
              : "~"
          }%)`
        : "OK",
    recommended: 'Add short, descriptive ALT; decorative images use alt="".',
    liftPct: 2,
  });
  rows.push({
    field: "H1 virsraksti",
    current: `${h1} uz lapu`,
    recommended: "Ensure exactly 1 H1 with main intent/keyword.",
    liftPct: 6,
  });
  rows.push({
    field: "Canonical",
    current: f.meta?.canonical || "Nav atrasts",
    recommended: "Point to canonical w/o params; match primary URL.",
    liftPct: 0,
  });
  rows.push({
    field: "robots.txt",
    current: f.robots?.robotsTxt === "ok" ? "OK" : "Trūkst",
    recommended: "Include sitemap reference in robots.txt.",
    liftPct: 0,
  });
  rows.push({
    field: "sitemap.xml",
    current: f.robots?.sitemapXml === "ok" ? "OK" : "Trūkst",
    recommended: "Keep sitemap auto-updating.",
    liftPct: 0,
  });
  rows.push({
    field: "Social meta (OG/Twitter)",
    current: f.social?.og || f.social?.twitter ? "Daļēji/OK" : "Trūkst",
    recommended:
      "Add og:title, og:description, og:image, og:url, twitter:card.",
    liftPct: 2,
  });
  rows.push({
    field: "Iekšējās saites",
    current: `Kopā ${internalLinks} · ieteicams 20+`,
    recommended:
      "Add ≥5 internal links to main pages (pricing, contact, FAQ…).",
    liftPct: 1,
  });

  return rows;
}

function makeBacklogRows(f: FreeData): BacklogRow[] {
  if (Array.isArray(f.backlog_rows) && f.backlog_rows.length)
    return f.backlog_rows;

  const h1 = f.headings?.h1 ?? 0;
  const desc = (f.meta?.description || "").trim();
  const missingAlt = f.images?.missingAlt ?? 0;

  const rows: BacklogRow[] = [
    {
      task: "H1 struktūra",
      current: `${h1} H1 uz lapu`,
      recommended: "Set exactly 1 H1 with clear value proposition.",
      priority: "high",
      effort: "1–2h",
      liftPct: 6,
    },
    {
      task: "Meta description",
      current: desc ? desc : "Nav atrasta",
      recommended: "≈150 chars incl. benefit, features and CTA. Brand mention.",
      priority: "med",
      effort: "1–2h",
      liftPct: 2,
    },
    {
      task: "ALT teksti",
      current: missingAlt > 0 ? `Trūkst: ${missingAlt}` : "OK",
      recommended:
        "Add ALT to all non-decorative images; concise and specific.",
      priority: "med",
      effort: "2–4h",
      liftPct: 2,
    },
    {
      task: "Social meta",
      current: f.social?.og || f.social?.twitter ? "Daļēji/OK" : "Trūkst",
      recommended:
        "Add og:title, og:description, og:image, og:url, twitter:card.",
      priority: "low",
      effort: "1–2h",
      liftPct: 2,
    },
    {
      task: "Pricing/Plans sadaļa",
      current: f.sections
        ? (f as any).sections?.pricing
          ? "Atrasta"
          : "Nav atrasta"
        : "—",
      recommended: "Add a clear plan / “from …” pricing with CTA.",
      priority: "med",
      effort: "1–2d",
      liftPct: 4,
    },
    {
      task: "FAQ sadaļa",
      current: f.sections
        ? (f as any).sections?.faq
          ? "Atrasta"
          : "Nav atrasta"
        : "—",
      recommended: "Add 6–10 FAQs with short answers.",
      priority: "med",
      effort: "0.5–1d",
      liftPct: 3,
    },
    {
      task: "Testimonials/Logos",
      current: (f as any)?.sections?.social_proof ? "Atrasti" : "Nav atrasti",
      recommended: "Add quotes or client logos row (≥6).",
      priority: "high",
      effort: "1–2d",
      liftPct: 6,
    },
  ];
  return rows;
}

/** -------------------------------- Komponents -------------------------------- */
export default function FullReportView() {
  const [url, setUrl] = useState("");
  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Free report datu “overlay”, lai tabulas sakristu ar Free report
  const [freeRaw, setFreeRaw] = useState<FreeData | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);

  // ?url & autostart
  useEffect(() => {
    const usp = new URLSearchParams(window.location.search);
    const qUrl = usp.get("url") || "";
    const auto = usp.get("autostart") === "1" || usp.get("auto") === "1";
    if (qUrl) setUrl(qUrl);
    if (qUrl && auto) void startAnalysis(qUrl);
  }, []);

  async function hydrateFromFree(targetUrl?: string) {
    const final = (targetUrl || report?.url || report?.page?.url || "").trim();
    if (!final) return;
    setOverlayLoading(true);
    try {
      const rr = await runAnalyze(final); // tas pats, ko izmanto Free report
      if (rr?.ok && rr.data) setFreeRaw(rr.data as FreeData);
      else setFreeRaw(null);
    } catch {
      setFreeRaw(null);
    } finally {
      setOverlayLoading(false);
    }
  }

  async function startAnalysis(raw: string) {
    const target = raw.trim();
    if (!target) return;
    setReport(null);
    setError(null);
    setProgress(5);
    setStarting(true);
    setFreeRaw(null);
    try {
      const sid = Math.random().toString(36).slice(2);
      const qs = new URLSearchParams({
        url: target,
        mode: "full",
        sid,
      }).toString();
      const es = new EventSource(`/api/analyze-stream?${qs}`);

      es.addEventListener("progress", (ev: any) => {
        try {
          const d = JSON.parse(ev.data);
          if (typeof d?.value === "number") {
            setProgress((v) => Math.max(v, clamp(d.value, 0, 100)));
          }
        } catch {}
      });

      es.addEventListener("result", (ev: any) => {
        try {
          const d = JSON.parse(ev.data);
          if (d?.error) {
            setError(d.error);
            setReport(null);
          } else {
            setReport(d as Report);
            setProgress(100);
            void hydrateFromFree(d?.url || d?.page?.url);
          }
        } catch (e: any) {
          setError(e?.message || "Failed to parse result");
          setReport(null);
        } finally {
          es.close();
          setStarting(false);
        }
      });

      es.onerror = () => {
        es.close();
        setStarting(false);
        setError("Connection error while streaming the report.");
      };
    } catch (e: any) {
      setStarting(false);
      setError(e?.message || "Failed to start analysis");
    }
  }

  const heroImg = useMemo(() => {
    return (
      report?.assets?.suggested_screenshot_url ||
      report?.assets?.screenshot_url ||
      report?.screenshots?.hero ||
      screenshotFallback(report?.url || report?.page?.url)
    );
  }, [report]);

  const findings = useMemo(() => {
    return (
      report?.key_findings && report.key_findings.length > 0
        ? report.key_findings
        : report?.findings || []
    ) as Suggestion[];
  }, [report]);

  const copySuggestions = useMemo(
    () => buildCopySuggestions(report || undefined),
    [report]
  );

  // Tabulām izmantojam Free report datus (vai ģenerējam no tiem)
  const quickRows = useMemo<QuickWinRow[]>(
    () => (freeRaw ? makeQuickWinsRows(freeRaw) : []),
    [freeRaw]
  );
  const backlogRows = useMemo<BacklogRow[]>(
    () => (freeRaw ? makeBacklogRows(freeRaw) : []),
    [freeRaw]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Controls */}
      <div className="rounded-2xl border bg-white p-4 flex flex-col md:flex-row gap-3 md:items-center">
        <input
          className="flex-1 rounded-xl border px-3 py-2"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && url.trim() && startAnalysis(url)
          }
        />
        <button
          className="rounded-xl px-4 py-2 bg-[#006D77] text-white disabled:opacity-60"
          disabled={starting || !url.trim()}
          onClick={() => startAnalysis(url)}
        >
          {starting ? "Analyzing…" : "Run Full Audit"}
        </button>
        <div className="text-xs text-slate-500">
          SSE live analysis {overlayLoading ? "· syncing Free report…" : ""}
        </div>
      </div>

      {(starting || progress > 0) && (
        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full bg-[#006D77]"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}

      {error && (
        <div className="rounded-xl border bg-rose-50 text-rose-800 px-3 py-2">
          {error}
        </div>
      )}

      {/* Overview / Score */}
      {report && (
        <div className="grid md:grid-cols-[1.1fr,0.9fr] gap-6">
          <div className="rounded-2xl border bg-white p-5">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-sm text-slate-700">
                  Full Audit — Overall Grade
                </div>
                <div className="mt-3 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77]"
                    style={{
                      width: `${clamp(Math.round(Number(report.score ?? 0)))}%`,
                    }}
                  />
                </div>
                <div className="mt-2 text-sm">
                  {clamp(Math.round(Number(report.score ?? 0)))} / 100{" "}
                  <span className="text-slate-500">Grade</span>
                </div>
              </div>
              <div className="shrink-0">
                <div className="h-12 w-12 grid place-items-center rounded-xl border text-lg font-semibold">
                  {Math.round(clamp(Number(report.score ?? 0)) / 10) * 10}
                </div>
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-3 text-sm text-slate-700">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">URL</div>
                <div className="truncate">
                  {report.url || report.page?.url || "—"}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">Title</div>
                <div className="truncate">
                  {report.title ||
                    report.page?.title ||
                    report.meta?.title ||
                    "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <div className="text-sm text-slate-700">Hero Snapshot</div>
            <div className="mt-3 rounded-xl overflow-hidden border bg-white h-[220px] md:h-[220px]">
              {heroImg ? (
                <img
                  src={heroImg}
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
              First viewport crop for clarity. We focus fixes on visible area.
            </div>
          </div>
        </div>
      )}

      {/* Sections Present */}
      {report && (
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-medium text-slate-700">
            Sections Present
          </div>
          <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
            {[
              { k: "hero", label: "Hero" },
              { k: "social_proof", label: "Social Proof" },
              { k: "features", label: "Features" },
              { k: "contact", label: "Contact" },
              { k: "value_prop", label: "Value Prop" },
              { k: "pricing", label: "Pricing" },
              { k: "faq", label: "FAQ" },
              { k: "footer", label: "Footer" },
            ].map((it) => {
              const ok = !!(report.sections_detected as any)?.[it.k];
              return (
                <div key={it.k} className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      ok ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  <span>{it.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Wins — TABULA kā Free report */}
      {report && (
        <div className="rounded-2xl border bg-white p-5 overflow-x-auto">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">Quick Wins</div>
            <div className="text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5">
              (from Free report){overlayLoading ? " · syncing…" : ""}
            </div>
          </div>

          <table className="mt-3 w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="text-left p-2 border">Lauks</th>
                <th className="text-left p-2 border">Esošais</th>
                <th className="text-left p-2 border">Ieteicamais</th>
                <th className="text-left p-2 border">Potenciālais ieguvums</th>
              </tr>
            </thead>
            <tbody>
              {(quickRows.length ? quickRows : []).map((r, i) => (
                <tr key={i} className="align-top">
                  <td className="p-2 border whitespace-nowrap">{r.field}</td>
                  <td className="p-2 border">{r.current}</td>
                  <td className="p-2 border">{r.recommended}</td>
                  <td className="p-2 border whitespace-nowrap">
                    {typeof r.liftPct === "number"
                      ? `≈ +${r.liftPct}% leads`
                      : "—"}
                  </td>
                </tr>
              ))}
              {quickRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-2 text-slate-500 border">
                    Waiting for Free report overlay…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Prioritized Backlog — TABULA kā Free report */}
      {report && (
        <div className="rounded-2xl border bg-white p-5 overflow-x-auto">
          <div className="text-sm font-medium text-slate-700">
            Prioritized Backlog
          </div>
          <table className="mt-3 w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="text-left p-2 border">Uzdevums</th>
                <th className="text-left p-2 border">Esošais</th>
                <th className="text-left p-2 border">Ieteicamais</th>
                <th className="text-left p-2 border">Prioritāte</th>
                <th className="text-left p-2 border">Effort</th>
                <th className="text-left p-2 border">Potenciālais ieguvums</th>
              </tr>
            </thead>
            <tbody>
              {(backlogRows.length ? backlogRows : []).map((r, i) => (
                <tr key={i} className="align-top">
                  <td className="p-2 border whitespace-nowrap">{r.task}</td>
                  <td className="p-2 border">{r.current}</td>
                  <td className="p-2 border">{r.recommended}</td>
                  <td className="p-2 border">
                    <span
                      className={[
                        "px-2 py-0.5 rounded text-xs border",
                        r.priority === "high"
                          ? "bg-rose-100 text-rose-800 border-rose-200"
                          : r.priority === "med"
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-emerald-100 text-emerald-800 border-emerald-200",
                      ].join(" ")}
                    >
                      {r.priority}
                    </span>
                  </td>
                  <td className="p-2 border">{r.effort}</td>
                  <td className="p-2 border whitespace-nowrap">
                    {typeof r.liftPct === "number"
                      ? `≈ +${r.liftPct}% leads`
                      : "—"}
                  </td>
                </tr>
              ))}
              {backlogRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-2 text-slate-500 border">
                    Waiting for Free report overlay…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Copy suggestions */}
      {report && (
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-medium text-slate-700">
            Copy suggestions
          </div>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
            {copySuggestions.length
              ? copySuggestions.map((s, i) => <li key={i}>{s}</li>)
              : [
                  "Rewrite the hero headline to clearly state the main benefit and add a compelling CTA.",
                  "Add 2–3 short testimonials or client logos near the primary CTA.",
                  "Rewrite features into concise benefit bullets (under 12 words each).",
                ].map((s, i) => <li key={i}>{s}</li>)}
          </ul>
          {report.meta?.description && (
            <div className="mt-3 rounded-lg border p-3 bg-slate-50 text-sm">
              <div className="text-xs text-slate-500 mb-1">
                Current meta description
              </div>
              <div className="text-slate-700">{report.meta.description}</div>
            </div>
          )}
        </div>
      )}

      {/* Findings */}
      {report && (report.key_findings?.length || report.findings?.length) ? (
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-medium">Findings</div>
          <div className="mt-2 space-y-3">
            {(report.key_findings && report.key_findings.length > 0
              ? report.key_findings
              : report.findings || []
            ).map((f, i) => (
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
      ) : null}

      {/* Content Audit */}
      {report && (report.content_audit || []).length > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-medium">Content Audit</div>
          <div className="mt-2 grid md:grid-cols-2 gap-3">
            {(report.content_audit || []).map((row, i) => (
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
