// src/components/FullReportView.tsx
import React, { useEffect, useMemo, useState } from "react";

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
    setter(from + delta * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
function useSmartScreenshot(primary?: string | null, backup?: string | null) {
  const [src, setSrc] = useState<string | null>(primary || null);
  const [loading, setLoading] = useState<boolean>(!!primary);
  const [retries, setRetries] = useState(0);
  const MAX = 3;
  useEffect(() => {
    setSrc(primary || null);
    setLoading(!!primary);
    setRetries(0);
  }, [primary]);
  const bust = (u: string) =>
    `${u}${u.includes("?") ? "&" : "?"}cb=${Date.now()}`;
  const onLoad = (e?: any) => {
    const img = e?.currentTarget as HTMLImageElement | undefined;
    const tiny =
      (img?.naturalWidth || 0) <= 300 || (img?.naturalHeight || 0) <= 200;
    if (tiny && retries < MAX && src) {
      setTimeout(() => {
        setSrc(bust(src));
        setRetries((r) => r + 1);
      }, 1500);
      return;
    }
    setLoading(false);
  };
  const onError = () => {
    if (backup && src !== backup) {
      setSrc(bust(backup));
      setLoading(true);
      return;
    }
    if (src && retries < MAX) {
      setSrc(bust(src));
      setRetries((r) => r + 1);
    } else setLoading(false);
  };
  return { src: src || undefined, loading, onLoad, onError };
}

type Impact = "high" | "medium" | "low";
type Finding = { title: string; impact: Impact; recommendation: string };
type BacklogItem = { title: string; impact: Impact; eta_days?: number };
type AuditRow = {
  section: string;
  status: "ok" | "weak" | "missing";
  rationale: string;
  suggestions: string[];
};
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

function computeScoreSafe(findings: Finding[] = [], audit: AuditRow[] = []) {
  let score = 100;
  for (const f of findings)
    score -= f.impact === "high" ? 10 : f.impact === "medium" ? 5 : 2;
  for (const c of audit)
    score -= c.status === "missing" ? 5 : c.status === "weak" ? 2 : 0;
  return clamp(Math.round(score), 0, 100);
}
function scoreBarColor(n: number) {
  return n >= 80 ? "bg-emerald-500" : n >= 60 ? "bg-amber-500" : "bg-rose-500";
}
function chipColor(imp: Impact) {
  return imp === "high"
    ? "bg-rose-100 text-rose-800 border-rose-200"
    : imp === "medium"
    ? "bg-amber-100 text-amber-800 border-amber-200"
    : "bg-emerald-100 text-emerald-800 border-emerald-200";
}

export default function FullReportView() {
  const autostart = getQS("autostart") === "1";
  const qsUrl = getQS("url") || "";
  const [url, setUrl] = useState(qsUrl);
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [score, setScore] = useState(0);
  const [error, setError] = useState("");

  const heroPrimary = useMemo(
    () =>
      report?.screenshots?.hero
        ? report.screenshots.hero
        : url
        ? buildScreenshotUrl(url)
        : undefined,
    [report?.screenshots?.hero, url]
  );
  const heroBackup = useMemo(
    () =>
      url
        ? `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`
        : undefined,
    [url]
  );
  const heroImg = useSmartScreenshot(heroPrimary, heroBackup);

  useEffect(() => {
    if (!report) return;
    const s =
      typeof report.score === "number"
        ? report.score
        : computeScoreSafe(report.key_findings, report.content_audit || []);
    animateNumber(setScore, 0, s, 900);
  }, [report]);

  async function startStream(u: string) {
    const target = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    setLoading(true);
    setProgress(0);
    setError("");
    setReport(null);
    const es = new EventSource(
      `/api/analyze-stream?url=${encodeURIComponent(
        target
      )}&mode=full&sid=${Date.now()}`
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
        const s =
          typeof data.score === "number"
            ? data.score
            : computeScoreSafe(data.key_findings, data.content_audit || []);
        animateNumber(setScore, 0, s, 800);
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
    if (autostart && url) startStream(url); /* eslint-disable-next-line */
  }, [autostart]);

  return (
    <div className="min-h-screen bg-[#EDF6F9]">
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 border-b">
        <div className="mx-auto max-w-[1200px] px-4 py-3 flex items-center justify-between">
          <a href="/" className="font-semibold">
            Holbox AI
          </a>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter your website URL"
              className="rounded-xl px-3 py-2 border bg-white"
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim()) startStream(url);
              }}
            />
            <button
              onClick={() => startStream(url)}
              disabled={loading || !url.trim()}
              className="rounded-xl px-4 py-2 bg-[#006D77] text-white disabled:opacity-60"
            >
              {loading ? "Analyzing…" : "Run Full Audit"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6">
        {(loading || progress > 0) && (
          <div className="mb-4">
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
          <div className="mb-4 rounded-lg border bg-rose-50 text-rose-800 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {!report && !loading && (
          <div className="rounded-2xl border bg-white p-6 text-slate-600">
            Enter your URL above and click <b>Run Full Audit</b> to start the
            analysis.
          </div>
        )}

        {report && (
          <div className="grid md:grid-cols-[1.2fr,0.8fr] gap-6">
            {/* MAIN */}
            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">URL</div>
                  <div className="font-medium">{report.url}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Grade</div>
                  <div className="mt-1 h-3 rounded-full bg-slate-200 overflow-hidden w-48">
                    <div
                      className={clsx("h-full", scoreBarColor(score))}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <div className="text-sm mt-1">{score} / 100</div>
                </div>
              </div>

              <div className="mt-5">
                <div className="rounded-xl overflow-hidden border bg-white h-[520px]">
                  {heroImg.src ? (
                    <img
                      src={heroImg.src}
                      onLoad={heroImg.onLoad}
                      onError={heroImg.onError}
                      alt="Hero screenshot"
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-slate-400">
                      no image
                    </div>
                  )}
                </div>
                {heroImg.loading && (
                  <div className="mt-2 text-xs text-slate-500">
                    Loading screenshot…
                  </div>
                )}
              </div>

              {report.summary && (
                <div className="mt-6">
                  <div className="text-sm text-slate-500">Summary</div>
                  <div className="mt-1 text-slate-800">{report.summary}</div>
                </div>
              )}

              <div className="mt-6">
                <div className="text-sm text-slate-500">Key Findings</div>
                <div className="mt-2 space-y-3">
                  {report.key_findings.map((f, i) => (
                    <div key={i} className="rounded-xl border p-3 bg-white">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{f.title}</div>
                        <span
                          className={clsx(
                            "px-2 py-0.5 rounded text-xs border",
                            chipColor(f.impact)
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

              {!!(report.quick_wins || []).length && (
                <div className="mt-6">
                  <div className="text-sm text-slate-500">Quick Wins</div>
                  <ul className="mt-2 space-y-2">
                    {(report.quick_wins || []).map((w, i) => (
                      <li
                        key={i}
                        className="rounded-lg border px-3 py-2 text-slate-800 bg-emerald-50/40"
                      >
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!!(report.content_audit || []).length && (
                <div className="mt-6">
                  <div className="text-sm text-slate-500">Content Audit</div>
                  <div className="mt-2 grid md:grid-cols-2 gap-3">
                    {(report.content_audit || []).map((row, i) => (
                      <div key={i} className="rounded-xl border p-3 bg-white">
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

              {!!(report.prioritized_backlog || []).length && (
                <div className="mt-6">
                  <div className="text-sm text-slate-500">
                    Prioritized Backlog
                  </div>
                  <div className="mt-2 space-y-3">
                    {(report.prioritized_backlog || []).map((b, i) => (
                      <div key={i} className="rounded-xl border p-3 bg-white">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{b.title}</div>
                          <div className="flex items-center gap-2">
                            <span
                              className={clsx(
                                "px-2 py-0.5 rounded text-xs border",
                                chipColor(b.impact)
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
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ASIDE */}
            <aside className="rounded-2xl border bg-white p-5 space-y-5">
              <div>
                <div className="text-sm text-slate-500">
                  Your Website’s Grade
                </div>
                <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={clsx("h-full", scoreBarColor(score))}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <div className="mt-2 text-sm">{score} / 100</div>
              </div>

              {!!(report.quick_wins || []).length && (
                <div>
                  <div className="text-sm text-slate-500">Quick Wins</div>
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

              <button
                onClick={() => alert("TODO: implement PDF sender")}
                className="w-full rounded-xl px-5 py-3 bg-[#FFDDD2] text-slate-900 font-medium hover:opacity-90"
              >
                Send PDF
              </button>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
