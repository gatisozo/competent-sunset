import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeUrl,
  normalizeUrl,
  type CroReport,
  type FullReport,
  type Suggestion,
  type ContentAuditItem,
} from "../lib/analyze";

/* -------------------------------------------------------
   Small utilities
------------------------------------------------------- */
function getQS(name: string): string | null {
  if (typeof window === "undefined") return null;
  const m = new URLSearchParams(window.location.search).get(name);
  return m ? decodeURIComponent(m) : null;
}

function clsx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function impactChip(impact?: "high" | "medium" | "low") {
  const map: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-emerald-100 text-emerald-700",
  };
  const txt = (impact || "low").toUpperCase();
  return (
    <span
      className={clsx(
        "px-2 py-0.5 rounded text-xs font-medium",
        map[impact || "low"]
      )}
    >
      {txt}
    </span>
  );
}

/* -------------------------------------------------------
   Screenshot logic (hero-only crop & duplicate avoidance)
------------------------------------------------------- */
const heroCropWrap = "rounded-xl overflow-hidden border bg-white h-[520px]";
const heroCropImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "top",
};

// Heuristic: is a finding related to the hero?
function isHeroFinding(title: string) {
  const t = title.toLowerCase();
  return (
    t.includes("hero") ||
    t.includes("above the fold") ||
    t.includes("headline") ||
    t.includes("cta") ||
    t.includes("primary button")
  );
}

function hasMeaningfulIssues(
  findings: { title: string }[] = [],
  contentAudit?: { section: string; status: "ok" | "weak" | "missing" }[]
) {
  const anyHeroFinding = findings.some((f) => isHeroFinding(f.title));
  const anyWeak = (contentAudit || []).some((c) => c.status !== "ok");
  return anyHeroFinding || anyWeak;
}

/* -------------------------------------------------------
   Minimal sample (for /full?sample=1)
------------------------------------------------------- */
const sampleReport: FullReport = {
  score: 75,
  summary:
    "Solid structure overall. Main gaps are unclear hero value, weak CTA emphasis on mobile, and lack of trust badges above the fold.",
  key_findings: [
    {
      title: "Hero value unclear on mobile — hero",
      impact: "low",
      recommendation: "Shorten headline and keep CTA in the first viewport.",
    },
    {
      title: "Primary CTA low contrast — hero",
      impact: "low",
      recommendation: "Increase color contrast and add hover/focus styles.",
    },
  ],
  quick_wins: [
    "Compress hero image",
    "Move CTA above fold",
    "Add social proof",
  ],
  findings: [
    {
      title: "LCP image oversized — performance",
      impact: "medium",
      recommendation:
        "Serve responsive images (srcset) and preload hero asset.",
    },
  ],
  prioritized_backlog: [
    {
      title: "Fix hero value + CTA",
      impact: 3,
      effort: 1,
      eta_days: 1,
      notes: "Copy + button styles",
    },
    {
      title: "Responsive hero image",
      impact: 3,
      effort: 2,
      eta_days: 2,
      notes: "srcset + preload",
    },
  ],
  content_audit: [
    {
      section: "hero",
      status: "weak",
      rationale: "Headline not benefit-driven; CTA not visible on mobile.",
      suggestions: [
        "Rewrite headline with value",
        "Place CTA above the fold on mobile",
      ],
    },
    {
      section: "value_prop",
      status: "ok",
      rationale: "Bullet benefits present and scannable.",
      suggestions: ["Add a stat/certification to boost credibility"],
    },
    {
      section: "social_proof",
      status: "missing",
      rationale: "No testimonials or trust badges detected.",
      suggestions: [
        "Add 2–3 testimonials",
        "Partner/media logos above the fold",
      ],
    },
  ],
  sections_detected: {
    hero: true,
    value_prop: true,
    social_proof: false,
    pricing: false,
    features: true,
    faq: true,
    contact: true,
    footer: true,
  },
  page: {
    url: "https://example.com",
    title: "Example — demo",
  },
  assets: {
    screenshot_url:
      "https://s.wordpress.com/mshots/v1/https%3A%2F%2Fexample.com?w=1200",
    suggested_screenshot_url:
      "https://s.wordpress.com/mshots/v1/https%3A%2F%2Fexample.com?w=1200",
  },
};

