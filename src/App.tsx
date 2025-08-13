import React, { useState } from "react";
import { analyzeUrl } from "./lib/analyze";
import type {
  CroReport,
  FreeReport,
  FullReport,
  Suggestion,
} from "./lib/analyze";
import FullReportView from "./components/FullReportView";

function App() {
  // Ja atveram /full, rādam pilno reportu
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";
  if (pathname === "/full") {
    return <FullReportView />;
  }

  const [url, setUrl] = useState("");
  const [report, setReport] = useState<CroReport | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function runTest(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setErr("");
    setReport(null);
    try {
      const freeReport = await analyzeUrl(url, "free"); // ← free režīms
      setReport(freeReport);
    } catch (e: any) {
      setErr(String(e?.message || "Analyze error"));
    } finally {
      setLoading(false);
    }
  }

  const score =
    report && typeof (report as any).score === "number"
      ? ((report as any).score as number)
      : null;

  const sections = report?.sections_detected;

  const heroSuggestions: Suggestion[] =
    (report as FreeReport)?.hero?.suggestions || [];

  const nextSuggestions: Suggestion[] =
    (report as FreeReport)?.next_section?.suggestions || [];

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold">
          Website CRO Audit Tool
        </h1>
        <p className="mt-2 text-slate-600">
          Enter a URL to get a free AI-powered conversion analysis.
        </p>

        <form onSubmit={runTest} className="mt-6 flex gap-2">
          <input
            type="text"
            placeholder="yourdomain.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 border rounded-lg px-4 py-2"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-[#006D77] text-white rounded-lg disabled:opacity-60"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </form>

        {err && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg">
            {err}
          </div>
        )}

        {report && (
          <div className="mt-8 space-y-6">
            {/* Score */}
            {score !== null && (
              <div>
                <h2 className="text-2xl font-semibold">
                  Conversion Readiness Score
                </h2>
                <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77]"
                    style={{ width: `${score}%` }}
                  />
                </div>
                <div className="mt-2 text-sm font-medium">{score} / 100</div>
              </div>
            )}

            {/* Sections present/missing */}
            {sections && (
              <div className="rounded-2xl border bg-white p-5">
                <div className="font-medium mb-2">Sections Present</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                  {Object.entries(sections).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          v ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                      <span className={`${v ? "" : "text-slate-400"}`}>
                        {k.replace("_", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hero & Next suggestions */}
            {(heroSuggestions.length > 0 || nextSuggestions.length > 0) && (
              <div className="grid md:grid-cols-2 gap-4">
                {heroSuggestions.length > 0 && (
                  <div className="p-5 rounded-2xl border bg-white">
                    <div className="font-medium mb-1">Hero — Suggestions</div>
                    <ul className="text-sm text-slate-700 space-y-1">
                      {heroSuggestions.map((s, i) => (
                        <li key={i}>
                          • [{s.impact}] <b>{s.title}</b> — {s.recommendation}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {nextSuggestions.length > 0 && (
                  <div className="p-5 rounded-2xl border bg-white">
                    <div className="font-medium mb-1">
                      Next Section — Suggestions
                    </div>
                    <ul className="text-sm text-slate-700 space-y-1">
                      {nextSuggestions.map((s, i) => (
                        <li key={i}>
                          • [{s.impact}] <b>{s.title}</b> — {s.recommendation}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Screenshot (ja konfigurēts SCREENSHOT_API_URL) */}
            {report.assets?.screenshot_url && (
              <div className="rounded-2xl border bg-white p-2 overflow-hidden">
                <img
                  src={report.assets.screenshot_url}
                  alt="Screenshot"
                  className="w-full h-auto block"
                />
              </div>
            )}

            {/* CTA uz pilno reportu (Stripe success → /full?url=...) */}
            <div className="rounded-2xl border bg-white p-5 flex items-center justify-between">
              <div>
                <div className="font-medium">Need the full report?</div>
                <p className="text-sm text-slate-600">
                  See all findings, a prioritized backlog and downloadable PDF.
                </p>
              </div>
              <a
                href={`/full?url=${encodeURIComponent(
                  typeof (report as any).url === "string"
                    ? (report as any).url
                    : url
                )}`}
                className="rounded-lg px-4 py-2 bg-[#FFDDD2] text-slate-900 font-medium"
              >
                View Full Report
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
