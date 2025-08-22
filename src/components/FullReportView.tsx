// src/components/FullReportView.tsx
import React, { useEffect, useMemo, useState } from "react";

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
  const start = performance.now();
  const delta = to - from;
  const tick = (now: number) => {
    const t = clamp((now - start) / ms, 0, 1);
    const eased = easeOutCubic(t);
    setter(from + delta * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* -------------- hero screenshot URL (primary via env template + backup) --- */
function buildScreenshotUrl(target: string) {
  const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  const tmpl =
    (import.meta as any).env?.VITE_SCREENSHOT_URL_TMPL ||
    (typeof process !== "undefined" &&
      (process as any).env?.VITE_SCREENSHOT_URL_TMPL);
  if (tmpl) return String(tmpl).replace("{URL}", encodeURIComponent(url));
  // fallback (WordPress mShots)
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}

/* -------------- smart screenshot (spinner + retry + backup) -------------- */
function useSmartScreenshot(primary?: string | null, backup?: string | null) {
  const [src, setSrc] = useState<string | null>(primary || null);
  const [loading, setLoading] = useState<boolean>(!!primary);
  const [retries, setRetries] = useState(0);
  const MAX_RETRIES = 3;

  useEffect(() => {
    setSrc(primary || null);
    setLoading(!!primary);
    setRetries(0);
  }, [primary]);

  const withCacheBuster = (u: string) => `${u}${u.includes("?") ? "&" : "?"}cb=${Date.now()}`;

  const onLoad = (e?: any) => {
    const img = e?.currentTarget as HTMLImageElement | undefined;
    const looksTiny = img?.naturalWidth! <= 300 || img?.naturalHeight! <= 200;
    if (looksTiny && retries < MAX_RETRIES && src) {
      setTimeout(() => {
        setSrc(withCacheBuster(src));
        setRetries((r) => r + 1);
      }, 1500);
      return;
    }
    setLoading(false);
  };

  const onError = () => {
    if (backup && src !== backup) {
      setSrc(withCacheBuster(backup));
      setLoading(true);
      return;
    }
    if (src && retries < MAX_RETRIES) {
      setSrc(withCacheBuster(src));
      setRetries((r) => r + 1);
    } else {
      setLoading(false);
    }
  };

  return { src: src || undefined, loading, onLoad, onError };
}

/* -------------- types (lokāli, lai nesalauztu free report importus) ------ */
type Impact = "high" | "medium" | "low";
type Finding = { title: string; impact: Impact; recommendation: string };
type BacklogItem = {
  title: string;
  impact: Impact;
  eta_days?: number; // no backend: ETAs skaitļos
};
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

/* -------------- scoring helpers ------------------------------------------ */
function computeScoreSafe(findings: Finding[] = [], audit: AuditRow[] = []) {
  let score = 100;
  for (const f of findings) {
    const imp = f.impact || "medium";
    score -= imp === "high" ? 10 : imp === "medium" ? 5 : 2;
  }
  for (const c of audit) {
    if (c.status === "missing") score -= 5;
    else if (c.status === "weak") score -= 2;
  }
  return clamp(Math.round(score), 0, 100);
}
function scoreBarColor(n: number) {
  if (n >= 80) return "bg-emerald-500";
  if (n >= 60) return "bg-amber-500";
  return "bg-rose-500";
}
function chipColor(imp: Impact) {
  if (imp === "high") return "bg-rose-100 text-rose-800 border-rose-200";
  if (imp === "medium") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

/* -------------- main component ------------------------------------------- */
export default function FullReportView() {
  const autostart = getQS("autostart") === "1";
  const qUrl = getQS("url") || "";

  const [url, setUrl] = useState<string>(qUrl ? qUrl : "");
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [score, setScore] = useState(0);
  const [error, setError] = useState("");

  // hero src primārais/backup
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
    () => (url ? `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200` : undefined),
    [url]
  );
  const heroImg = useSmartScreenshot(heroPrimary, heroBackup);

  // dinamiska atzīme, kad atnāk atbilde
  useEffect(() => {
    if (!report) return;
    const baseScore =
      typeof report.score === "number"
        ? report.score
        : computeScoreSafe(report.key_findings, report.content_audit || []);
    animateNumber(setScore, 0, baseScore, 900);
  }, [report]);

  // straumēšana no produkcijas /api/analyze-stream (nemainām backend)
  async function startStream(u: string, mode: "full" | "free" = "full") {
    const target = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    setLoading(true);
    setProgress(0);
    setError("");
    setReport(null);

    const src = `/api/analyze-stream?url=${encodeURIComponent(
      target
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
        const data = JSON.parse(e.data) as FullReport;
        setReport(data);
        setProgress(100);
        const baseScore =
          typeof data.score === "number"
            ? data.score
            : computeScoreSafe(data.key_findings || [], data.content_audit || []);
        animateNumber(setScore, 0, baseScore, 800);
      } catch (err: any) {
        console.error(err);
        setError("Invalid result format");
      } finally {
        es.close();
        setLoading(false);
      }
    });

    es.addEventListener("error", (e: any) => {
      try {
        const data = e?.data ? JSON.parse(e.data) : null;
        setError(data?.message || "Stream error");
      } catch {
        setError("Stream error");
      } finally {
        es.close();
        setLoading(false);
      }
    });
  }

  // autostarts no Landing "Order Full Audit"
  useEffect(() => {
    if (autostart && url) startStream(url, "full");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart]);

  /* ---------------------- UI ---------------------- */
  return (
    <div className="min-h-screen bg-[#EDF6F9]">
      {/* header */}
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 border-b">
        <div className="mx-auto max-w-[1200px] px-4 py-3 flex items-center justify-between">
          <a href="/" className="font-semibold">Holbox AI</a>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter your website URL"
              className="rounded-xl px-3 py-2 border bg-white"
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim()) startStream(url, "full");
              }}
            />
            <button
              onClick={() => startStream(url, "full")}
              disabled={loading || !url.trim()}
              className="rounded-xl px-4 py-2 bg-[#006D77] text-white disabled:opacity-60"
            >
              {loading ? "Analyzing…" : "Run Full Audit"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6">
        {/* progress + error */}
        {(loading || progress > 0) && (
          <div className="mb-4">
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={clsx("h-full", scoreBarColor(progress >= 99 ? 80 : 60))}
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
            Enter your URL above and click <b>Run Full Audit</b> to start the analysis.
          </div>
        )}

        {report && (
          <div className="grid md:grid-cols-[1.2fr,0.8fr] gap-6">
            {/* MAIN */}
            <div className="rounded-2xl border bg-white p-5">
              {/* title */}
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

              {/* hero screenshot */}
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
                  <div className="mt-2 text-xs text-slate-500">Loading screenshot…</div>
                )}
              </div>

              {/* summary */}
              {report.summary && (
                <div className="mt-6">
                  <div className="text-sm text-slate-500">Summary</div>
                  <div className="mt-1 text-slate-800">{report.summary}</div>
                </div>
              )}

              {/* Key Findings */}
              <div className="mt-6">
                <div className="text-sm text-slate-500">Key Findings</div>
                <div className="mt-2 space-y-3">
                  {report.key_findings.map((f: Finding, i: number) => (
                    <div
                      key={i}
                      className="rounded-xl border p-3 bg-white"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{f.title}</div>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-xs border",
                          chipColor(f.impact)
                        )}>
                          {f.impact}
                        </span>
                      </div>
                      <div className="text-slate-700 mt-1">{f.recommendation}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Wins */}
              {!!(report.quick_wins || []).length && (
                <div className="mt-6">
                  <div className="text-sm text-slate-500">Quick Wins</div>
                  <ul className="mt-2 space-y-2">
                    {(report.quick_wins || []).map((w: string, i: number) => (
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

              {/* Content Audit */}
              {!!(report.content_audit || []).length && (
                <div className="mt-6">
                  <div className="text-sm text-slate-500">Content Audit</div>
                  <div className="mt-2 grid md:grid-cols-2 gap-3">
                    {(report.content_audit || []).map((row: AuditRow, i: number) => (
                      <div key={i} className="rounded-xl border p-3 bg-white">
                        <div className="flex items-center justify-between">
                          <div className="font-medium capitalize">{row.section}</div>
                          <span className={clsx(
                            "px-2 py-0.5 rounded text-xs border",
                            row.status === "ok" && "bg-emerald-100 text-emerald-800 border-emerald-200",
                            row.status === "weak" && "bg-amber-100 text-amber-800 border-amber-200",
                            row.status === "missing" && "bg-rose-100 text-rose-800 border-rose-200",
                          )}>
                            {row.status}
                          </span>
                        </div>
                        <div className="text-slate-700 mt-1">{row.rationale}</div>
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

              {/* Prioritized Backlog */}
              {!!(report.prioritized_backlog || []).length && (
                <div className="mt-6">
                  <div className="text-sm text-slate-500">Prioritized Backlog</div>
                  <div className="mt-2 space-y-3">
                    {(report.prioritized_backlog || []).map((b: BacklogItem, i: number) => (
                      <div key={i} className="rounded-xl border p-3 bg-white">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{b.title}</div>
                          <div className="flex items-center gap-2">
                            <span className={clsx("px-2 py-0.5 rounded text-xs border", chipColor(b.impact))}>
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
                <div className="text-sm text-slate-500">Your Website’s Grade</div>
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
                    {(report.quick_wins || []).map((w: string, i: number) => (
                      <li key={i} className="rounded-lg border px-3 py-2 bg-emerald-50/40">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <button
                  onClick={() => alert("TODO: implement PDF sender")}
                  className="w-full rounded-xl px-5 py-3 bg-[#FFDDD2] text-slate-900 font-medium hover:opacity-90"
                >
                  Send PDF
                </button>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
