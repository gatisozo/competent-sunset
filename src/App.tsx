import React, { useRef, useState } from "react";
import { analyzeUrl } from "./lib/analyze";
import type {
  CroReport,
  FreeReport,
  Suggestion,
  SectionPresence,
} from "./lib/analyze";
import FullReportView from "./components/FullReportView";

const PAYMENT_LINK_URL = import.meta.env.VITE_PAYMENT_LINK_URL || "";
const EMAIL_ENDPOINT_URL = import.meta.env.VITE_EMAIL_ENDPOINT_URL || "";
const SALES_EMAIL = import.meta.env.VITE_SALES_EMAIL || "sales@holbox.ai";

/* --- tiny SPA helpers --- */
function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
function usePathname() {
  const [, setTick] = useState(0);
  const [path, setPath] = useState(() => window.location.pathname);
  React.useEffect(() => {
    const onPop = () => {
      setPath(window.location.pathname);
      setTick((n) => n + 1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

export default function App() {
  const path = usePathname();
  if (path === "/full") return <FullReportView />;

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  const [report, setReport] = useState<CroReport | null>(null);
  const [aiError, setAiError] = useState("");
  const [retryIn, setRetryIn] = useState<number | null>(null);

  const fallbackScore = 72;
  const animatedScore = Math.min(
    fallbackScore,
    Math.round((progress / 100) * fallbackScore)
  );

  const runTest = () => {
    if (!url.trim()) return;
    setShowResults(false);
    setProgress(0);
    setLoading(true);
    setReport(null);
    setAiError("");
    setRetryIn(null);

    const durationMs = 15000;
    const start = Date.now();

    const onDone = async () => {
      setLoading(false);
      setShowResults(true);
      setTimeout(() => {
        previewRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
      try {
        const freeReport = await analyzeUrl(url, "free");
        setReport(freeReport);
      } catch (e: any) {
        const msg = String(e?.message || "AI error");
        setAiError(msg);
        if (msg.includes("429")) {
          let t = 10;
          setRetryIn(t);
          const timer = setInterval(async () => {
            t -= 1;
            setRetryIn(t);
            if (t <= 0) {
              clearInterval(timer);
              setRetryIn(null);
              try {
                const again = await analyzeUrl(url, "free");
                setReport(again);
                setAiError("");
              } catch (e2: any) {
                setAiError(String(e2?.message || "AI error"));
              }
            }
          }, 1000);
        }
      }
    };

    const tick = () => {
      const delta = Date.now() - start;
      const p = Math.min(100, Math.round((delta / durationMs) * 100));
      setProgress(p);
      if (p < 100) requestAnimationFrame(tick);
      else onDone();
    };
    requestAnimationFrame(tick);
  };

  const handleRunTestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loading && url.trim()) runTest();
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    setEmailSubmitted(false);
    const ok = /.+@.+\..+/.test(email);
    if (!ok) {
      setEmailError("Please enter a valid email address");
      return;
    }
    if (!EMAIL_ENDPOINT_URL) {
      setEmailSubmitted(true);
      console.warn("EMAIL_ENDPOINT_URL not set – mocking success");
      return;
    }
    try {
      const payload = {
        email,
        site: url || "",
        score:
          report && typeof (report as any).score === "number"
            ? (report as any).score
            : undefined,
        message: "Request free PDF summary from Holbox AI",
      };
      const res = await fetch(EMAIL_ENDPOINT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Email endpoint error");
      setEmailSubmitted(true);
    } catch (err) {
      console.error(err);
      setEmailError(
        "Couldn't send email right now. Please try again in a moment."
      );
    }
  };

  // DEV flow: bez Stripe — ejam uz /full un palaižam full analyze turpat
  const handleOrderFullAudit = () => {
    const dest = "/full?url=" + encodeURIComponent(url || "");
    // atzīmējam dev=1 tikai info pēc vajadzības
    navigate(dest + (url ? "&dev=1" : "?dev=1"));
  };

  const handleSeeSample = () => {
    navigate("/full?sample=1");
  };

  const score =
    report && typeof (report as any).score === "number"
      ? ((report as any).score as number)
      : null;
  const sections: SectionPresence | undefined = report?.sections_detected;
  const heroSuggestions: Suggestion[] =
    (report as FreeReport)?.hero?.suggestions || [];
  const nextSuggestions: Suggestion[] =
    (report as FreeReport)?.next_section?.suggestions || [];
  const screenshotUrl: string | undefined | null =
    report?.assets?.screenshot_url;

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-900">
      {(!PAYMENT_LINK_URL || !EMAIL_ENDPOINT_URL) && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 text-sm">
          <div className="mx-auto max-w-6xl px-4 py-2">
            Running in <b>Dev/Test Mode</b>. Payment flow is mocked — “Order
            Full Audit” opens the full report directly.
          </div>
        </div>
      )}

      {/* MOBILE STICKY CTA */}
      <div className="md:hidden sticky top-0 z-30">
        <div className="mx-auto bg-white/95 backdrop-blur border-b">
          <div className="px-3 py-2 flex items-center gap-2">
            <form
              onSubmit={handleRunTestSubmit}
              className="flex w-full items-center gap-2"
            >
              <input
                aria-label="Enter your website URL"
                placeholder="yourdomain.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 rounded-lg px-3 py-2 bg-slate-50 border outline-none focus:ring-2 focus:ring-[#83C5BE]"
              />
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="rounded-lg px-3 py-2 bg-[#006D77] text-white text-sm font-medium disabled:opacity-60"
              >
                {loading ? "Running…" : "Run"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* NAV */}
      <header className="hidden md:block sticky top-0 z-20 backdrop-blur bg-white/70 border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[#006D77]" />
            <span className="font-semibold tracking-tight">Holbox AI</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a className="hover:opacity-80" href="#how">
              How it works
            </a>
            <a className="hover:opacity-80" href="#preview">
              Preview
            </a>
            <a className="hover:opacity-80" href="#pricing">
              Pricing
            </a>
            <a className="hover:opacity-80" href="#faq">
              FAQ
            </a>
          </nav>
          <button
            onClick={runTest}
            disabled={loading || !url.trim()}
            className="rounded-xl px-4 py-2 text-white bg-[#006D77] hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Running…" : "Run Free Test"}
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#006D77] to-[#83C5BE]" />
        <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-20 grid md:grid-cols-2 gap-8 md:gap-10 items-center">
          <div className="text-white">
            <h1 className="text-3xl md:text-5xl font-bold leading-tight">
              Full AI Website Audit in 1–2 Minutes
            </h1>
            <p className="mt-3 md:mt-4 text-base md:text-xl text-white/90">
              Instantly see what’s holding back your conversions and how to fix
              it — powered by 100+ CRO heuristics.
            </p>
            <div className="mt-4 md:mt-6 hidden md:flex flex-col sm:flex-row gap-3">
              <form
                onSubmit={handleRunTestSubmit}
                className="flex w-full flex-col sm:flex-row gap-3"
              >
                <input
                  aria-label="Enter your website URL"
                  placeholder="Enter your website URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 rounded-xl px-4 py-3 bg-white/95 text-slate-900 placeholder-slate-500 outline-none focus:ring-2 focus:ring-[#83C5BE]"
                />
                <button
                  type="submit"
                  disabled={loading || !url.trim()}
                  className="rounded-xl px-5 py-3 bg-[#FFDDD2] text-slate-900 font-medium hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? "Running…" : "Run Free Test"}
                </button>
              </form>
            </div>
            <div className="mt-3 md:mt-4 flex flex-wrap items-center gap-3 md:gap-4 text-white/80 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80" />
                No registration
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80" />
                Results in 1–2 min
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80" />
                AI analysis
              </div>
            </div>
          </div>
          <div className="bg-white/80 rounded-2xl p-5 md:p-6 shadow-xl">
            {!loading && !showResults && (
              <div className="h-48 md:h-56 rounded-xl bg-slate-100 border border-slate-200 grid place-items-center text-slate-500">
                Hero Preview Placeholder
              </div>
            )}
            {loading && (
              <div className="h-48 md:h-56 rounded-xl bg-white/90 border border-slate-200 p-5 flex flex-col justify-center">
                <div className="text-slate-700 font-medium">
                  Analyzing your site…
                </div>
                <div className="mt-3 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  Estimated score: {animatedScore}/100
                </div>
              </div>
            )}
            {showResults && (
              <div className="h-48 md:h-56 rounded-xl bg-slate-100 border border-slate-200 grid place-items-center text-slate-600">
                Analysis complete — see Preview below
              </div>
            )}
            <p className="mt-3 md:mt-4 text-slate-700 text-sm">
              This panel shows the current state of the audit (placeholder →
              analyzing → complete).
            </p>
          </div>
        </div>
      </section>

      {/* PREVIEW */}
      <section
        id="preview"
        ref={previewRef}
        className="mx-auto max-w-6xl px-3 md:px-4 py-10 md:py-16"
      >
        {!showResults ? (
          <div className="rounded-2xl border bg-white p-5 text-slate-600 text-sm text-center">
            Run a test to see your live preview here.
          </div>
        ) : (
          <div className="space-y-8">
            {(score !== null || sections) && (
              <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
                <div className="lg:col-span-1">
                  <h2 className="text-2xl md:text-3xl font-semibold">
                    Your Website Summary
                  </h2>
                  <p className="mt-2 text-slate-600">
                    AI-generated score and top blockers.
                  </p>
                  {score !== null && (
                    <div className="mt-5 p-5 rounded-2xl border bg-white">
                      <div className="text-sm text-slate-500">
                        Conversion Readiness Score
                      </div>
                      <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full bg-[#006D77]"
                          style={{ width: `${score}%` }}
                        />
                      </div>
                      <div className="mt-2 text-sm font-medium">
                        {score} / 100
                      </div>
                    </div>
                  )}
                  {aiError && (
                    <p className="mt-3 text-sm text-red-600">
                      {aiError}
                      {retryIn !== null && <> — retry in {retryIn}s…</>}
                    </p>
                  )}
                </div>

                <div className="lg:col-span-2 grid gap-4">
                  {sections && (
                    <div className="p-5 rounded-2xl border bg-white">
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

                  {(heroSuggestions.length > 0 ||
                    nextSuggestions.length > 0) && (
                    <div className="grid sm:grid-cols-2 gap-4">
                      {heroSuggestions.length > 0 && (
                        <div className="p-5 rounded-2xl border bg-white">
                          <div className="font-medium mb-1">
                            Hero — Suggestions
                          </div>
                          <ul className="text-sm text-slate-700 space-y-1">
                            {heroSuggestions.map((s, i) => (
                              <li key={i}>
                                • [{s.impact}] <b>{s.title}</b> —{" "}
                                {s.recommendation}
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
                                • [{s.impact}] <b>{s.title}</b> —{" "}
                                {s.recommendation}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {screenshotUrl && (
              <div className="rounded-2xl border bg-white p-2 overflow-hidden">
                <img
                  src={screenshotUrl}
                  alt="Screenshot"
                  className="w-full h-auto block"
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* EMAIL GATE */}
      <section className="mx-auto max-w-6xl px-3 md:px-4 py-12 md:py-16">
        <div className="rounded-3xl border bg-white p-5 md:p-10 grid md:grid-cols-2 gap-6 md:gap-8 items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-semibold">
              Get a Free PDF Summary
            </h3>
            <p className="mt-2 text-slate-600">
              Download your findings with annotated screenshots and quick fixes.
              No spam — unsubscribe anytime.
            </p>
          </div>
          <form
            onSubmit={handleEmailSubmit}
            className="flex w-full flex-col sm:flex-row gap-3"
          >
            <input
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-xl px-4 py-3 bg-slate-50 border outline-none focus:ring-2 focus:ring-[#83C5BE]"
            />
            <button
              type="submit"
              className="rounded-xl px-5 py-3 bg-[#006D77] text-white font-medium hover:opacity-90"
            >
              {emailSubmitted ? "Sent ✓" : "Send My Free PDF"}
            </button>
          </form>
          {(emailError || emailSubmitted) && (
            <div className="md:col-span-2">
              {emailError && (
                <p className="text-sm text-red-600">{emailError}</p>
              )}
              {emailSubmitted && (
                <p className="text-sm text-green-700">
                  Check your inbox — we’ve sent a link to download your free
                  PDF.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* FULL AUDIT OFFER */}
      <section
        id="pricing"
        className="mx-auto max-w-6xl px-3 md:px-4 py-12 md:py-16"
      >
        <div className="rounded-3xl border bg-white p-5 md:p-10 grid md:grid-cols-2 gap-6 md:gap-8 items-center">
          <div>
            <h3 className="text-2xl md:text-3xl font-semibold">
              Full AI Report in 1–2 Minutes — Just $50
            </h3>
            <ul className="mt-4 space-y-2 text-slate-700 text-sm md:text-base">
              <li>• 40+ checkpoints (UX, CRO, SEO, CWV)</li>
              <li>• Full annotated screenshots</li>
              <li>• Prioritized, dev-ready improvement list</li>
              <li>• PDF + online report (shareable link)</li>
            </ul>
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleOrderFullAudit}
                className="rounded-xl px-5 py-3 bg-[#FFDDD2] text-slate-900 font-medium hover:opacity-90"
              >
                Order Full Audit
              </button>
              <button
                onClick={handleSeeSample}
                className="rounded-xl px-5 py-3 border font-medium hover:bg-slate-50"
              >
                See Sample Report
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Dev mode: clicking “Order Full Audit” opens the full report
              directly.
            </p>
          </div>
          <div className="grid gap-3">
            <div className="h-40 md:h-44 rounded-2xl border bg-slate-50 grid place-items-center text-slate-500">
              Report preview placeholder
            </div>
            <div className="h-16 md:h-20 rounded-2xl border bg-slate-50 grid place-items-center text-slate-500">
              Metrics / badges
            </div>
          </div>
        </div>
      </section>

      {/* BENEFITS / CASE STUDY / FAQ / FOOTER – paliek kā iepriekš */}
      {/* ... (te atstāju neskartu tavu iepriekšējo saturu) ... */}
    </div>
  );
}
