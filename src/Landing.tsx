// src/Landing.tsx
import React, { useRef, useState } from "react";
import { analyzeUrl } from "./lib/analyze";
import type {
  CroReport,
  FreeReport,
  Suggestion,
  SectionPresence,
} from "./lib/analyze";

const PAYMENT_LINK_URL = import.meta.env.VITE_PAYMENT_LINK_URL || "";
const EMAIL_ENDPOINT_URL = import.meta.env.VITE_EMAIL_ENDPOINT_URL || "";
const SALES_EMAIL = import.meta.env.VITE_SALES_EMAIL || "sales@holbox.ai";

export default function Landing() {
  // URL + run test
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // Email gate
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  // AI report state
  const [report, setReport] = useState<CroReport | null>(null);
  const [aiError, setAiError] = useState("");
  const [retryIn, setRetryIn] = useState<number | null>(null);

  // progress demo → animated fallback score
  const fallbackScore = 72;
  const animatedScore = Math.min(
    fallbackScore,
    Math.round((progress / 100) * fallbackScore)
  );

  const runTest = () => {
    if (!url.trim()) return;

    // reset
    setShowResults(false);
    setProgress(0);
    setLoading(true);
    setReport(null);
    setAiError("");
    setRetryIn(null);

    const durationMs = 15000; // demo countdown
    const start = Date.now();

    const onDone = async () => {
      setLoading(false);
      setShowResults(true);
      setTimeout(
        () =>
          previewRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        100
      );

      // fetch real AI (free mode)
      try {
        const freeReport = await analyzeUrl(url, "free");
        setReport(freeReport);
      } catch (e: any) {
        const msg = String(e?.message || "AI error");
        setAiError(msg);

        // basic retry if 429
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
        message: "Request free scorecard from Holbox AI",
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

  // Dev flow to /full
  const handleOrderFullAudit = () => {
    const dest = "/full?url=" + encodeURIComponent(url || "") + "&dev=1";
    window.location.href = dest;
  };

  const handleSeeSample = () => {
    window.location.href = "/full?sample=1";
  };

  // derived
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
      {/* Test banner */}
      {(!PAYMENT_LINK_URL || !EMAIL_ENDPOINT_URL) && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 text-sm">
          <div className="mx-auto max-w-6xl px-4 py-2">
            Running in <b>Dev/Test Mode</b>. “Order Full Audit” opens the full
            report directly.
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
              Get a Second Opinion on Your Website.
            </h1>
            <p className="mt-3 md:mt-4 text-base md:text-xl text-white/90">
              The AI tool that instantly grades your landing pages and gives you
              an action plan to hold your team accountable.
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
                <div className="mt-2 text-sm text-slate-100/90">
                  Estimated grade: {animatedScore}/100
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
                    AI-generated grade and top blockers.
                  </p>

                  {score !== null && (
                    <div className="mt-5 p-5 rounded-2xl border bg-white">
                      <div className="text-sm text-slate-500">
                        Your Website’s Grade
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
                              {k.split("_").join(" ")}
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

      {/* EMAIL GATE (Scorecard) */}
      <section className="mx-auto max-w-6xl px-3 md:px-4 py-12 md:py-16">
        <div className="rounded-3xl border bg-white p-5 md:p-10 grid md:grid-cols-2 gap-6 md:gap-8 items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-semibold">
              Get a Free Scorecard for Your Website.
            </h3>
            <p className="mt-2 text-slate-600">
              Download a report with your website’s top 3 weaknesses and a few
              quick fixes. No credit card, no spam.
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
              {emailSubmitted ? "Sent ✓" : "Get My Free Scorecard"}
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
                  scorecard.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* PRICING */}
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
              <li>
                • A Complete Check-up: We review over 40 critical points in UX,
                SEO, CRO, and performance.
              </li>
              <li>• Full annotated screenshots</li>
              <li>
                • Actionable To-Do List: A prioritized list of fixes you can
                hand directly to your team or freelancer.
              </li>
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

      {/* BENEFITS */}
      <section className="mx-auto max-w-6xl px-3 md:px-4 py-12 md:py-16">
        <div className="grid md:grid-cols-2 gap-6 md:gap-8">
          <div className="rounded-3xl border bg-white p-5 md:p-6">
            <h4 className="text-lg md:text-xl font-semibold">
              Free Test — Benefits
            </h4>
            <ul className="mt-3 space-y-2 text-slate-700 text-sm md:text-base">
              <li>• See Your Website’s Grade</li>
              <li>• Discover top 3–5 issues holding you back</li>
              <li>• AI analysis based on industry best practices</li>
            </ul>
          </div>
          <div className="rounded-3xl border bg-white p-5 md:p-6">
            <h4 className="text-lg md:text-xl font-semibold">
              Full Audit — Benefits
            </h4>
            <ul className="mt-3 space-y-2 text-slate-700 text-sm md:text-base">
              <li>• Complete action plan — instantly</li>
              <li>• 40+ checkpoints across UX, CRO, and performance</li>
              <li>• Clear before/after examples; real conversion lifts</li>
            </ul>
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="mx-auto max-w-6xl px-3 md:px-4 py-12 md:py-16">
        <h3 className="text-2xl font-semibold mb-6">Compare Plans</h3>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-full text-sm bg-white">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-4">Feature</th>
                <th className="text-left p-4">Free Test</th>
                <th className="text-left p-4">Full Audit</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["AI Analysis", "✓", "✓"],
                ["Top 3–5 recommendations", "✓", "✓"],
                ["Full annotated screenshots", "✗", "✓"],
                ["40+ checkpoints", "✗", "✓"],
                ["Prioritized task list", "✗", "✓"],
                ["PDF & online report", "✓ (limited)", "✓ (full)"],
                ["Delivery time", "1–2 min", "1–2 min"],
                ["Price", "Free", "$50"],
              ].map((row, i) => (
                <tr key={i} className="border-t">
                  <td className="p-4 font-medium">{row[0]}</td>
                  <td className="p-4">{row[1]}</td>
                  <td className="p-4">{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CASE STUDY */}
      <section className="mx-auto max-w-6xl px-3 md:px-4 py-12 md:py-16">
        <div className="rounded-3xl border bg-white p-5 md:p-10 grid md:grid-cols-3 gap-6 md:gap-8 items-center">
          <div className="md:col-span-2">
            <h3 className="text-2xl md:text-3xl font-semibold">
              How Holbox AI Gave This Business Owner Confidence in Their
              Agency’s Work.
            </h3>
            <p className="mt-2 text-slate-600">
              Before: CTA hidden below the fold, slow load times. After: CTA
              above the fold, load time &lt; 2.0s. Result: more sign-ups and
              lower CPA.
            </p>
            <blockquote className="mt-4 p-4 bg-slate-50 border rounded-xl text-slate-700">
              “I used to worry if I was wasting money, but the Holbox AI report
              gave me a clear list of improvements to request. Now I know I’m
              getting a great return.”
            </blockquote>
          </div>
          <div className="h-28 md:h-32 rounded-2xl border bg-slate-50 grid place-items-center text-slate-500">
            Before/After chart
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className="mx-auto max-w-6xl px-3 md:px-4 py-12 md:py-16"
      >
        <h3 className="text-2xl font-semibold">FAQ</h3>
        <div className="mt-6 grid md:grid-cols-2 gap-6">
          {[
            [
              "Does AI make mistakes?",
              "The analysis is based on measurable data and CRO standards, but human validation is always possible.",
            ],
            [
              "Do you need server access?",
              "No, the audit runs on publicly available content only.",
            ],
            [
              "Are my data secure?",
              "Reports are deleted after 14 days unless permanent access is purchased.",
            ],
            [
              "Which pages are scanned?",
              "Key pages like home, product/service, and forms/checkout (configurable).",
            ],
            [
              "Can I use this to evaluate the work of my marketing team or agency?",
              "Yes. Many of our customers use Holbox AI to get an unbiased report on a new website or landing page. It's the fastest way to get a second opinion and ensure you're getting a great return on your investment.",
            ],
          ].map((f, i) => (
            <div key={i} className="rounded-2xl border bg-white p-5">
              <div className="font-medium">{f[0]}</div>
              <p className="mt-1 text-slate-600 text-sm">{f[1]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-3 md:px-4 py-8 md:py-10 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-[#006D77]" />
            <span>Holbox AI</span>
          </div>
          <div className="flex gap-6">
            <a href="/privacy.html">Privacy</a>
            <a href="/terms.html">Terms</a>
            <a href="#contact">Contact</a>
          </div>
          <div>© {new Date().getFullYear()} Holbox AI</div>
        </div>
      </footer>
    </div>
  );
}
