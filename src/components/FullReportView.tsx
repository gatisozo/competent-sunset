import React from "react";
import { analyzeUrl } from "../lib/analyze";
import type {
  CroReport,
  FullReport,
  FreeReport,
  Suggestion,
} from "../lib/analyze";
import { sampleFullReport } from "../lib/sample";

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

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs border bg-white">
      {children}
    </span>
  );
}

function ImpactDot({
  level,
}: {
  level: "high" | "medium" | "low" | undefined;
}) {
  const cls =
    level === "high"
      ? "bg-red-500"
      : level === "medium"
      ? "bg-amber-500"
      : "bg-emerald-500";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />;
}

export default function FullReportView() {
  const urlParam = useQueryParam("url") || "";
  const isSample = useQueryParam("sample") === "1";

  const [url, setUrl] = React.useState(urlParam);
  const [report, setReport] = React.useState<CroReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [email, setEmail] = React.useState("");

  const runFull = async (targetUrl: string) => {
    setLoading(true);
    setErr("");
    setReport(null);
    try {
      const rep = await analyzeUrl(targetUrl, "full");
      setReport(rep);
    } catch (e: any) {
      setErr(String(e?.message || "Analyze error"));
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (isSample) {
      setReport(sampleFullReport);
      return;
    }
    if (urlParam) {
      runFull(urlParam);
    }
  }, [isSample, urlParam]);

  const downloadPdf = async () => {
    if (!report) return;
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report }),
    });
    if (!res.ok) return alert("PDF failed");
    const blob = await res.blob();
    const dl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dl;
    a.download = "holbox-full-report.pdf";
    a.click();
    URL.revokeObjectURL(dl);
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

  const findings = (report as FullReport)?.findings || [];
  const quickWins = (report as FullReport)?.quick_wins || [];
  const backlog = (report as FullReport)?.prioritized_backlog || [];
  const score =
    report && typeof (report as any).score === "number"
      ? ((report as any).score as number)
      : null;

  return (
    <div className="min-h-screen bg-[#EDF6F9]">
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              window.history.back();
            }}
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            ← Back
          </button>

          <div className="flex-1" />

          <div className="hidden sm:flex items-center gap-2">
            {typeof (report as any)?.url === "string" && (
              <Pill>{(report as any).url}</Pill>
            )}
            <button
              onClick={downloadPdf}
              className="rounded-lg border px-3 py-1.5 text-sm"
            >
              Download PDF
            </button>
            <div className="flex items-center gap-2">
              <input
                className="rounded-lg border px-3 py-1.5 text-sm"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                onClick={emailPdf}
                className="rounded-lg bg-[#006D77] text-white px-3 py-1.5 text-sm"
              >
                Send PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 md:py-10">
        <h1 className="text-2xl md:text-3xl font-bold">Full Report</h1>
        <p className="text-slate-600 mt-1">
          Findings are shown instantly. You can download or email the PDF
          anytime.
        </p>

        {/* URL input to run another */}
        {!isSample && (
          <div className="mt-4 flex gap-2">
            <input
              className="flex-1 rounded-lg border px-3 py-2"
              placeholder="yourdomain.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              onClick={() => url.trim() && runFull(url)}
              className="rounded-lg bg-[#006D77] text-white px-4 py-2"
            >
              Analyze
            </button>
          </div>
        )}

        {loading && <p className="mt-6 text-slate-600">Analyzing…</p>}
        {err && <p className="mt-6 text-red-600">{err}</p>}

        {report && (
          <div className="mt-8 grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              {/* Score */}
              {score !== null && (
                <div className="rounded-2xl border bg-white p-5">
                  <div className="text-sm text-slate-500">Score</div>
                  <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-[#006D77]"
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <div className="mt-1 text-sm">{score} / 100</div>
                </div>
              )}

              {/* Sections */}
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

              {/* Quick wins */}
              {quickWins.length > 0 && (
                <div className="rounded-2xl border bg-white p-5">
                  <div className="font-medium mb-2">Quick Wins</div>
                  <ul className="text-sm text-slate-700 space-y-1">
                    {quickWins.map((q, i) => (
                      <li key={i}>• {q}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Backlog */}
              {backlog.length > 0 && (
                <div className="rounded-2xl border bg-white p-5">
                  <div className="font-medium mb-2">Prioritized Backlog</div>
                  <div className="space-y-2 text-sm">
                    {backlog.map((t, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="font-medium">{t.title}</div>
                        <Pill>Impact {t.impact}</Pill>
                        <Pill>Effort {t.effort}</Pill>
                        {typeof t.eta_days === "number" && (
                          <Pill>{t.eta_days}d</Pill>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Main content */}
            <div className="lg:col-span-2 space-y-4">
              {/* Screenshot */}
              {report.assets?.screenshot_url && (
                <div className="rounded-2xl border bg-white p-2 overflow-hidden">
                  <div className="relative">
                    <img
                      src={report.assets.screenshot_url}
                      alt="Screenshot"
                      className="w-full h-auto block"
                    />
                    {/* Vienkārši overlays (hero/next) – bez mērogošanas sarežģījumiem */}
                    {(report as FreeReport)?.hero?.overlay && (
                      <div
                        className="absolute border-2 border-emerald-400/80"
                        style={{
                          left: 0,
                          top: 0,
                          right: 0,
                          height: "45%",
                          pointerEvents: "none",
                        }}
                        title="Hero overlay"
                      />
                    )}
                    {(report as FreeReport)?.next_section?.overlay && (
                      <div
                        className="absolute border-2 border-amber-400/80"
                        style={{
                          left: 0,
                          top: "45%",
                          right: 0,
                          bottom: 0,
                          pointerEvents: "none",
                        }}
                        title="Next section overlay"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Findings (Full) vai Hero/Next (Free/Sample) */}
              {findings.length > 0 ? (
                <div className="rounded-2xl border bg-white p-5">
                  <div className="font-medium mb-3">Findings</div>
                  <div className="space-y-3">
                    {findings.map((f, i) => (
                      <div key={i} className="p-4 border rounded-xl">
                        <div className="flex items-center gap-2">
                          <ImpactDot level={f.impact} />
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
                  <div className="font-medium mb-3">
                    Suggestions (Hero & Next)
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {(report as FreeReport)?.hero?.suggestions?.length ? (
                      <div className="p-4 border rounded-xl">
                        <div className="font-medium mb-1">Hero</div>
                        <ul className="text-sm text-slate-700 space-y-1">
                          {(report as FreeReport).hero!.suggestions!.map(
                            (s: Suggestion, i: number) => (
                              <li key={i}>
                                • [{s.impact}] <b>{s.title}</b> —{" "}
                                {s.recommendation}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    ) : null}
                    {(report as FreeReport)?.next_section?.suggestions
                      ?.length ? (
                      <div className="p-4 border rounded-xl">
                        <div className="font-medium mb-1">Next Section</div>
                        <ul className="text-sm text-slate-700 space-y-1">
                          {(
                            report as FreeReport
                          ).next_section!.suggestions!.map(
                            (s: Suggestion, i: number) => (
                              <li key={i}>
                                • [{s.impact}] <b>{s.title}</b> —{" "}
                                {s.recommendation}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile PDF actions */}
      <div className="sm:hidden sticky bottom-0 z-30 bg-white/90 backdrop-blur border-t">
        <div className="mx-auto max-w-6xl px-4 py-2 flex items-center gap-2">
          <button
            onClick={downloadPdf}
            className="rounded-lg border px-3 py-2 text-sm flex-1"
          >
            Download PDF
          </button>
          <button
            onClick={emailPdf}
            className="rounded-lg bg-[#006D77] text-white px-3 py-2 text-sm flex-1"
          >
            Send PDF
          </button>
        </div>
      </div>
    </div>
  );
}
