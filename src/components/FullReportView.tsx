// src/components/FullReportView.tsx
import React, { useEffect, useMemo, useState } from "react";

/* helpers */
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
function buildScreenshotUrl(target: string) {
  const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  const tmpl =
    (import.meta as any).env?.VITE_SCREENSHOT_URL_TMPL ||
    (typeof process !== "undefined" &&
      (process as any).env?.VITE_SCREENSHOT_URL_TMPL);
  if (tmpl) return String(tmpl).replace("{URL}", encodeURIComponent(url));
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}
function scoreBarColor(n: number) {
  if (n >= 80) return "bg-emerald-500";
  if (n >= 60) return "bg-amber-500";
  return "bg-rose-500";
}

/* datu tips (minimālais kopums, ko dod tavs backend) */
type Impact = "high" | "medium" | "low";
type Finding = { title: string; impact: Impact; recommendation: string };
type AuditRow = {
  section: string;
  status: "ok" | "weak" | "missing";
  rationale: string;
  suggestions: string[];
};
type BacklogItem = { title: string; impact: Impact; eta_days?: number };
type FullReport = {
  url: string;
  title?: string;
  score?: number;
  summary?: string;
  key_findings: Finding[];
  quick_wins?: string[];
  prioritized_backlog?: BacklogItem[];
  content_audit?: AuditRow[];
  screenshots?: { hero?: string | null } | null;
};

