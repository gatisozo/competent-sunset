// src/components/FullReportView.tsx
import React from "react";
import { analyzeUrl } from "../lib/analyze";
import type { CroReport, FullReport, FreeReport } from "../lib/analyze";

function useQueryParam(name: string) {
  const [value, setValue] = React.useState<string | null>(() =>
    new URLSearchParams(window.location.search).get(name)
  );
  React.useEffect(() => {
    const onPop = () =>
      setValue(new URLSearchParams(window.location.search).get(name));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [name]);
  return value;
}

export default function FullReportView() {
  const urlParam = useQueryParam("url") || "";
  const [url, setUrl] = React.useState(urlParam);
  const [report, setReport] = React.useState<CroReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [email, setEmail] = React.useState("");

  const runFull = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setErr("");
    setReport(null);
    try {
      const rep = await analyzeUrl(url, "full");
      setReport(rep);
    } catch (e: any) {
      setErr(String(e?.message || "Analyze error"));
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (urlParam) runFull(); /* auto-run if arrived from checkout */
  }, []);

  const downloadPdf = async () => {
    if (!report) return;
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report }),
    });
    if (!res.ok) return alert("PDF failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "holbox-full-report.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  const emailPdf = async () => {
    if (!report || !/.+@.+\..+/.test(email))
      return alert("Enter a valid email");
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report, email }),
    });
    if (!res.ok) return alert("Email send failed");
    alert("Sent!");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold">Full Report</h1>
      <div className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded-lg border px-3 py-2"
          placeholder="yourdomain.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          onClick={runFull}
          className="rounded-lg bg-[#006D77] text-white px-4 py-2"
        >
          Analyze
        </button>
      </div>

      {loading && <p className="mt-6 text-slate-600">Analyzing…</p>}
      {err && <p className="mt-6 text-red-600">{err}</p>}

      {report && (
        <div className="mt-8 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="rounded-2xl border bg-white p-5">
              <div className="text-sm text-slate-500">URL</div>
              <div className="font-medium">{(report as any).url}</div>
            </div>
            {"score" in report && typeof (report as any).score === "number" && (
              <div className="rounded-2xl border bg-white p-5">
                <div className="text-sm text-slate-500">Score</div>
                <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77]"
                    style={{ width: `${(report as any).score}%` }}
                  />
                </div>
                <div className="mt-1 text-sm">
                  {(report as any).score} / 100
                </div>
              </div>
            )}
            {report.sections_detected && (
              <div className="rounded-2xl border bg-white p-5">
                <div className="font-medium mb-2">Sections Present</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(report.sections_detected).map(([k, v]) => (
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

            <div className="rounded-2xl border bg-white p-5">
              <div className="font-medium mb-3">PDF</div>
              <div className="flex gap-2">
                <button
                  onClick={downloadPdf}
                  className="rounded-lg border px-3 py-2"
                >
                  Download
                </button>
                <input
                  className="flex-1 rounded-lg border px-3 py-2"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button
                  onClick={emailPdf}
                  className="rounded-lg bg-[#006D77] text-white px-3 py-2"
                >
                  Email
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {report.assets?.screenshot_url && (
              <div className="rounded-2xl border bg-white p-2 overflow-hidden">
                <div className="relative">
                  <img
                    src={report.assets.screenshot_url}
                    alt="Screenshot"
                    className="w-full h-auto block"
                  />
                  {/* Overlays (hero + next) — vienkāršs piemērs; var mērogot ar naturalWidth */}
                </div>
              </div>
            )}

            {(report as FullReport).findings?.length ? (
              <div className="rounded-2xl border bg-white p-5">
                <div className="font-medium mb-2">Findings</div>
                <div className="space-y-3">
                  {(report as FullReport).findings!.map((f, i) => (
                    <div key={i} className="p-4 border rounded-xl">
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
                        <div className="font-medium">
                          {f.title}
                          {f.section ? ` — ${f.section}` : ""}
                        </div>
                        {f.effort && (
                          <span className="ml-auto text-xs px-2 py-0.5 rounded bg-slate-100 border">
                            {f.effort}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-1">
                        {f.recommendation}
                      </p>
                      {f.owner && (
                        <div className="mt-1 text-xs text-slate-500">
                          Owner: {f.owner}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border bg-white p-5">
                <div className="font-medium mb-2">Hero / Next suggestions</div>
                <div className="grid sm:grid-cols-2 gap-4">
                  {report.hero?.suggestions?.length && (
                    <div className="p-4 border rounded-xl">
                      <div className="font-medium mb-1">Hero</div>
                      <ul className="text-sm text-slate-600 space-y-1">
                        {report.hero!.suggestions!.map((s, i) => (
                          <li key={i}>
                            • [{s.impact}] {s.title} — {s.recommendation}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.next_section?.suggestions?.length && (
                    <div className="p-4 border rounded-xl">
                      <div className="font-medium mb-1">Next Section</div>
                      <ul className="text-sm text-slate-600 space-y-1">
                        {report.next_section!.suggestions!.map((s, i) => (
                          <li key={i}>
                            • [{s.impact}] {s.title} — {s.recommendation}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(report as FullReport).prioritized_backlog?.length && (
              <div className="rounded-2xl border bg-white p-5">
                <div className="font-medium mb-2">Prioritized Backlog</div>
                <div className="space-y-2">
                  {(report as FullReport).prioritized_backlog!.map((t, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <div className="font-medium">{t.title}</div>
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 border">
                        Impact {t.impact}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-50 border">
                        Effort {t.effort}
                      </span>
                      {typeof t.eta_days === "number" && (
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-50 border">
                          {t.eta_days}d
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