/* -------------------------------------------------------
   Component
------------------------------------------------------- */
export default function FullReportView() {
  const [url, setUrl] = useState<string>(() => getQS("url") || "menopauze.lv");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [report, setReport] = useState<FullReport | null>(null);

  const sample = getQS("sample") === "1";

  // first load: sample or real
  useEffect(() => {
    if (sample) {
      setReport(sampleReport);
      return;
    }
    if (url) {
      handleAnalyze("free");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAnalyze(mode: "free" | "full" = "full") {
    try {
      setLoading(true);
      setError("");
      const r = (await analyzeUrl(url, mode)) as FullReport; // backend now returns full schema
      setReport(r);
    } catch (e: any) {
      setError(e?.message || "Analyze failed");
    } finally {
      setLoading(false);
    }
  }

  // Enable Enter on the URL input
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAnalyze("full");
  };

  const findings = (report?.findings || []) as Suggestion[];
  const contentAudit = report?.content_audit as ContentAuditItem[] | undefined;
  const screenshotUrl = report?.assets?.screenshot_url || null;
  const suggestedShot = report?.assets?.suggested_screenshot_url || null;

  const topHeroSuggestions = useMemo(() => {
    const heroOnes = findings.filter((f) => isHeroFinding(f.title));
    return (heroOnes.length ? heroOnes : findings).slice(0, 3);
  }, [findings]);

  return (
    <div className="mx-auto max-w-6xl px-3 md:px-4 py-8">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl md:text-3xl font-semibold">Full Report</h1>

        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-sm"
          >
            Download PDF
          </button>
          <button
            onClick={() => alert("Email sending is not configured yet.")}
            className="px-3 py-2 rounded-lg bg-[#006D77] text-white text-sm"
          >
            Email PDF
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2 mb-4">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={onKey}
          placeholder="yourdomain.com"
          className="flex-1 rounded-lg px-3 py-2 bg-white border outline-none focus:ring-2 focus:ring-[#83C5BE]"
        />
        <button
          disabled={loading || !url.trim()}
          onClick={() => handleAnalyze("full")}
          className="rounded-lg px-4 py-2 bg-[#006D77] text-white disabled:opacity-60"
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 p-3 text-sm">
          {error}
        </div>
      )}

      {/* Main grid */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Left: page + hero visual + findings */}
        <div className="md:col-span-2 space-y-4">
          {/* Page meta */}
          {report?.page && (
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-slate-500">URL</div>
              <div className="truncate">{report.page.url}</div>
              {report.page.title && (
                <>
                  <div className="mt-2 text-xs text-slate-500">Title</div>
                  <div className="">{report.page.title}</div>
                </>
              )}
            </div>
          )}

          {/* Visual: hero snapshot (cropped) */}
          {hasMeaningfulIssues(findings, contentAudit) && screenshotUrl && (
            <div className="rounded-xl border bg-white p-3">
              <div className="font-medium">Hero Snapshot (top of page)</div>
              <div className="text-sm text-slate-600">
                Cropped to the first viewport for clarity. Suggestions overlay
                shows the most impactful fixes.
              </div>

              {(() => {
                const isSameShot =
                  !suggestedShot || suggestedShot === screenshotUrl;
                const overlayList = topHeroSuggestions;

                if (isSameShot) {
                  return (
                    <div className={`${heroCropWrap} relative mt-2`}>
                      {/* eslint-disable-next-line jsx-a11y/alt-text */}
                      <img src={screenshotUrl} style={heroCropImg} />
                      {overlayList.length > 0 && (
                        <div className="absolute right-2 bottom-2 bg-white/95 border rounded-lg p-3 text-xs max-w-[85%] shadow">
                          <div className="font-medium mb-1">
                            Top hero suggestions
                          </div>
                          <ul className="space-y-1">
                            {overlayList.map((s, i) => (
                              <li key={i}>
                                • <b>{s.title}</b> — {s.recommendation}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="grid md:grid-cols-2 gap-3 mt-2">
                    <div className={heroCropWrap}>
                      <div className="px-3 py-2 text-sm border-b">
                        Before (current)
                      </div>
                      {/* eslint-disable-next-line jsx-a11y/alt-text */}
                      <img src={screenshotUrl} style={heroCropImg} />
                    </div>
                    <div className={`${heroCropWrap} relative`}>
                      <div className="px-3 py-2 text-sm border-b">
                        Suggested
                      </div>
                      {/* eslint-disable-next-line jsx-a11y/alt-text */}
                      <img
                        src={suggestedShot || screenshotUrl}
                        style={heroCropImg}
                      />
                      {overlayList.length > 0 && (
                        <div className="absolute right-2 bottom-2 bg-white/95 border rounded-lg p-3 text-xs max-w-[85%] shadow">
                          <div className="font-medium mb-1">
                            Top hero suggestions
                          </div>
                          <ul className="space-y-1">
                            {overlayList.map((s, i) => (
                              <li key={i}>
                                • <b>{s.title}</b> — {s.recommendation}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="mt-1 text-xs text-slate-500">
                * We show screenshots only for sections with issues. Currently
                cropping to the hero area.
              </div>
            </div>
          )}

          {/* Findings list */}
          {findings.length > 0 && (
            <div className="rounded-xl border bg-white p-3">
              <div className="font-medium mb-2">Findings</div>
              <div className="grid gap-3">
                {findings.map((f, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-lg border bg-white flex items-start gap-3"
                  >
                    <div className="pt-1">{impactChip(f.impact)}</div>
                    <div>
                      <div className="font-medium">{f.title}</div>
                      <div className="text-sm text-slate-600 mt-1">
                        {f.recommendation}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content audit */}
          {contentAudit && contentAudit.length > 0 && (
            <div className="rounded-xl border bg-white p-3">
              <div className="font-medium mb-2">Content Audit</div>
              <div className="grid gap-3">
                {contentAudit.map((c, i) => (
                  <div key={i} className="p-4 rounded-lg border bg-white">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">
                        {c.section.replace(/_/g, " ")}
                      </span>
                      <span
                        className={clsx(
                          "text-xs px-2 py-0.5 rounded",
                          c.status === "ok" &&
                            "bg-emerald-100 text-emerald-700",
                          c.status === "weak" && "bg-amber-100 text-amber-700",
                          c.status === "missing" && "bg-red-100 text-red-700"
                        )}
                      >
                        {c.status}
                      </span>
                    </div>
                    {c.rationale && (
                      <div className="text-sm text-slate-600 mt-1">
                        {c.rationale}
                      </div>
                    )}
                    {c.suggestions && c.suggestions.length > 0 && (
                      <ul className="text-sm text-slate-700 mt-2 list-disc pl-5">
                        {c.suggestions.map((s, j) => (
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

        {/* Right: score + sections + quick wins + backlog */}
        <div className="space-y-4">
          {/* Score */}
          <div className="rounded-xl border bg-white p-3">
            <div className="text-sm text-slate-600">Score</div>
            <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-[#006D77]"
                style={{
                  width: `${Math.min(100, Math.max(0, report?.score || 0))}%`,
                }}
              />
            </div>
            <div className="mt-1 text-sm">{report?.score ?? 0} / 100</div>
          </div>

          {/* Sections present */}
          {report?.sections_detected && (
            <div className="rounded-xl border bg-white p-3">
              <div className="font-medium mb-2">Sections Present</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(report.sections_detected).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span
                      className={clsx(
                        "h-2 w-2 rounded-full",
                        v ? "bg-emerald-500" : "bg-slate-300"
                      )}
                    />
                    <span className="capitalize">{k.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick wins */}
          {report?.quick_wins && report.quick_wins.length > 0 && (
            <div className="rounded-xl border bg-white p-3">
              <div className="font-medium mb-2">Quick Wins</div>
              <ul className="text-sm text-slate-700 list-disc pl-5">
                {report.quick_wins.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Backlog */}
          {report?.prioritized_backlog &&
            report.prioritized_backlog.length > 0 && (
              <div className="rounded-xl border bg-white p-3">
                <div className="font-medium mb-2">Prioritized Backlog</div>
                <div className="space-y-2">
                  {report.prioritized_backlog.map((b, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      <div className="font-medium">{b.title}</div>
                      <div className="mt-1 text-xs text-slate-600 flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-100">
                          Impact {b.impact}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100">
                          Effort {b.effort}
                        </span>
                        {"eta_days" in b && (
                          <span className="px-2 py-0.5 rounded bg-slate-100">
                            {b.eta_days}d
                          </span>
                        )}
                      </div>
                      {b.notes && (
                        <div className="mt-1 text-sm text-slate-600">
                          {b.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
