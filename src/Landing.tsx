import React, { useRef, useState } from "react";
import GradeBadge from "./components/GradeBadge";
import Features from "./components/Features";
import Counters from "./components/Counters";
import ContactForm from "./components/ContactForm";

/**
 * Palīgfunkcijas drošam grading (ja nav utilu vai AI atbildes).
 * Piezīme: ja tev ir normalizeFreeReport u.c., vari droši aizvietot šīs.
 */
function safePct(n?: number) {
  if (typeof n === "number" && isFinite(n))
    return Math.max(0, Math.min(100, n));
  return 0;
}

export default function Landing() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // DEMO rezultātu “score” — aizstāj ar reālo AI rezultātu no tavas analīzes
  const demoScore = 75; // saglabāju kā tev bija
  const structurePct = 0; // ja nav datu — 0, citādi ieliec reālo
  const contentPct = 13;

  const runTest = () => {
    if (!url.trim()) return;
    setLoading(true);
    setShowResults(false);

    // demo “progress”
    const start = Date.now();
    const duration = 5000;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
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
      }
    };
    requestAnimationFrame(tick);
  };

  const handleSeeSample = () => {
    window.location.href = "/full?dev=1";
  };
  const handleOrderFull = () => {
    window.location.href = "/full";
  };

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-900">
      {/* NAV */}
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 border-b">
        <div className="mx-auto max-w-[1200px] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[#006D77]" />
            <span className="font-semibold tracking-tight">Holbox AI</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a className="hover:opacity-80" href="#preview">
              Preview
            </a>
            <a className="hover:opacity-80" href="#features">
              Features
            </a>
            <a className="hover:opacity-80" href="#faq">
              FAQ
            </a>
            <a className="hover:opacity-80" href="#contact">
              Contact
            </a>
          </nav>
          <button
            onClick={runTest}
            className="rounded-xl px-4 py-2 text-white bg-[#006D77] hover:opacity-90"
          >
            Run Free Test
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#006D77] to-[#83C5BE]" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-12 md:py-20 grid md:grid-cols-2 gap-8 items-center">
          <div className="text-white">
            <h1 className="text-3xl md:text-5xl font-bold leading-tight">
              Get a Second Opinion on Your Website.
            </h1>
            <p className="mt-3 md:mt-4 text-base md:text-xl text-white/90">
              The AI tool that instantly grades your landing pages and gives you
              an action plan to hold your team accountable.
            </p>
            <div className="mt-5 flex gap-3">
              <input
                aria-label="Enter your website URL"
                placeholder="Enter your website URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runTest()}
                className="flex-1 rounded-xl px-4 py-3 bg-white/95 text-slate-900 placeholder-slate-500 outline-none focus:ring-2 focus:ring-[#83C5BE]"
              />
              <button
                onClick={runTest}
                disabled={loading || !url.trim()}
                className="rounded-xl px-5 py-3 bg-[#FFDDD2] text-slate-900 font-medium hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Running…" : "Run Free Test"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-white/80 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80" />
                No sign-up needed
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80" />
                No credit card required
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

          {/* Hero labā puse – placeholder (šobrīd attēls) */}
          <div className="bg-white/80 rounded-2xl p-6 shadow-xl">
            <div className="h-48 md:h-56 rounded-xl bg-slate-100 border grid place-items-center text-slate-500">
              Hero Preview Placeholder
            </div>
            <p className="mt-3 text-slate-700 text-sm">
              This panel shows the audit state (placeholder → analyzing →
              complete).
            </p>
          </div>
        </div>
      </section>

      {/* PREVIEW / FREE REPORT CARDS */}
      <section
        id="preview"
        ref={previewRef}
        className="mx-auto max-w-[1200px] px-3 md:px-4 py-10 md:py-14"
      >
        {!showResults ? (
          <div className="rounded-2xl border bg-white p-5 text-slate-600 text-sm text-center">
            Run a test to see your live preview here.
          </div>
        ) : (
          <>
            {/* Grade — jauna vizualizācija */}
            <div className="grid lg:grid-cols-[1.1fr,0.9fr] gap-6">
              <div className="rounded-2xl border bg-white p-5 md:p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl md:text-2xl font-semibold">
                    Your Website’s Grade
                  </h2>
                  <GradeBadge score={demoScore} size="lg" />
                </div>
                <div className="mt-4 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77]"
                    style={{ width: `${demoScore}%` }}
                  />
                </div>
                <div className="mt-3 text-slate-700">
                  <span className="text-xl font-semibold">
                    {demoScore} / 100
                  </span>
                  <span className="ml-3 text-slate-500">
                    Grade shown based on heuristics (demo).
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-5 md:p-6">
                <div className="text-sm font-medium text-slate-700">
                  Sub-scores
                </div>
                <div className="grid grid-cols-1 gap-4 mt-3">
                  <div>
                    <div className="text-sm text-slate-600">Structure</div>
                    <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-[#99D6D0]"
                        style={{ width: `${safePct(structurePct)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {safePct(structurePct)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-600">Content</div>
                    <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-[#006D77]"
                        style={{ width: `${safePct(contentPct)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {safePct(contentPct)}%
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-sm text-slate-600">
                  If you fix the top 5 issues we estimate ≈ <b>+12% leads</b>.
                </div>
              </div>
            </div>

            {/* Scorecard CTA (paliek kā bija) */}
            <div className="mt-10 rounded-3xl border bg-white p-5 md:p-8 grid md:grid-cols-[1fr,0.9fr] gap-6 items-center">
              <div>
                <h3 className="text-xl md:text-2xl font-semibold">
                  Get a Free Scorecard for Your Website.
                </h3>
                <p className="mt-2 text-slate-600">
                  Download a report with your website’s top 3 weaknesses and a
                  few quick fixes. No credit card, no spam.
                </p>
              </div>
              <form className="flex w-full flex-col sm:flex-row gap-3">
                <input
                  placeholder="Enter your email"
                  className="flex-1 rounded-xl px-4 py-3 bg-slate-50 border outline-none focus:ring-2 focus:ring-[#83C5BE]"
                />
                <button className="rounded-xl px-5 py-3 bg-[#006D77] text-white font-medium hover:opacity-90">
                  Get My Free Scorecard
                </button>
              </form>
            </div>

            {/* Full audit piedāvājums (paliek) */}
            <section className="mt-12 rounded-3xl border bg-white p-5 md:p-10 grid md:grid-cols-2 gap-6 items-center">
              <div>
                <h3 className="text-2xl md:text-3xl font-semibold">
                  Full AI Report in 1–2 Minutes — Just $50
                </h3>
                <ul className="mt-4 space-y-2 text-slate-700 text-sm md:text-base">
                  <li>
                    • A Complete Check-up: We review over 40 critical points in
                    UX, SEO, CRO, and performance.
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
                    onClick={handleOrderFull}
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
              </div>
              <div className="grid gap-3">
                <div className="h-40 md:h-44 rounded-2xl border bg-slate-50 grid place-items-center text-slate-500">
                  Report preview placeholder
                </div>
                <div className="h-16 md:h-20 rounded-2xl border bg-slate-50 grid place-items-center text-slate-500">
                  Metrics / badges
                </div>
              </div>
            </section>
          </>
        )}
      </section>

      {/* BENEFITS (tavs before/after bloks paliek netraucēts) */}
      <section className="mx-auto max-w-[1200px] px-4 py-14">
        <div className="rounded-3xl border bg-white p-5 md:p-10 grid md:grid-cols-3 gap-6 items-center">
          <div className="md:col-span-2">
            <h3 className="text-2xl font-semibold">
              How Holbox AI Gave This Business Owner Confidence in Their
              Agency's Work.
            </h3>
            <p className="mt-2 text-slate-600">
              Before: CTA hidden below the fold, slow load times. After: CTA
              above the fold, load time &lt; 2.0s. Result: more sign-ups and
              lower CPA.
            </p>
            <blockquote className="mt-4 rounded-xl bg-slate-50 p-4 text-slate-700 text-sm">
              “I used to worry if I was wasting money, but the Holbox AI report
              gave me a clear list of improvements to request. Now I know I'm
              getting a great return.”
            </blockquote>
          </div>
          <div className="h-32 md:h-40 rounded-2xl border bg-slate-50 grid place-items-center text-slate-500">
            Before/After chart
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <div id="features">
        <Features onPrimaryClick={runTest} />
      </div>

      {/* FAQ + CTA */}
      <section id="faq" className="mx-auto max-w-[1200px] px-4 py-14">
        <h3 className="text-2xl font-semibold">FAQ</h3>
        <div className="mt-6 grid md:grid-cols-2 gap-6">
          {[
            [
              "Does AI make mistakes?",
              "The analysis is based on standards and heuristics; a human review is still possible.",
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
              "Yes. Many of our customers use Holbox AI to get an unbiased report on a new website or landing page. It's the fastest way to get a second opinion and ensure you're getting a great return.",
            ],
          ].map((qa, i) => (
            <div key={i} className="rounded-2xl border bg-white p-5">
              <div className="font-medium">{qa[0]}</div>
              <p className="mt-1 text-slate-600 text-sm">{qa[1]}</p>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <button
            onClick={runTest}
            className="rounded-xl px-5 py-3 bg-[#006D77] text-white font-medium hover:opacity-90"
          >
            Still have questions? Get a Free Scorecard
          </button>
        </div>
      </section>

      {/* CONTACT */}
      <ContactForm />

      {/* COUNTERS */}
      <Counters />

      {/* FOOTER */}
      <footer className="border-t">
        <div className="mx-auto max-w-[1200px] px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-[#006D77]" />
            <span>Holbox AI</span>
          </div>
          <div className="flex gap-6">
            <a href="#">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="#contact">Contact</a>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
          <div>Made with ❤️ in Latvia • © {new Date().getFullYear()}</div>
        </div>
      </footer>
    </div>
  );
}
