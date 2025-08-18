import React, { useEffect, useMemo, useRef, useState } from "react";

type Finding = {
  title: string;
  impact: "high" | "medium" | "low";
  recommendation: string;
};
type FullReport = {
  url: string;
  title?: string;
  score: number;
  key_findings: Finding[];
  quick_wins?: string[];
  prioritized_backlog?: {
    title: string;
    impact: "high" | "medium" | "low";
    effort: string;
  }[];
  screenshots?: { hero?: string } | null;
};

function useQuery() {
  return useMemo(
    () =>
      new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      ),
    []
  );
}

export default function FullReportView() {
  const q = useQuery();
  const autostart = q.get("autostart") === "1";
  const qUrl = q.get("url") || "";
  const [url, setUrl] = useState<string>(qUrl);
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<number>(0);

  // Demo analyze (aizstāj ar reālo /api/analyze pilnajam režīmam, ja pieslēdz)
  const runFullAnalyze = async (targetUrl: string) => {
    if (!targetUrl) return;
    setLoading(true);
    setReport(null);
    setProgress(0);
    progressRef.current = 0;

    // demo progress
    const start = Date.now();
    const duration = 12000;
    const raf = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setProgress(Math.round(p * 100));
      progressRef.current = p * 100;
      if (p < 1 && loading) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);

    try {
      // Šeit vari pieslēgt reālo API:
      // const res = await fetch("/api/analyze", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ url: targetUrl, mode:"full" })});
      // const data = await res.json();

      // DEMO atbilde:
      const data: FullReport = {
        url: targetUrl,
        title: "Demo Site",
        score: 75,
        key_findings: [
          {
            title: "Hero value unclear — hero",
            impact: "high",
            recommendation: "Revise headline and add strong CTA.",
          },
          {
            title: "Low contrast on primary CTA — hero",
            impact: "medium",
            recommendation: "Increase color contrast and add hover/focus.",
          },
          {
            title: "LCP image oversized — performance",
            impact: "medium",
            recommendation: "Serve responsive images and preload.",
          },
        ],
        quick_wins: [
          "Add testimonials",
          "Improve FAQ formatting",
          "Tighten nav labels",
        ],
        prioritized_backlog: [
          { title: "Rewrite hero copy", impact: "high", effort: "2d" },
          { title: "Add testimonials", impact: "medium", effort: "3d" },
          { title: "Improve FAQ structure", impact: "medium", effort: "2d" },
        ],
        screenshots: { hero: "/report-1.png" },
      };

      // simulējam, ka pabeigts
      setTimeout(() => {
        setReport(data);
        setLoading(false);
        setProgress(100);
      }, Math.max(0, 12000 - (Date.now() - start)));
    } catch (e) {
      setLoading(false);
      alert("Analyze failed.");
    }
  };

  useEffect(() => {
    if (autostart && qUrl) {
      runFullAnalyze(qUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, qUrl]);

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-900">
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 border-b">
        <div className="mx-auto max-w-[1200px] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[#006D77]" />
            <span className="font-semibold tracking-tight">
              Holbox AI — Full Report
            </span>
          </div>
          <div />
        </div>
      </header>

      <section className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="flex gap-2">
          <input
            value={url}
            placeholder="https://example.com"
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-lg border px-3 py-2 bg-white"
          />
          <button
            onClick={() => runFullAnalyze(url)}
            className="rounded-lg bg-[#006D77] text-white px-4 py-2 disabled:opacity-60"
            disabled={loading || !url.trim()}
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>

        {/* Loader */}
        {loading && (
          <div className="mt-4 rounded-xl border bg-white p-5">
            <div className="text-slate-700 font-medium">
              Generating full report…
            </div>
            <div className="mt-3 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-[#006D77] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 text-sm text-slate-600">
              Progress: {progress}%
            </div>
          </div>
        )}

        {/* Report */}
        {report && !loading && (
          <div className="mt-6 grid md:grid-cols-[1fr,0.6fr] gap-6">
            <div className="rounded-2xl border bg-white p-5">
              <div className="text-sm text-slate-500">URL</div>
              <div className="text-slate-800 break-all">{report.url}</div>

              <div className="mt-4">
                <div className="text-sm text-slate-500">
                  Hero Snapshot (top of page)
                </div>
                <div className="mt-2 rounded-xl overflow-hidden border">
                  <img
                    src={report.screenshots?.hero || "/report-1.png"}
                    alt="hero"
                    className="w-full h-auto"
                  />
                </div>
              </div>

              <div className="mt-6">
                <div className="text-sm text-slate-500">Findings</div>
                <div className="mt-2 space-y-3">
                  {report.key_findings.map((f, i) => (
                    <div key={i} className="rounded-xl border p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "h-2 w-2 rounded-full " +
                            (f.impact === "high"
                              ? "bg-rose-500"
                              : f.impact === "medium"
                              ? "bg-amber-500"
                              : "bg-emerald-500")
                          }
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

            <aside className="rounded-2xl border bg-white p-5 space-y-5">
              <div>
                <div className="text-sm text-slate-500">Score</div>
                <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77]"
                    style={{ width: `${report.score}%` }}
                  />
                </div>
                <div className="mt-2 text-sm">{report.score} / 100</div>
              </div>

              <div>
                <div className="text-sm text-slate-500">Quick Wins</div>
                <ul className="mt-2 text-sm list-disc list-inside text-slate-700">
                  {(report.quick_wins || []).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-sm text-slate-500">
                  Prioritized Backlog
                </div>
                <div className="mt-2 space-y-2">
                  {(report.prioritized_backlog || []).map((b, i) => (
                    <div key={i} className="rounded-lg border px-3 py-2">
                      <div className="font-medium text-sm">{b.title}</div>
                      <div className="text-xs text-slate-600">
                        Impact: {b.impact} • Effort: {b.effort}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