export default function FullReportView() {
  const autostart = getQS("autostart") === "1";
  const qUrl = getQS("url") || "";

  const [url, setUrl] = useState<string>(qUrl ? qUrl : "");
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const score = useMemo(() => {
    if (!report) return 0;
    if (typeof report.score === "number") return clamp(report.score, 0, 100);
    // ja backend nesūta score, vienkāršs calcul.
    let s = 100;
    for (const f of report.key_findings || [])
      s -= f.impact === "high" ? 10 : f.impact === "medium" ? 5 : 2;
    for (const c of report.content_audit || [])
      s -= c.status === "missing" ? 5 : c.status === "weak" ? 2 : 0;
    return clamp(Math.round(s), 0, 100);
  }, [report]);

  const heroSrc = useMemo(() => {
    if (report?.screenshots?.hero) return report.screenshots.hero!;
    return url ? buildScreenshotUrl(url) : undefined;
  }, [report?.screenshots?.hero, url]);

  async function startStream(u: string, mode: "full" | "free" = "full") {
    const target = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    setLoading(true);
    setProgress(0);
    setError("");
    setReport(null);

    const es = new EventSource(
      `/api/analyze-stream?url=${encodeURIComponent(
        target
      )}&mode=${mode}&sid=${Date.now()}`
    );

    es.addEventListener("progress", (e: any) => {
      try {
        const { value } = JSON.parse(e.data);
        setProgress(value ?? 0);
      } catch {}
    });

    es.addEventListener("result", (e: any) => {
      try {
        const data = JSON.parse(e.data) as FullReport;
        setReport(data);
        setProgress(100);
      } catch {
        setError("Invalid result format");
      } finally {
        es.close();
        setLoading(false);
      }
    });

    es.addEventListener("error", () => {
      setError("Stream error");
      es.close();
      setLoading(false);
    });
  }

  useEffect(() => {
    if (autostart && url) startStream(url, "full");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart]);

  return (
    <div className="min-h-screen bg-[#EAF4F6]">
      {/* top bar */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-[1200px] px-4 py-3 flex items-center gap-2">
          <div className="text-lg font-semibold">Full Report</div>
          <div className="ml-auto flex gap-2">
            <button className="rounded-lg border bg-white px-3 py-1.5 text-sm">
              Download PDF
            </button>
            <button className="rounded-lg border bg-white px-3 py-1.5 text-sm">
              Email PDF
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1200px] px-4 py-6">
        {/* input + analyze */}
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="menopauze.lv"
            className="flex-1 rounded-xl px-3 py-2 border bg-white"
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim()) startStream(url, "full");
            }}
          />
          <button
            onClick={() => startStream(url, "full")}
            disabled={loading || !url.trim()}
            className="rounded-xl px-4 py-2 bg-[#006D77] text-white disabled:opacity-60"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>

        {(loading || progress > 0) && (
          <div className="mt-3">
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={clsx(
                  "h-full",
                  scoreBarColor(progress >= 99 ? 80 : 60)
                )}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          </div>
        )}
        {!!error && (
          <div className="mt-3 rounded-lg border bg-rose-50 text-rose-800 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {/* info + score + hero */}
        {report && (
          <div className="mt-4 grid md:grid-cols-[1.2fr,0.8fr] gap-6">
            {/* left column */}
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-xl border bg-white p-3 text-sm">
                  <div className="text-xs text-slate-500">URL</div>
                  <div className="truncate">{report.url}</div>
                </div>
                <div className="rounded-xl border bg-white p-3 text-sm">
                  <div className="text-xs text-slate-500">Title</div>
                  <div className="truncate">{report.title || "—"}</div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-3">
                <div className="text-sm text-slate-500">
                  Hero Snapshot (top of page)
                </div>
                <div className="text-xs text-slate-500">
                  Cropped to the first viewport for clarity. Suggestions overlay
                  shows the most impactful fixes.
                </div>
                <div className="mt-3 rounded-xl overflow-hidden border bg-white h-[520px]">
                  {heroSrc ? (
                    <img
                      src={heroSrc}
                      className="w-full h-full object-cover object-top"
                      alt="hero"
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
                      Hero Section Effectiveness — include a direct
                      call-to-action above the fold.
                    </li>
                  </ul>
                </div>
              </div>

              {/* Findings */}
              {!!(report.key_findings || []).length && (
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-sm font-medium">Findings</div>
                  <div className="mt-2 space-y-3">
                    {report.key_findings.map((f, i) => (
                      <div key={i} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{f.title}</div>
                          <span
                            className={clsx(
                              "px-2 py-0.5 rounded text-xs border",
                              f.impact === "high" &&
                                "bg-rose-100 text-rose-800 border-rose-200",
                              f.impact === "medium" &&
                                "bg-amber-100 text-amber-800 border-amber-200",
                              f.impact === "low" &&
                                "bg-emerald-100 text-emerald-800 border-emerald-200"
                            )}
                          >
                            {f.impact}
                          </span>
                        </div>
                        <div className="text-slate-700 mt-1">
                          {f.recommendation}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Content Audit */}
              {!!(report.content_audit || []).length && (
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-sm font-medium">Content Audit</div>
                  <div className="mt-2 grid md:grid-cols-2 gap-3">
                    {(report.content_audit || []).map((row, i) => (
                      <div key={i} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium capitalize">
                            {row.section}
                          </div>
                          <span
                            className={clsx(
                              "px-2 py-0.5 rounded text-xs border",
                              row.status === "ok" &&
                                "bg-emerald-100 text-emerald-800 border-emerald-200",
                              row.status === "weak" &&
                                "bg-amber-100 text-amber-800 border-amber-200",
                              row.status === "missing" &&
                                "bg-rose-100 text-rose-800 border-rose-200"
                            )}
                          >
                            {row.status}
                          </span>
                        </div>
                        <div className="text-slate-700 mt-1">
                          {row.rationale}
                        </div>
                        {!!row.suggestions?.length && (
                          <ul className="mt-2 list-disc pl-5 text-slate-700">
                            {row.suggestions.map((s, j) => (
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

            {/* right column */}
            <aside className="space-y-4">
              <div className="rounded-2xl border bg-white p-5">
                <div className="text-sm font-medium text-slate-700">Score</div>
                <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={clsx("h-full", scoreBarColor(score))}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <div className="mt-2 text-sm">{score} / 100</div>
              </div>

              <div className="rounded-2xl border bg-white p-5">
                <div className="text-sm font-medium text-slate-700">
                  Sections Present
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {[
                    "Hero",
                    "Value Prop",
                    "Social Proof",
                    "Pricing",
                    "Features",
                    "Faq",
                    "Contact",
                    "Footer",
                  ].map((name, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {!!(report.quick_wins || []).length && (
                <div className="rounded-2xl border bg-white p-5">
                  <div className="text-sm font-medium text-slate-700">
                    Quick Wins
                  </div>
                  <ul className="mt-2 space-y-2">
                    {(report.quick_wins || []).map((w, i) => (
                      <li
                        key={i}
                        className="rounded-lg border px-3 py-2 bg-emerald-50/40"
                      >
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!!(report.prioritized_backlog || []).length && (
                <div className="rounded-2xl border bg-white p-5">
                  <div className="text-sm font-medium text-slate-700">
                    Prioritized Backlog
                  </div>
                  <div className="mt-2 space-y-2">
                    {(report.prioritized_backlog || []).map((b, i) => (
                      <div
                        key={i}
                        className="rounded-lg border px-3 py-2 flex items-center justify-between"
                      >
                        <div>{b.title}</div>
                        <div className="flex items-center gap-2">
                          <span
                            className={clsx(
                              "px-2 py-0.5 rounded text-xs border",
                              b.impact === "high" &&
                                "bg-rose-100 text-rose-800 border-rose-200",
                              b.impact === "medium" &&
                                "bg-amber-100 text-amber-800 border-amber-200",
                              b.impact === "low" &&
                                "bg-emerald-100 text-emerald-800 border-emerald-200"
                            )}
                          >
                            {b.impact}
                          </span>
                          {!!b.eta_days && (
                            <span className="px-2 py-0.5 rounded text-xs border bg-slate-50 text-slate-700">
                              ETA {b.eta_days}d
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
