import React, { useEffect, useMemo, useState } from "react";
import {
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
  to number,
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
  objectPosition: "top center",
};

/* -------------- types (from analyze.ts) -------------- */
// kept for local safety; TS will merge with imports
type Impact = "high" | "medium" | "low";

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
function letterFromScore(n: number) {
  if (n >= 90) return "A";
  if (n >= 80) return "B";
  if (n >= 70) return "C";
  if (n >= 60) return "D";
  return "F";
}
function scoreBarColor(n: number) {
  if (n >= 80) return "bg-emerald-500";
  if (n >= 60) return "bg-amber-500";
  return "bg-rose-500";
}

/* -------------- screenshot URL handling -------------- */
function buildScreenshotUrl(target: string) {
  const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  const tmpl =
    (import.meta as any).env?.VITE_SCREENSHOT_URL_TMPL ||
    (typeof process !== "undefined" && (process as any).env?.SCREENSHOT_URL_TMPL);
  if (tmpl) return String(tmpl).replace("{URL}", encodeURIComponent(url));
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}
function withCacheBuster(u: string) {
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}cb=${Date.now()}`;
}
function useSmartImage(
  primary?: string | null,
  backup?: string | null
): { src?: string; loading: boolean; onLoad: () => void; onError: () => void } {
  const [src, setSrc] = useState<string | undefined>(
    primary || backup || undefined
  );
  const [loading, setLoading] = useState<boolean>(!!src);
  const [retries, setRetries] = useState(0);
  const MAX_RETRIES = 3;

  useEffect(() => {
    setSrc(primary || backup || undefined);
    setLoading(!!(primary || backup));
    setRetries(0);
  }, [primary, backup]);

  useEffect(() => {
    if (!src) setLoading(false);
  }, [src]);

  const onLoad = (e?: any) => {
    const img = e?.currentTarget as HTMLImageElement;
    const looksTiny = img?.naturalWidth <= 300 || img?.naturalHeight <= 200;
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
  return { src, loading, onLoad, onError };
}

/* -------------- main component -------------- */
export default function FullReportView() {
  const autostart = getQS("autostart") === "1";
  const qUrl = getQS("url") || "";

  const [url, setUrl] = useState<string>(qUrl ? qUrl : "");
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [score, setScore] = useState(0);

  const heroPrimary = useMemo(
    () => (report?.screenshots?.hero ? report.screenshots.hero : url ? buildScreenshotUrl(url) : undefined),
    [report?.screenshots?.hero, url]
  );
  const heroBackup = useMemo(
    () => (url ? `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200` : undefined),
    [url]
  );
  const heroImg = useSmartImage(heroPrimary, heroBackup);

  const quickWinsLiftPct = useMemo(() => {
    const n = report?.quick_wins?.length ?? 0;
    return Math.min(30, n * 3);
  }, [report?.quick_wins]);

  async function startStream(u: string, mode: "full" | "free" = "full") {
    const url = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    setLoading(true);
    setProgress(0);
    setReport(null);

    const base = "/api/analyze-stream";
    const src = `${base}?url=${encodeURIComponent(url)}&mode=${mode}&sid=${Date.now()}`;

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
        // animate score bar
        const sc = clamp(data.score ?? computeScore(data.key_findings || [], data.content_audit || []), 0, 100);
        animateNumber(setScore, 0, sc, 800);
      } catch (err: any) {
        console.error(err);
        alert("Invalid result format");
      } finally {
        es.close();
        setLoading(false);
      }
    });

    es.addEventListener("error", (e: any) => {
      try {
        const data = e.data ? JSON.parse(e.data) : null;
        console.error("stream error", data || e);
      } catch {}
      es.close();
      setLoading(false);
      alert("Stream failed.");
    });
  }

  useEffect(() => {
    if (autostart && qUrl) {
      startStream(qUrl, "full");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, qUrl]);

  const gradeLetter = letterFromScore(score);

  return (
    <div className="mx-auto max-w-6xl px-3 md:px-4 py-8">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl md:text-3xl font-semibold">Full Report</h1>

        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-sm"
          >
            Print / Save PDF
          </button>
          <button
            onClick={() => alert("TODO: send PDF")}
            className="px-3 py-2 rounded-lg bg-[#FFDDD2] text-slate-900 hover:opacity-90 text-sm"
          >
            Send PDF
          </button>
        </div>
      </div>

      {/* URL input */}
      <div className="flex gap-2">
        <input
          value={url}
          placeholder="https://example.com"
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 rounded-lg border px-3 py-2 bg-white"
        />
        <button
          onClick={() => startStream(url, "full")}
          className="rounded-lg bg-[#006D77] text-white px-4 py-2 disabled:opacity-60"
          disabled={loading || !url.trim()}
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      {/* Loader */}
      {loading && (
        <div className="mt-4 rounded-xl border bg-white p-5">
          <div className="text-slate-700 font-medium">Generating full report…</div>
          <div className="mt-3 h-3 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full bg-[#006D77] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 text-sm text-slate-600">Progress: {progress}%</div>
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="mt-6 grid md:grid-cols-[1fr,0.6fr] gap-6">
          {/* MAIN */}
          <div className="rounded-2xl border bg-white p-5">
            <div className="text-sm text-slate-500">URL</div>
            <div className="text-slate-800 break-all">{report.url}</div>

            {report.summary && (
              <p className="mt-3 text-slate-700">{report.summary}</p>
            )}

            {/* HERO snapshot */}
            <div className="mt-4">
              <div className="text-sm text-slate-500">Hero snapshot</div>
              <div className={heroCropWrap}>
                {heroImg.src ? (
                  <img
                    src={heroImg.src}
                    alt="Hero snapshot"
                    style={heroCropImg}
                    onLoad={heroImg.onLoad}
                    onError={heroImg.onError}
                  />
                ) : (
                  <div className="h-full grid place-items-center text-slate-400">no image</div>
                )}
              </div>
              {heroImg.loading && (
                <div className="mt-2 text-xs text-slate-500">Loading screenshot…</div>
              )}
            </div>

            {/* Findings */}
            <div className="mt-6">
              <div className="text-sm text-slate-500">Key Findings</div>
              <div className="mt-2 space-y-3">
                {report.key_findings.map((f, i) => (
                  <div key={i} className="rounded-xl border p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx(
                          "h-2 w-2 rounded-full",
                          f.impact === "high"
                            ? "bg-rose-500"
                            : f.impact === "medium"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        )}
                      />
                      <div className="font-medium">{f.title}</div>
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      {f.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ASIDE */}
          <aside className="rounded-2xl border bg-white p-5 space-y-5">
            <div>
              <div className="text-sm text-slate-500">Your Website’s Grade</div>
              <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                <div className={clsx("h-full", scoreBarColor(score))} style={{ width: `${score}%` }} />
              </div>
              <div className="mt-2 text-sm">
                {score} / 100 • Grade {gradeLetter}
              </div>
            </div>

            {/* Quick Wins */}
            <div>
              <div className="text-sm text-slate-500">Quick Wins</div>
              <ul className="mt-2 space-y-2">
                {(report.quick_wins || []).map((w, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                    <span className="text-sm text-slate-700">{w}</span>
                    <span className="shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50">
                      ≈ +10% leads
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-xs text-slate-600">
                Estimated total if all completed: ≈ +{quickWinsLiftPct}% leads
              </div>
            </div>

            {/* Backlog */}
            <div>
              <div className="text-sm text-slate-500">Prioritized Backlog</div>
              <div className="mt-2 space-y-2">
                {(report.prioritized_backlog || []).map((b, i) => (
                  <div key={i} className="rounded-lg border px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-sm">{b.title}</div>
                        <div className="text-xs text-slate-600">
                          Impact: {b.impact}
                          {b.effort ? ` • Effort: ${b.effort}` : ""}
                          {typeof b.eta_days === "number" ? ` • ETA: ${b.eta_days}d` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50">
                        ≈ +{b.impact === "high" ? 20 : b.impact === "medium" ? 10 : 5}% leads
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

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
    </div>
  );
}
