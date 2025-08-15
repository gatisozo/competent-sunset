import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeUrl,
  type FullReport,
  type FreeReport,
  type Suggestion,
  type ContentAuditItem,
  type Impact,
} from "../lib/analyze";

/** Simple helpers */
const SCREENSHOT_URL_TMPL =
  import.meta.env.VITE_SCREENSHOT_URL_TMPL ||
  "https://s.wordpress.com/mshots/v1/{URL}?w=1200";

function normalizeAbs(urlLike: string) {
  try {
    const u = new URL(urlLike);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return urlLike.startsWith("http") ? urlLike : `https://${urlLike}`;
  }
}
function backupShot(u?: string | null) {
  if (!u) return null;
  const abs = normalizeAbs(u);
  return SCREENSHOT_URL_TMPL.replace("{URL}", encodeURIComponent(abs));
}

const impactColor: Record<Impact, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

type Phase = "idle" | "loading" | "ready" | "error";

/** Full report page */
export default function FullReportView() {
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const initialUrl = params.get("url") || "https://example.com";
  const sample = params.get("sample") === "1";

  const [url, setUrl] = useState<string>(initialUrl);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState(10);
  const [report, setReport] = useState<FullReport | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const pageTitle = report?.page?.title ?? "";
  const pageUrl = report?.page?.url ?? url;

  /** timers for UX */
  useEffect(() => {
    if (phase !== "loading") return;
    const start = Date.now();
    const duration = 10000;
    const id = requestAnimationFrame(function tick() {
      const p = Math.min(
        100,
        Math.round(((Date.now() - start) / duration) * 100)
      );
      setProgress(p);
      setEta(Math.max(0, Math.ceil((duration - (Date.now() - start)) / 1000)));
      if (p < 100 && phase === "loading") requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /** load full report on first mount or on Analyze click */
  const run = async () => {
    setPhase("loading");
    setReport(null);
    setErrorMsg("");
    try {
      const r = (await analyzeUrl(url, "full")) as FullReport;
      setReport(r);
      setPhase("ready");
    } catch (e: any) {
      setErrorMsg(String(e?.message || "Analyze error"));
      setPhase("error");
    }
  };

  useEffect(() => {
    if (!sample) run(); // sample=1 ļautu parādīt statisku demo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const score = (report?.score ??
    provisionalScoreFromFree(report || ({} as FreeReport))) as
    | number
    | undefined;

  const heroShot =
    report?.screenshots?.hero ||
    report?.assets?.screenshot_url ||
    backupShot(pageUrl) ||
    undefined;

  const worst: Suggestion[] = useMemo(() => {
    const arr: Suggestion[] = [
      ...((report?.hero?.suggestions as Suggestion[]) || []),
      ...((report?.next_section?.suggestions as Suggestion[]) || []),
      ...((report?.findings as Suggestion[]) || []),
    ];
    return arr
      .slice()
      .sort(
        (a: Suggestion, b: Suggestion) =>
          rankImpact(b.impact) - rankImpact(a.impact)
      )
      .slice(0, 5);
  }, [report]);

  return (
    <div className="min-h-screen bg-[#EDF6F9]">
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="flex gap-3 items-center">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-lg px-3 py-2 border bg-white"
            placeholder="https://your-landing.com"
          />
          <button
            onClick={run}
            className="rounded-lg px-4 py-2 bg-[#006D77] text-white"
          >
            Analyze
          </button>
        </div>

        {/* header / score */}
        <div className="mt-4 grid grid-cols-12 gap-4">
          <div className="col-span-8 rounded-xl border bg-white p-4">
            <div className="text-xs text-slate-500">URL</div>
            <div className="text-sm truncate">{pageUrl}</div>
            {pageTitle && (
              <>
                <div className="text-xs text-slate-500 mt-3">Title</div>
                <div className="text-sm">{pageTitle}</div>
              </>
            )}
            <div className="mt-4 rounded-lg overflow-hidden border">
              <div className="relative">
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <img
                  src={heroShot}
                  className="block w-full h-auto"
                  style={{ objectFit: "cover" }}
                />
                {worst.length > 0 && (
                  <div className="absolute right-2 bottom-2 bg-white/95 border rounded-lg p-3 text-xs max-w-[85%] shadow">
                    <div className="font-medium mb-1">Top hero suggestions</div>
                    <ul className="space-y-1">
                      {worst.slice(0, 3).map((s: Suggestion, i: number) => (
                        <li key={i}>
                          • <b>{s.title}</b> — {s.recommendation}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-4 rounded-xl border bg-white p-4">
            <div className="text-sm text-slate-500">Score</div>
            <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-[#006D77]"
                style={{ width: `${score ?? 75}%` }}
              />
            </div>
            <div className="mt-2 text-sm font-medium">{score ?? 75} / 100</div>
          </div>
        </div>

        {/* timers / states */}
        {phase === "loading" && (
          <div className="mt-4 rounded-xl border bg-white p-4">
            <div className="font-medium">Generating…</div>
            <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-[#006D77] transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-slate-600">~{eta}s left</div>
          </div>
        )}
        {phase === "error" && (
          <div className="mt-4 rounded-xl border bg-white p-4 text-red-700">
            {errorMsg}
          </div>
        )}

        {/* findings */}
        {phase === "ready" && report && (
          <>
            {Array.isArray(worst) && worst.length > 0 && (
              <div className="mt-6 grid gap-3">
                {worst.map((f: Suggestion, i: number) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl border bg-white flex items-start gap-3"
                  >
                    <span
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${
                        impactColor[f.impact]
                      }`}
                    />
                    <div>
                      <div className="font-medium">{f.title}</div>
                      <div className="text-sm text-slate-600 mt-0.5">
                        {f.recommendation}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Content audit table (if present) */}
            {Array.isArray(report.content_audit) &&
              report.content_audit.length > 0 && (
                <div className="mt-8 rounded-xl border bg-white p-4">
                  <div className="font-medium mb-3">Content Audit</div>
                  <div className="grid grid-cols-12 text-xs font-medium text-slate-500 border-b pb-2">
                    <div className="col-span-4">Section</div>
                    <div className="col-span-2">Present</div>
                    <div className="col-span-2">Quality</div>
                    <div className="col-span-4">Suggestion</div>
                  </div>
                  <div className="text-sm">
                    {report.content_audit.map(
                      (row: ContentAuditItem, idx: number) => (
                        <div
                          key={idx}
                          className="grid grid-cols-12 border-b last:border-b-0 py-2"
                        >
                          <div className="col-span-4">{row.section}</div>
                          <div className="col-span-2">
                            {row.present ? "Yes" : "No"}
                          </div>
                          <div className="col-span-2">{row.quality ?? "-"}</div>
                          <div className="col-span-4 text-slate-600">
                            {row.suggestion ?? "-"}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

            {/* Prioritized backlog (if present) */}
            {Array.isArray(report.prioritized_backlog) &&
              report.prioritized_backlog.length > 0 && (
                <div className="mt-8 rounded-xl border bg-white p-4">
                  <div className="font-medium mb-3">Prioritized Backlog</div>
                  <div className="grid gap-3">
                    {report.prioritized_backlog.map(
                      (
                        b: {
                          title: string;
                          impact: Impact;
                          effort_days: number;
                          eta_days: number;
                          lift_percent: number;
                        },
                        i: number
                      ) => (
                        <div
                          key={i}
                          className="p-4 rounded-xl border bg-white flex items-center justify-between gap-4"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`mt-1 h-2.5 w-2.5 rounded-full ${
                                impactColor[b.impact]
                              }`}
                            />
                            <div>
                              <div className="font-medium">{b.title}</div>
                              <div className="text-xs text-slate-600 mt-0.5">
                                Effort: {b.effort_days}d • ETA: {b.eta_days}d
                              </div>
                            </div>
                          </div>
                          <div className="text-emerald-700 font-semibold">
                            ≈ +{b.lift_percent}% leads
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}

/** fallback score if server didn't provide one */
function provisionalScoreFromFree(r: FreeReport): number {
  const items: Suggestion[] = [
    ...(r.hero?.suggestions ?? []),
    ...(r.next_section?.suggestions ?? []),
    ...(r.findings ?? []),
  ];
  if (items.length === 0) return 75;
  let score = 85;
  for (const s of items) {
    if (s.impact === "high") score -= 4;
    else if (s.impact === "medium") score -= 2;
    else score -= 1;
  }
  return Math.max(20, Math.min(98, Math.round(score)));
}
function rankImpact(i?: Impact) {
  return i === "high" ? 3 : i === "medium" ? 2 : 1;
}
