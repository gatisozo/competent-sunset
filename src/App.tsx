import React, { useRef, useState } from "react";
import type { CroAudit } from "./lib/analyze";
import { analyzeUrl } from "./lib/analyze";

/**
 * Holbox AI – Landing (React + Tailwind)
 * Integrated with OpenAI CRO analyzer via /api/analyze
 *
 * Env-driven fallbacks for payments/email (optional):
 *  - VITE_PAYMENT_LINK_URL
 *  - VITE_EMAIL_ENDPOINT_URL
 *  - VITE_SALES_EMAIL
 */

// --- ENV + inline fallback config ---
const PAYMENT_LINK_URL = import.meta.env.VITE_PAYMENT_LINK_URL || ""; // e.g. https://buy.stripe.com/test_abc...
const EMAIL_ENDPOINT_URL = import.meta.env.VITE_EMAIL_ENDPOINT_URL || ""; // e.g. https://formspree.io/f/xyz...
const SALES_EMAIL = import.meta.env.VITE_SALES_EMAIL || "sales@holbox.ai";

export default function App() {
  // URL + run test
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0); // 0..100 for countdown
  const [showResults, setShowResults] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // Email gate
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  // AI audit state
  const [aiAudit, setAiAudit] = useState<CroAudit | null>(null);
  const [aiError, setAiError] = useState("");

  // Animated score target (fallback if AI not yet configured)
  const fallbackScore = 72;
  const animatedScore = Math.min(
    fallbackScore,
    Math.round((progress / 100) * fallbackScore)
  );

  const runTest = () => {
    if (!url.trim()) return;
    // Reset state
    setShowResults(false);
    setProgress(0);
    setLoading(true);
    setAiAudit(null);
    setAiError("");

    // Demo countdown (15s). For production set 60_000..120_000.
    const durationMs = 15000;
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
      // Fetch real AI audit
      try {
        const audit = await analyzeUrl(url);
        setAiAudit(audit);
      } catch (e: any) {
        setAiError(e?.message || "AI error");
      }
    };

    const tick = () => {
      const delta = Date.now() - start;
      const p = Math.min(100, Math.round((delta / durationMs) * 100));
      setProgress(p);
      if (p < 100) {
        raf = requestAnimationFrame(tick);
      } else {
        onDone();
      }
    };
    let raf = requestAnimationFrame(tick);
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
        score: aiAudit?.score ?? undefined,
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

  const handleOrderFullAudit = () => {
    if (PAYMENT_LINK_URL) {
      window.location.href = PAYMENT_LINK_URL; // Payment Link / alt checkout
      return;
    }
    const subject = encodeURIComponent("Full Audit Order ($50)");
    const body = encodeURIComponent(
      `I would like to order a Full Audit.\n\nWebsite: ${
        url || "(please fill)"
      }\n` + `Notes: (optional)`
    );
    window.location.href = `mailto:${SALES_EMAIL}?subject=${subject}&body=${body}`;
  };

  const handleSeeSample = () => {
    alert("Sample report placeholder — link this to a live demo report.");
  };

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-900">
      {/* TEST MODE BANNER (shows when no endpoints configured) */}
      {(!PAYMENT_LINK_URL || !EMAIL_ENDPOINT_URL) && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 text-sm">
          <div className="mx-auto max-w-6xl px-4 py-2">
            Running in <b>Test Mode</b>. Configure{" "}
            <code>VITE_PAYMENT_LINK_URL</code> and{" "}
            <code>VITE_EMAIL_ENDPOINT_URL</code> to go live.
          </div>
        </div>
      )}

      {/* MOBILE STICKY CTA */}
      <div className="md:hidden sticky top-0 z-30">
        <div className="mx-auto bg-white/95 backdrop-blur border-b">
          <div className="px-3 py-2 flex items-center gap-2">
            <input
              aria-label="Enter your website URL"
              placeholder="yourdomain.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 rounded-lg px-3 py-2 bg-slate-50 border outline-none focus:ring-2 focus:ring-[#83C5BE]"
            />
            <button
              onClick={runTest}
              disabled={loading || !url.trim()}
              className="rounded-lg px-3 py-2 bg-[#006D77] text-white text-sm font-medium disabled:opacity-60"
            >
              {loading ? "Running…" : "Run"}
            </button>
          </div>
        </div>
      </div>

      {/* NAV (desktop) */}
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
              <input
                aria-label="Enter your website URL"
                placeholder="Enter your website URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
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
        ) : aiAudit ? (
          <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
            <div className="lg:col-span-1">
              <h2 className="text-2xl md:text-3xl font-semibold">
                Your Website Summary
              </h2>
              <p className="mt-2 text-slate-600">
                AI-generated score and top blockers.
              </p>
              <div className="mt-5 p-5 rounded-2xl border bg-white">
                <div className="text-sm text-slate-500">
                  Conversion Readiness Score
                </div>
                <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77]"
                    style={{ width: `${aiAudit.score}%` }}
                  />
                </div>
                <div className="mt-2 text-sm font-medium">
                  {aiAudit.score} / 100
                </div>
              </div>
              {aiError && (
                <p className="mt-3 text-sm text-red-600">{aiError}</p>
              )}
            </div>
            <div className="lg:col-span-2 grid gap-4">
              {aiAudit.key_findings.map((f, i) => (
                <div key={i} className="p-5 rounded-2xl border bg-white">
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
        ) : (
          <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
            <div className="lg:col-span-1">
              <h2 className="text-2xl md:text-3xl font-semibold">
                Your Website Summary
              </h2>
              <p className="mt-2 text-slate-600">
                A fast, shareable overview with an AI-generated score and the
                top blockers dragging down conversions.
              </p>
              <div className="mt-5 p-5 rounded-2xl border bg-white">
                <div className="text-sm text-slate-500">
                  Conversion Readiness Score
                </div>
                <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77]"
                    style={{ width: `${fallbackScore}%` }}
                  />
                </div>
                <div className="mt-2 text-sm font-medium">
                  {fallbackScore} / 100
                </div>
              </div>
            </div>
            <div className="lg:col-span-2 grid gap-4">
              {[
                "Main CTA is below the fold",
                "Mobile LCP is 3.5s (target <2.5s)",
                "Low contrast on primary button",
                "Unclear form labels",
                "Missing trust signals above the fold",
              ].map((t, i) => (
                <div
                  key={i}
                  className="p-5 rounded-2xl border bg-white flex items-start gap-4"
                >
                  <div className="mt-1 h-3 w-3 rounded-full bg-[#83C5BE]" />
                  <div>
                    <div className="font-medium">{t}</div>
                    <p className="text-sm text-slate-600 mt-1">
                      Short rationale and what to do next. (This becomes a full
                      annotated screenshot in the paid report.)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* EMAIL GATE for Free PDF */}
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
              <li>• See your Conversion Readiness Score</li>
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

      {/* COMPARISON TABLE */}
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
            <h3 className="text-2xl font-semibold">
              Case Study: +21% Conversions in 30 Days
            </h3>
            <p className="mt-2 text-slate-600">
              Before: CTA hidden below the fold, slow load times. After: CTA
              above the fold, load time &lt; 2.0s. Result: more sign-ups and
              lower CPA.
            </p>
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
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Contact</a>
          </div>
          <div>© {new Date().getFullYear()} Holbox AI</div>
        </div>
      </footer>
    </div>
  );
}
