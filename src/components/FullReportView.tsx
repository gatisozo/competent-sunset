import React from "react";
import { analyzeUrl } from "../lib/analyze";
import type {
  CroReport,
  FullReport,
  FreeReport,
  Suggestion,
  SectionPresence,
  ContentAuditItem,
  BacklogItem,
} from "../lib/analyze";

// pretty print keys like "value_prop" -> "value prop" without using replaceAll
const pretty = (s: string) => s.replace(/_/g, " ");

// Query param helper
function useQuery() {
  const [q, setQ] = React.useState<URLSearchParams>(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams()
  );
  React.useEffect(() => {
    const onPop = () => setQ(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return q;
}

const card = "rounded-2xl border bg-white p-4 md:p-5";
const badge =
  "inline-flex items-center px-2 py-0.5 rounded-full text-xs border";

export default function FullReportView() {
  const q = useQuery();
  const initialUrl = q.get("url") || "";
  const isSample = q.get("sample") === "1";

  const [url, setUrl] = React.useState(initialUrl);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [report, setReport] = React.useState<CroReport | null>(null);

  React.useEffect(() => {
    if (isSample) {
      setReport(sampleFullReport);
      return;
    }
    if (initialUrl) void runAnalyze(initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAnalyze(target: string) {
    if (!target.trim()) return;
    setLoading(true);
    setError("");
    try {
      const r = await analyzeUrl(target, "full");
      setReport(r);
    } catch (e: any) {
      setError(String(e?.message || "Analyze failed"));
    } finally {
      setLoading(false);
    }
  }

  function onAnalyzeClick() {
    const val = url.trim();
    if (!val) return;
    const u = new URL(window.location.href);
    u.searchParams.set("url", val);
    u.searchParams.delete("sample");
    window.history.pushState({}, "", u.toString());
    void runAnalyze(val);
  }

  function onDownloadPdf() {
    window.print(); // dev: users can “Save as PDF”
  }

  function onSendPdf() {
    const link = window.location.href;
    const subject = encodeURIComponent("Holbox AI – Full Report PDF");
    const body = encodeURIComponent(
      `Please send me the PDF of this report:\n\n${link}\n`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  // Safe getters (work for both Free & Full)
  const score =
    report && typeof (report as any).score === "number"
      ? ((report as any).score as number)
      : null;
  const sections: SectionPresence | undefined = (report as any)
    ?.sections_detected;
  const quickWins: string[] | undefined = (report as any)?.quick_wins;

  const findings: Suggestion[] =
    ((report as FullReport)?.findings as Suggestion[]) ||
    ((report as FreeReport)?.hero?.suggestions || []).concat(
      (report as FreeReport)?.next_section?.suggestions || []
    );

  const backlog: BacklogItem[] | undefined = (report as any)
    ?.prioritized_backlog;
  const pageUrl: string | undefined =
    (report as FullReport)?.page?.url || (report as any)?.url;
  const pageTitle: string | undefined = (report as FullReport)?.page?.title;
  const screenshotUrl: string | null | undefined = (report as any)?.assets
    ?.screenshot_url;
  const suggestedShot: string | undefined =
    (report as any)?.assets?.suggested_screenshot_url ||
    screenshotUrl ||
    undefined;

  const contentAudit: ContentAuditItem[] | undefined = (report as FullReport)
    ?.content_audit;
  // Crop the image to the top (hero) using CSS – no external service needed
  const heroCropWrap = "rounded-xl overflow-hidden border bg-white h-[520px]"; // adjust height as you like
  const heroCropImg: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "top", // <-- top crop (hero)
  };

  // Decide if a finding is hero-related (simple heuristic)
  function isHeroFinding(title: string) {
    const t = title.toLowerCase();
    return (
      t.includes("hero") ||
      t.includes("above the fold") ||
      t.includes("headline") ||
      t.includes("cta")
    );
  }

  // Only render a shot if at least one section actually needs work
  function hasMeaningfulIssues(
    findings: { title: string }[] = [],
    contentAudit?: { section: string; status: "ok" | "weak" | "missing" }[]
  ) {
    const anyHeroFinding = findings.some((f) => isHeroFinding(f.title));
    const anyWeak = (contentAudit || []).some((c) => c.status !== "ok");
    return anyHeroFinding || anyWeak;
  }

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-900 print:bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-3 md:px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl md:text-3xl font-semibold">Full Report</h1>
          <div className="flex gap-2 md:gap-3">
            <button
              onClick={onDownloadPdf}
              className="rounded-lg border px-3 py-2 text-sm bg-white hover:bg-slate-50"
            >
              Download PDF
            </button>
            <button
              onClick={onSendPdf}
              className="rounded-lg px-3 py-2 text-sm bg-[#006D77] text-white hover:opacity-90"
            >
              Email PDF
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-3 md:px-4 py-4 md:py-6">
        {/* Analyzer bar */}
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 rounded-lg border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-[#83C5BE]"
          />
          <button
            onClick={onAnalyzeClick}
            disabled={loading || !url.trim()}
            className="rounded-lg px-4 py-2 bg-[#006D77] text-white disabled:opacity-60"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>

        {/* PAGE META + SCREENSHOT */}
        <div className="mt-4 grid gap-4 md:gap-5 md:grid-cols-3">
          <div className={`md:col-span-2 ${card}`}>
            <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2">
              <div>
                <div className="text-sm text-slate-500">URL</div>
                <div className="font-medium break-all">{pageUrl || "—"}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Title</div>
                <div className="font-medium">{pageTitle || "—"}</div>
              </div>
            </div>
            {screenshotUrl && (
              <div className="mt-3 rounded-xl overflow-hidden border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={screenshotUrl}
                  alt="Page screenshot"
                  className="w-full h-auto block"
                />
              </div>
            )}
          </div>

          {/* Score + Sections quick glance */}
          <div className="grid gap-4">
            <div className={card}>
              <div className="text-sm text-slate-500">Score</div>
              <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-[#006D77]"
                  style={{ width: `${score ?? 0}%` }}
                />
              </div>
              <div className="mt-1 text-sm">
                {score != null ? `${score} / 100` : "—"}
              </div>
            </div>

            <div className={card}>
              <div className="font-medium mb-2">Sections Present</div>
              {sections ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {Object.entries(sections).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          val ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                      <span className={`${val ? "" : "text-slate-400"}`}>
                        {pretty(String(key))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">—</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid md:grid-cols-3 gap-4 md:gap-5">
          {/* LEFT column */}
          <div className="grid gap-4">
            <div className={card}>
              <div className="font-medium mb-2">Quick Wins</div>
              {quickWins?.length ? (
                <ul className="text-sm text-slate-700 space-y-1">
                  {quickWins.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-slate-500">—</div>
              )}
            </div>

            <div className={card}>
              <div className="font-medium mb-2">Prioritized Backlog</div>
              {backlog && backlog.length ? (
                <div className="space-y-2">
                  {backlog.map((b, i) => (
                    <div key={i} className="rounded-lg border p-3">
                      <div className="font-medium">{b.title}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        <span className={badge}>Impact {b.impact}</span>
                        <span className={badge}>Effort {b.effort}</span>
                        {b.eta_days != null && (
                          <span className={badge}>{b.eta_days}d</span>
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
              ) : (
                <div className="text-sm text-slate-500">—</div>
              )}
            </div>
          </div>

          {/* RIGHT column */}
          <div className={`md:col-span-2 ${card}`}>
            <div className="flex items-center justify-between">
              <div className="font-medium">Findings</div>
              <span className={`${badge} bg-slate-50`}>
                {findings.length} items
              </span>
            </div>

            <div className="mt-3 space-y-3">
              {findings.length ? (
                findings.map((f, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium">{f.title}</div>
                      <span
                        className={`${badge} ${
                          f.impact === "high"
                            ? "border-red-300 bg-red-50"
                            : f.impact === "medium"
                            ? "border-amber-300 bg-amber-50"
                            : "border-emerald-300 bg-emerald-50"
                        }`}
                      >
                        {f.impact}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {f.recommendation}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">—</div>
              )}
            </div>

            {/* Content Audit */}
            <div className="mt-6">
              <div className="font-medium">Content Audit</div>
              <div className="text-sm text-slate-600">
                Presence & quality of key landing sections, with copy
                suggestions.
              </div>
              {contentAudit?.length ? (
                <div className="mt-3 divide-y border rounded-xl overflow-hidden">
                  {contentAudit.map((c, i) => (
                    <div key={i} className="p-3 md:p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-medium capitalize">
                          {pretty(c.section)}
                        </div>
                        <span
                          className={`${badge} ${
                            c.status === "ok"
                              ? "border-emerald-300 bg-emerald-50"
                              : c.status === "weak"
                              ? "border-amber-300 bg-amber-50"
                              : "border-slate-300 bg-slate-50"
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                      {c.rationale && (
                        <div className="mt-1 text-sm text-slate-600">
                          {c.rationale}
                        </div>
                      )}
                      {c.suggestions?.length ? (
                        <ul className="mt-2 text-sm text-slate-700 space-y-1">
                          {c.suggestions.map((sug, j) => (
                            <li key={j}>• {sug}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-sm text-slate-500">—</div>
              )}
            </div>

      {/* Visual: Hero Snapshot (cropped) */}
{hasMeaningfulIssues(findings, contentAudit) && screenshotUrl && (
  <div className="mt-6">
    <div className="font-medium">Hero Snapshot (top of page)</div>
    <div className="text-sm text-slate-600">
      Cropped to the first viewport for clarity. Suggestions overlay shows the most impactful fixes.
    </div>

    {(() => {
      const isSameShot = !suggestedShot || suggestedShot === screenshotUrl;
      const topSuggestions = (findings as Suggestion[]).filter(f => isHeroFinding(f.title)).slice(0, 3);
      const fallbackTop = (findings as Suggestion[]).slice(0, 3);
      const overlayList = (topSuggestions.length ? topSuggestions : fallbackTop);

      if (isSameShot) {
        // Single image with overlay (avoid duplicates)
        return (
          <div className={`${heroCropWrap} relative mt-2`}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img src={screenshotUrl} style={heroCropImg} />
            {overlayList.length > 0 && (
              <div className="absolute right-2 bottom-2 bg-white/95 border rounded-lg p-3 text-xs max-w-[85%] shadow">
                <div className="font-medium mb-1">Top hero suggestions</div>
                <ul className="space-y-1">
                  {overlayList.map((s, i) => (
                    <li key={i}>• <b>{s.title}</b> — {s.recommendation}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      }

      // Two images only if suggested != original (future: real annotated mockup)
      return (
        <div className="grid md:grid-cols-2 gap-3 mt-2">
          <div className={heroCropWrap}>
            <div className="px-3 py-2 text-sm border-b">Before (current)</div>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img src={screenshotUrl} style={heroCropImg} />
          </div>
          <div className={`${heroCropWrap} relative`}>
            <div className="px-3 py-2 text-sm border-b">Suggested</div>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img src={suggestedShot || screenshotUrl} style={heroCropImg} />
            {overlayList.length > 0 && (
              <div className="absolute right-2 bottom-2 bg-white/95 border rounded-lg p-3 text-xs max-w-[85%] shadow">
                <div className="font-medium mb-1">Top hero suggestions</div>
                <ul className="space-y-1">
                  {overlayList.map((s, i) => (
                    <li key={i}>• <b>{s.title}</b> — {s.recommendation}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      );
    })()}

    <div className="mt-1 text-xs text-slate-500">
      * We show only sections with issues. For now we crop to the hero; more precise element crops can be added later.
    </div>
  </div>
)}


        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

/** ---------- SAMPLE DATA FOR /full?sample=1 ---------- */
const sampleFullReport: FullReport = {
  score: 74,
  summary:
    "Solid baseline, but hero clarity and CTA contrast limit conversions.",
  key_findings: [
    {
      title: "Hero message unclear on mobile",
      impact: "low",
      recommendation: "Shorten headline and keep CTA in first viewport.",
    },
    {
      title: "Primary CTA has low contrast",
      impact: "low",
      recommendation: "Increase color contrast and add hover/focus styles.",
    },
  ],
  quick_wins: [
    "Compress hero image",
    "Move CTA above fold",
    "Add social proof",
  ],
  risks: [],
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
  findings: [
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
    {
      title: "LCP image oversized — performance",
      impact: "medium",
      recommendation:
        "Serve responsive images (srcset) and preload hero asset.",
    },
  ],
  prioritized_backlog: [
    { title: "Fix hero value + CTA", impact: 3, effort: 1, eta_days: 1 },
    { title: "Responsive hero image", impact: 3, effort: 2, eta_days: 2 },
    { title: "Add trust badges", impact: 2, effort: 1, eta_days: 1 },
  ],
  content_audit: [
    {
      section: "hero",
      status: "weak",
      rationale:
        "Headline not benefit-driven; CTA not visible on first viewport on smaller screens.",
      suggestions: [
        "Rewrite headline to reflect primary outcome (e.g., 'Balance hormones in 30 days').",
        "Ensure CTA is visible without scrolling on mobile.",
      ],
    },
    {
      section: "value_prop",
      status: "ok",
      rationale: "Bulleted benefits are present.",
      suggestions: ["Add one proof-point (stat or certification)."],
    },
    {
      section: "social_proof",
      status: "missing",
      rationale: "No testimonials, badges, or case studies above the fold.",
      suggestions: ["Add 2–3 testimonials and partner logos near the CTA."],
    },
  ],
  page: {
    url: "https://menopauze.lv",
    title: "Menopauze — hormonālā labsajūta",
  },
  assets: {
    screenshot_url:
      "https://dummyimage.com/1200x700/edf2f7/111827.png&text=Screenshot+(sample)",
    suggested_screenshot_url:
      "https://dummyimage.com/1200x700/f7fafc/111827.png&text=Suggested+(sample)",
  },
};
