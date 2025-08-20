import React, { useEffect, useMemo, useState } from "react";
import {
  type FullReport as ApiFullReport,
  type Suggestion,
  type ContentAuditItem,
  type BacklogItem,
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

function auditStatus(
  c: ContentAuditItem | undefined
): "ok" | "weak" | "missing" {
  if (!c) return "ok";
  if (c.present === false) return "missing";
  if (c.quality === "poor") return "weak";
  return "ok";
}

function hasMeaningfulIssues(
  findings: { title: string }[] = [],
  audit?: ContentAuditItem[]
) {
  const hf = findings.some((f) => isHeroFinding(f.title));
  const wk = (audit || []).some((c) => auditStatus(c) !== "ok");
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
  for (const c of audit) {
    const st = auditStatus(c);
    score -= st === "missing" ? 5 : st === "weak" ? 2 : 0;
  }
  return clamp(Math.round(score), 0, 100);
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
    (typeof process !== "undefined" &&
      (process as any).env?.SCREENSHOT_URL_TMPL);
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
): {
  src?: string;
  loading: boolean;
  onLoad: (e?: any) => void;
  onError: () => void;
} {
  const [src, setSrc] = useState<string | undefined>(
    primary || backup || undefined
  );
  const [loading, setLoading] = useState<boolean>(!!src);
  const [retries, setRetries] = useState(0);
  const MAX_RETRIES = 4;

  useEffect(() => {
    setSrc(primary || backup || undefined);
    setLoading(!!(primary || backup));
    setRetries(0);
  }, [primary, backup]);

  const onLoad = () => setLoading(false);
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
  const [report, setReport] = useState<ApiFullReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [score, setScore] = useState(0);

  const heroPrimary = useMemo(
    () =>
      (report?.screenshots?.hero ?? report?.assets?.screenshot_url) ||
      (url ? buildScreenshotUrl(url) : undefined),
    [report?.screenshots?.hero, report?.assets?.screenshot_url, url]
  );
  const heroImg = useSmartImage(heroPrimary || undefined, undefined);

  function startStream(u: string, mode: "full" | "free" = "full") {
    const target = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    setLoading(true);
    setProgress(0);
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
        const data = JSON.parse(e.data) as ApiFullReport;
        setReport(data);
        setProgress(100);

        const baseScore =
          typeof (data as any).score === "number"
            ? (data as any).score!
            : computeScore(
                (data as any).findings || [],
                (data as any).content_audit || []
              );
        animateNumber(setScore, 0, baseScore, 800);
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim())
                startStream(url.trim(), "full");
            }}
            placeholder="yourdomain.com"
            className="flex-1 rounded-lg px-3 py-2 bg-white border outline-none focus:ring-2 focus:ring-[#83C5BE]"
          />
          <button
            disabled={loading || !url.trim()}
            onClick={() => startStream(url.trim(), "full")}
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

      {/* Main grid */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Left: page + hero visual + findings */}
        <div className="md:col-span-2 space-y-4">
          {/* Page meta */}
          {(report as any)?.page && (
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-slate-500">URL</div>
              <div className="truncate">{(report as any).page.url}</div>
              {(report as any).page.title && (
                <>
                  <div className="mt-2 text-xs text-slate-500">Title</div>
                  <div className="">{(report as any).page.title}</div>
                </>
              )}
            </div>
          )}

          {/* Visual: hero snapshot (cropped) */}
          {hasMeaningfulIssues(
            ((report as any)?.findings || []) as Suggestion[],
            report?.content_audit as ContentAuditItem[] | undefined
          ) &&
            heroPrimary && (
              <div className="rounded-xl border bg-white p-3">
                <div className="font-medium">Hero Snapshot (top of page)</div>
                <div className="text-sm text-slate-600">
                  Cropped to the first viewport for clarity.
                </div>

                <div className={`${heroCropWrap} relative mt-2`}>
                  {/* Spinner overlay while loading */}
                  {heroImg.loading && (
                    <div className="absolute inset-0 grid place-items-center bg-white/60">
                      <div className="h-8 w-8 border-2 border-slate-300 border-t-[#006D77] rounded-full animate-spin" />
                    </div>
                  )}

                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <img
                    src={heroImg.src || heroPrimary}
                    style={heroCropImg}
                    onLoad={heroImg.onLoad}
                    onError={heroImg.onError}
                    className={heroImg.loading ? "opacity-0" : "opacity-100"}
                  />
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  * We show screenshots only for sections with issues. Currently
                  cropping to the hero area.
                </div>
              </div>
            )}

          {/* Findings list */}
          {Array.isArray((report as any)?.findings) &&
            (report as any).findings.length > 0 && (
              <div className="rounded-xl border bg-white p-3">
                <div className="font-medium mb-2">Findings</div>
                <div className="grid gap-3">
                  {((report as any).findings as Suggestion[]).map((f, i) => (
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
          {Array.isArray(report?.content_audit) &&
            report!.content_audit!.length > 0 && (
              <div className="rounded-xl border bg-white p-3">
                <div className="font-medium mb-2">Content Audit</div>
                <div className="grid gap-3">
                  {(report!.content_audit as ContentAuditItem[]).map((c, i) => {
                    const st = auditStatus(c);
                    return (
                      <div key={i} className="p-4 rounded-lg border bg-white">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">
                            {c.section.replace(/_/g, " ")}
                          </span>
                          <span
                            className={clsx(
                              "text-xs px-2 py-0.5 rounded",
                              st === "ok" && "bg-emerald-100 text-emerald-700",
                              st === "weak" && "bg-amber-100 text-amber-700",
                              st === "missing" && "bg-red-100 text-red-700"
                            )}
                          >
                            {st}
                          </span>
                        </div>
                        {c.suggestion && (
                          <div className="text-sm text-slate-600 mt-1">
                            {c.suggestion}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                className={clsx("h-full", scoreBarColor(Math.round(score)))}
                style={{ width: `${clamp(score, 0, 100)}%` }}
              />
            </div>
            <div className="mt-1 text-sm">{Math.round(score)} / 100</div>
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

          {/* Quick wins */}
          {report?.quick_wins && report.quick_wins.length > 0 && (
            <div className="rounded-xl border bg-white p-3">
              <div className="font-medium">Quick Wins</div>
              <ul className="text-sm text-slate-700 list-disc pl-5 mt-2">
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
                <div className="space-y-3">
                  {(report.prioritized_backlog as BacklogItem[]).map((b, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{b.title}</div>
                        {"lift_percent" in (b as any) &&
                          typeof (b as any).lift_percent === "number" && (
                            <span className="px-3 py-1 rounded-full text-xs md:text-sm font-semibold bg-emerald-100 text-emerald-800">
                              ≈ +{(b as any).lift_percent}% leads
                            </span>
                          )}
                      </div>
                      <div className="mt-2 text-xs text-slate-600 flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-100 capitalize">
                          impact {String((b as any).impact || "").toLowerCase()}
                        </span>
                        {"effort_days" in (b as any) && (
                          <span className="px-2 py-0.5 rounded bg-slate-100">
                            effort {(b as any).effort_days}d
                          </span>
                        )}
                        {"eta_days" in (b as any) && (
                          <span className="px-2 py-0.5 rounded bg-slate-100">
                            ETA {(b as any).eta_days}d
                          </span>
                        )}
                      </div>
                      {"notes" in (b as any) && (b as any).notes && (
                        <div className="mt-1 text-sm text-slate-600">
                          {(b as any).notes}
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

/* ---------------- grade badge helper ---------------- */
function letterFromScore(n: number) {
  if (n >= 90) return "A";
  if (n >= 80) return "B";
  if (n >= 70) return "C";
  if (n >= 60) return "D";
  return "E";
}
