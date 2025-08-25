import React, { useEffect, useMemo, useState } from "react";

// ---- Types kept flexible for safety with current backend ----
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
  // legacy mirrors
  page?: { url?: string; title?: string };
  assets?: {
    screenshot_url?: string | null;
    suggested_screenshot_url?: string | null;
  };
  // new
  screenshots?: { hero?: string | null };
  sections_detected?: SectionsDetected;
  key_findings?: Suggestion[]; // sometimes used instead of findings
  findings?: Suggestion[];
  quick_wins?: string[];
  prioritized_backlog?: BacklogItem[];
  content_audit?: ContentAuditItem[];
  // optional extras if backend provides them
  meta?: { title?: string; description?: string; canonical?: string };
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
  // use same public fallback as Free report, unless backend provided one
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}

function impactBadgeClasses(impact?: BacklogItem["impact"]) {
  if (impact === 3 || impact === "high")
    return "bg-rose-100 text-rose-800 border-rose-200";
  if (impact === 2 || impact === "medium")
    return "bg-amber-100 text-amber-800 border-amber-200";
  if (impact === 1 || impact === "low")
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  // default medium
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

// Heuristic “copy” suggestions derived from audit/sections; backend changes NOT required
function buildCopySuggestions(r?: Report): string[] {
  if (!r) return [];
  const out: string[] = [];
  const sd = r.sections_detected || {};
  const audit = r.content_audit || [];
  const metaDesc = r.meta?.description;

  // Hero / value prop
  const heroRow = audit.find((a) => a.section.includes("hero"));
  if (
    !sd.hero ||
    (heroRow && (heroRow.status === "weak" || heroRow.status === "missing"))
  ) {
    out.push(
      "Rewrite the hero headline to clearly state the value proposition and outcome in one sentence."
    );
    out.push(
      "Add a concise subheadline that addresses the target audience and their pain point."
    );
    out.push(
      "Tighten the primary CTA copy (e.g., “Get your free audit” → “Get my free audit in 60s”)."
    );
  }

  // Social proof microcopy
  if (!sd.social_proof) {
    out.push(
      "Add 1–3 short testimonial snippets (one sentence each) near the primary CTA to reduce risk."
    );
  }

  // Features / benefits
  if (!sd.features) {
    out.push(
      "Rewrite features into user-benefit bullets (start each with a verb, keep under 12 words)."
    );
  }

  // Meta description (if present or missing)
  if (metaDesc && metaDesc.length < 120) {
    out.push(
      "Expand the meta description to ~150 chars including the primary benefit and CTA phrase."
    );
  } else if (!metaDesc) {
    out.push(
      "Add a descriptive meta description (~120–160 chars) with your main benefit and CTA."
    );
  }

  // Pricing/FAQ
  if (!sd.pricing) {
    out.push(
      "Clarify pricing or add a “from …” statement to set expectations and reduce friction."
    );
  }
  if (!sd.faq) {
    out.push(
      "Add 3–5 short FAQs that tackle common objections (pricing, timelines, guarantees)."
    );
  }

  // Deduplicate similar lines
  return Array.from(new Set(out)).slice(0, 10);
}

export default function FullReportView() {
  const [url, setUrl] = useState("");
  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read ?url= and autostart
  useEffect(() => {
    const usp = new URLSearchParams(window.location.search);
    const qUrl = usp.get("url") || "";
    const auto = usp.get("autostart") === "1" || usp.get("auto") === "1";
    if (qUrl) setUrl(qUrl);
    if (qUrl && auto) {
      void startAnalysis(qUrl);
    }
  }, []);

  // SSE runner
  async function startAnalysis(raw: string) {
    const target = raw.trim();
    if (!target) return;
    setReport(null);
    setError(null);
    setProgress(5);
    setStarting(true);
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
        <div className="text-xs text-slate-500">SSE live analysis</div>
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

      {/* ============ Overview / Score ============ */}
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

      {/* ============ Sections Present (like Free report) ============ */}
      {report && (
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-medium text-slate-700">
            Sections Present
          </div>
          <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
            {[
              { k: "hero", label: "hero" },
              { k: "social_proof", label: "social proof" },
              { k: "features", label: "features" },
              { k: "contact", label: "contact" },
              { k: "value_prop", label: "value prop" },
              { k: "pricing", label: "pricing" },
              { k: "faq", label: "faq" },
              { k: "footer", label: "footer" },
            ].map((it) => {
              const ok = !!(report.sections_detected as any)?.[it.k];
              return (
                <div key={it.k} className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      ok ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  <span className="capitalize">{it.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ Quick Wins (same style as Free) ============ */}
      {report && (
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">Quick Wins</div>
            <div className="text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5">
              ≈ +9% leads (if all done)
            </div>
          </div>
          <ul className="mt-3 list-disc pl-5 text-sm text-slate-700">
            {(report.quick_wins && report.quick_wins.length > 0
              ? report.quick_wins
              : [
                  "Improve CTA visibility and clarity above the fold.",
                  "Add testimonials near the primary CTA for immediate social proof.",
                ]
            ).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ============ Prioritized Backlog (same style as Free) ============ */}
      {report && (
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-medium text-slate-700">
            Prioritized Backlog
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {(report.prioritized_backlog || []).map((b, i) => (
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
                        impactBadgeClasses(b.impact),
                      ].join(" ")}
                    >
                      impact {toImpactLabel(b.impact)}
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
            {(report.prioritized_backlog || []).length === 0 && (
              <div className="text-slate-500 text-sm">No backlog items.</div>
            )}
          </div>
        </div>
      )}

      {/* ============ Copy suggestions (NEW) ============ */}
      {report && (
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-medium text-slate-700">
            Copy suggestions
          </div>
          <div className="mt-2 text-sm text-slate-700">
            <ul className="list-disc pl-5">
              {copySuggestions.length > 0
                ? copySuggestions.map((s, i) => <li key={i}>{s}</li>)
                : [
                    "Rewrite the hero headline to clearly state the main benefit and add a compelling CTA.",
                    "Add 2–3 short testimonials or client logos near the primary CTA.",
                    "Rewrite features into concise benefit bullets (under 12 words each).",
                  ].map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
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

      {/* ============ Findings ============ */}
      {report && findings.length > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-medium">Findings</div>
          <div className="mt-2 space-y-3">
            {findings.map((f, i) => (
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

      {/* ============ Content Audit ============ */}
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
