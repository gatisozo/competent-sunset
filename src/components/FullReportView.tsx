import React, { useEffect, useMemo, useState } from "react";
import {
  analyzeUrl, // kept for non-stream fallback if needed
  type FullReport,
  type Suggestion,
  type ContentAuditItem,
} from "../lib/analyze";

/* ---------------- utilities ---------------- */
function getQS(name: string): string | null {
  if (typeof window === "undefined") return null;
  const m = new URLSearchParams(window.location.search).get(name);
  return m ? decodeURIComponent(m) : null;
}
function clsx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
function animateNumber(
  setter: (n: number) => void,
  from: number,
  to: number,
  ms = 900
) {
  const start = performance.now(),
    delta = to - from;
  const tick = (now: number) => {
    const t = clamp((now - start) / ms, 0, 1);
    const eased = easeOutCubic(t);
    setter(from + delta * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* -------------- hero image crop -------------- */
const heroCropWrap = "rounded-xl overflow-hidden border bg-white h-[520px]";
const heroCropImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "top",
};
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
  audit?: { section: string; status: "ok" | "weak" | "missing" }[]
) {
  const hf = findings.some((f) => isHeroFinding(f.title));
  const wk = (audit || []).some((c) => c.status !== "ok");
  return hf || wk;
}

/* -------------- scoring -------------- */
function computeScore(
  findings: Suggestion[] = [],
  audit: ContentAuditItem[] = []
) {
  let score = 100;
  for (const f of findings)
    score -= f.impact === "high" ? 10 : f.impact === "medium" ? 5 : 2;
  for (const c of audit)
    score -= c.status === "missing" ? 5 : c.status === "weak" ? 2 : 0;
  return clamp(Math.round(score), 0, 100);
}
const impactToLift: Record<number, string> = {
  3: "≈ +20% leads",
  2: "≈ +10% leads",
  1: "≈ +5% leads",
};

/* -------------- component -------------- */
export default function FullReportView() {
  const [url, setUrl] = useState<string>(() => getQS("url") || "");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>("");
  const [report, setReport] = useState<FullReport | null>(null);
  const [displayScore, setDisplayScore] = useState(0);

  // analyze on load only if url exists in QS
  useEffect(() => {
    const qsUrl = getQS("url");
    if (qsUrl) startStreaming(qsUrl, "full");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-animate score when report arrives
  useEffect(() => {
    if (!report) return;
    const target = computeScore(report.findings, report.content_audit || []);
    animateNumber(setDisplayScore, displayScore, target, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  /* ---------- streaming ---------- */
  function startStreaming(u: string, mode: "free" | "full" = "full") {
    try {
      setLoading(true);
      setError("");
      setProgress(0);
      setReport(null);

      const base = "/api/analyze-stream";
      const src = `${base}?url=${encodeURIComponent(
        u
      )}&mode=${mode}&sid=${Date.now()}`;

      const es = new EventSource(src);

      es.addEventListener("progress", (e: any) => {
        try {
          const { value } = JSON.parse(e.data);
          setProgress(value ?? 0);
        } catch {}
      });
      es.addEventListener("result", (e: any) => {
        try {
          const data = JSON.parse(e.data);
          setReport(data);
          setProgress(100);
        } catch (err: any) {
          setError("Invalid result format");
        } finally {
          es.close();
          setLoading(false);
        }
      });
      es.addEventListener("error", (e: any) => {
        try {
          const data = e.data ? JSON.parse(e.data) : null;
          setError(data?.message || "Stream error");
        } catch {
          setError("Stream error");
        } finally {
          es.close();
          setLoading(false);
        }
      });
      // network errors also trigger onerror without .data
      es.onerror = () => {
        /* handled above */
      };
    } catch (err: any) {
      setError(err?.message || "Could not start stream");
      setLoading(false);
    }
  }

  /* ---------- handlers ---------- */
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && url.trim()) startStreaming(url.trim(), "full");
  };
  const runAnalyze = () => {
    if (url.trim()) startStreaming(url.trim(), "full");
  };

  /* ---------- derived ---------- */
  const findings = (report?.findings || []) as Suggestion[];
  const contentAudit = report?.content_audit as ContentAuditItem[] | undefined;
  const screenshotUrl = report?.assets?.screenshot_url || null;
  const suggestedShot = report?.assets?.suggested_screenshot_url || null;

  const topHeroSuggestions = useMemo(() => {
    const heroOnes = findings.filter((f) => isHeroFinding(f.title));
    return (heroOnes.length ? heroOnes : findings).slice(0, 3);
  }, [findings]);

  // Quick-wins overall lift = 3% per item (cap 30%) — visible big pill
  const quickWinsLiftPct = useMemo(() => {
    const n = report?.quick_wins?.length ?? 0;
    return Math.min(30, n * 3);
  }, [report?.quick_wins]);

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
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={onKey}
            placeholder="yourdomain.com"
            className="flex-1 rounded-lg px-3 py-2 bg-white border outline-none focus:ring-2 focus:ring-[#83C5BE]"
          />
          <button
            disabled={loading || !url.trim()}
            onClick={runAnalyze}
            className="rounded-lg px-4 py-2 bg-[#006D77] text-white disabled:opacity-60"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>

        {/* Streaming progress */}
        {loading && (
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-[#006D77] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
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
                    <div className="pt-1">
                      <span
                        className={clsx(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          f.impact === "high" && "bg-red-100 text-red-700",
                          f.impact === "medium" &&
                            "bg-amber-100 text-amber-700",
                          f.impact === "low" &&
                            "bg-emerald-100 text-emerald-700"
                        )}
                      >
                        {(f.impact || "low").toUpperCase()}
                      </span>
                    </div>
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
          {/* Score (animated) */}
          <div className="rounded-xl border bg-white p-3">
            <div className="text-sm text-slate-600">Score</div>
            <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-[#006D77]"
                style={{ width: `${clamp(displayScore, 0, 100)}%` }}
              />
            </div>
            <div className="mt-1 text-sm">{Math.round(displayScore)} / 100</div>
            {loading && (
              <div className="mt-1 text-xs text-slate-500">
                Streaming analysis…
              </div>
            )}
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

          {/* Quick wins + overall lift */}
          {report?.quick_wins && report.quick_wins.length > 0 && (
            <div className="rounded-xl border bg-white p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Quick Wins</div>
                <div className="px-3 py-1 rounded-full text-xs md:text-sm font-semibold bg-emerald-100 text-emerald-800">
                  ≈ +{quickWinsLiftPct}% leads (if all done)
                </div>
              </div>
              <ul className="text-sm text-slate-700 list-disc pl-5 mt-2">
                {report.quick_wins.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Backlog with big conversion-lift badges */}
          {report?.prioritized_backlog &&
            report.prioritized_backlog.length > 0 && (
              <div className="rounded-xl border bg-white p-3">
                <div className="font-medium mb-2">Prioritized Backlog</div>
                <div className="space-y-3">
                  {report.prioritized_backlog.map((b, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{b.title}</div>
                        <span className="px-3 py-1 rounded-full text-xs md:text-sm font-semibold bg-emerald-100 text-emerald-800">
                          {impactToLift[b.impact] || "Potential lift"}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-600 flex flex-wrap items-center gap-2">
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
