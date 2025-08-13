import React, { useState } from "react";
import type { CroAudit } from "./lib/analyze";
import { analyzeUrl } from "./lib/analyze";
import FullReportView from "./components/FullReportView";

function App() {
  // Ja atveram /full, rādam pilno reportu
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";
  if (pathname === "/full") {
    return <FullReportView />;
  }

  const [url, setUrl] = useState("");
  const [aiAudit, setAiAudit] = useState<CroAudit | null>(null);
  const [aiError, setAiError] = useState("");
  const [loading, setLoading] = useState(false);

  async function runTest(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!url) return;
    setLoading(true);
    setAiError("");
    setAiAudit(null);
    try {
      let fullUrl = url.trim();
      if (!/^https?:\/\//i.test(fullUrl)) {
        fullUrl = "https://" + fullUrl;
      }
      const audit = await analyzeUrl(fullUrl);
      setAiAudit(audit);
    } catch (err: any) {
      setAiError(err.message || "Nezināma kļūda");
    } finally {
      setLoading(false);
    }
  }

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
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 border rounded-lg px-4 py-2"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-[#006D77] text-white rounded-lg"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </form>

        {aiError && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg">
            {aiError}
          </div>
        )}

        {aiAudit && (
          <div className="mt-8">
            <h2 className="text-2xl font-semibold">
              Conversion Readiness Score
            </h2>
            <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-[#006D77]"
                style={{ width: `${aiAudit.score}%` }}
              />
            </div>
            <div className="mt-2 text-sm font-medium">
              {aiAudit.score} / 100
            </div>

            <div className="mt-8 grid lg:grid-cols-3 gap-6 md:gap-8">
              <div className="lg:col-span-1">
                <h3 className="text-xl font-semibold">Summary</h3>
                <p className="mt-2 text-slate-600">{aiAudit.summary}</p>
              </div>
              <div className="lg:col-span-2 grid gap-4">
                {aiAudit.key_findings.map((f, i) => (
                  <div
                    key={i}
                    className="p-5 rounded-2xl border bg-white shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          f.impact === "high"
                            ? "bg-red-500"
                            : f.impact === "medium"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                      />
                      <div className="font-medium">{f.title}</div>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      {f.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
