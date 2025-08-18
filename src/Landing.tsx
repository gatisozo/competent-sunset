import React, { useRef, useState } from "react";
import GradeBadge from "./components/GradeBadge";
import Features from "./components/Features";
import Counters from "./components/Counters";
import ContactForm from "./components/ContactForm";

type LandingProps = {
  freeReport?: any;
  onRunTest?: (url: string) => Promise<void> | void;
  onOrderFull?: () => void;
  onSeeSample?: () => void;
};

function safePct(n?: number) {
  if (typeof n === "number" && isFinite(n))
    return Math.max(0, Math.min(100, n));
  return 0;
}

const BLUR_TABS = new Set(["Findings", "Content Audit", "Copy Suggestions"]);
const DEV_MODE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.DEV) ||
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_DEV_MODE === "1");

export default function Landing({
  freeReport: _freeReport,
  onRunTest,
  onOrderFull,
  onSeeSample,
}: LandingProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("Overall");
  const [lastTestedUrl, setLastTestedUrl] = useState<string>("");
  const previewRef = useRef<HTMLDivElement | null>(null);

  // --- Demo skaitļi (mock; aizstāj ar reālajiem, ja pieslēdz API) ---
  const demoScore = 73;
  const structurePct = 76;
  const contentPct = 70;

  const sectionsPresent = [
    { title: "hero", ok: true },
    { title: "social proof", ok: true },
    { title: "features", ok: true },
    { title: "contact", ok: true },
    { title: "value prop", ok: true },
    { title: "pricing", ok: false },
    { title: "faq", ok: true },
    { title: "footer", ok: true },
  ];

  // Quick Wins ar % ieguvumu (badge)
  const quickWins: { text: string; upliftPct: number }[] = [
    { text: "Add testimonials to build credibility.", upliftPct: 6 },
    { text: "Improve navigation structure for ease of access.", upliftPct: 4 },
    { text: "Enhance FAQ section with clearer formatting.", upliftPct: 3 },
  ];

  // Prioritized backlog ar % badge
  const backlog = [
    {
      title: "Revise Hero Section Copy",
      impact: "high",
      effort: "2d",
      upliftPct: 20,
    },
    {
      title: "Integrate Testimonials",
      impact: "med",
      effort: "3d",
      upliftPct: 10,
    },
    {
      title: "Enhance FAQ Section",
      impact: "med",
      effort: "2d",
      upliftPct: 10,
    },
    {
      title: "Add Pricing Information",
      impact: "low",
      effort: "4d",
      upliftPct: 5,
    },
    {
      title: "Improve Navigation Flow",
      impact: "high",
      effort: "3d",
      upliftPct: 20,
    },
  ];

  // --- Demo “screenshot” (bilde) ---
  const heroShot = "/report-1.png";
  const shotExists = true;

  const normalizeUrl = (u: string) =>
    u.startsWith("http") ? u : `https://${u}`;

  // ===== RUN TEST + animētais progress =====
  const runTestDemo = () => {
    if (!url.trim()) return;
    const normalized = normalizeUrl(url.trim());
    setLastTestedUrl(normalized);

    // reset stāvokļi
    setActiveTab("Overall");
    setShowResults(false);
    setLoading(true);
    setProgress(0);

    // demo ilgums
    const duration = 12000; // 12s demo; vari brīvi mainīt
    const start = Date.now();

    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setProgress(Math.round(p * 100));
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        setLoading(false);
        setShowResults(true);
        setTimeout(() => {
          previewRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 120);
      }
    };
    requestAnimationFrame(tick);

    // opc. callback
    if (onRunTest) {
      try {
        Promise.resolve(onRunTest(normalizeUrl(url))).catch(() => {});
      } catch {}
    }
  };

  const handleRun = () => {
    if (!url.trim()) return;
    runTestDemo();
  };

  // === DEV workflow → uzreiz uz Full report ar dev=1 & pēdējo testēto URL ===
  const resolvedAuditUrl =
    lastTestedUrl || (url.trim() ? normalizeUrl(url) : "");
  const orderFullInternal = () => {
    const href = DEV_MODE
      ? `/full?dev=1${
          resolvedAuditUrl ? `&url=${encodeURIComponent(resolvedAuditUrl)}` : ""
        }`
      : `/full${
          resolvedAuditUrl ? `?url=${encodeURIComponent(resolvedAuditUrl)}` : ""
        }`;
    window.location.href = href;
  };
  const seeSampleInternal = () => {
    const href = `/full?dev=1${
      resolvedAuditUrl ? `&url=${encodeURIComponent(resolvedAuditUrl)}` : ""
    }`;
    window.location.href = href;
  };

  // ---- Tab helpers ----
  const TabButton = ({ name }: { name: string }) => (
    <button
      type="button"
      onClick={() => setActiveTab(name)}
      className={
        "px-4 py-2 rounded-t-xl text-sm border " +
        (activeTab === name
          ? "bg-white border-slate-200 font-medium"
          : "bg-slate-100/60 text-slate-700 border-transparent hover:bg-white")
      }
    >
      {name}
    </button>
  );

  const BlurPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm">{children}</div>
      <div className="absolute inset-0 grid place-items-center">
        <div className="rounded-xl bg-white/80 backdrop-blur border px-5 py-4 text-center shadow-sm">
          <div className="text-sm text-slate-700">
            Detailed view available in the Full Audit.
          </div>
          <button
            onClick={onOrderFull ?? orderFullInternal}
            className="mt-3 rounded-lg px-4 py-2 bg-[#FFDDD2] text-slate-900 font-medium hover:opacity-90"
          >
            Order Full Audit
          </button>
        </div>
      </div>
    </div>
  );

  const TabsArea = () => (
    <div className="mt-6">
      <div className="flex gap-2 pl-2">
        {[
          "Overall",
          "Sections Present",
          "Quick Wins",
          "Prioritized Backlog",
          "Findings",
          "Content Audit",
          "Copy Suggestions",
        ].map((t) => (
          <TabButton key={t} name={t} />
        ))}
      </div>

      <div className="border border-t-0 rounded-b-xl bg-white p-4">
        {/* OVERALL */}
        {activeTab === "Overall" && (
          <div className="text-slate-700">
            {loading ? (
              // === Animētais status bar, kamēr ģenerējas ===
              <div className="rounded-xl border bg-white p-5">
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
                  Progress: {progress}% • Estimated time: ~
                  {Math.max(1, Math.ceil((100 - progress) / 8))}s
                </div>
              </div>
            ) : shotExists ? (
              <div className="rounded-xl overflow-hidden border">
                <img
                  src={heroShot}
                  alt="Hero snapshot"
                  className="w-full h-auto block"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="h-48 grid place-items-center text-slate-500">
                Run a test to see your live preview here.
              </div>
            )}
          </div>
        )}

        {/* SECTIONS */}
        {activeTab === "Sections Present" && (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {sectionsPresent.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border px-3 py-2"
              >
                <span
                  className={
                    "h-2 w-2 rounded-full " +
                    (s.ok ? "bg-emerald-500" : "bg-rose-500")
                  }
                />
                <span className="text-sm">{s.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* QUICK WINS — ar % badge */}
        {activeTab === "Quick Wins" && (
          <ul className="space-y-2">
            {quickWins.map((q, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-3 rounded-xl border p-3"
              >
                <span className="text-slate-700">{q.text}</span>
                <span className="shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50">
                  ≈ +{q.upliftPct}% leads
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* BACKLOG — akcentēts % badge */}
        {activeTab === "Prioritized Backlog" && (
          <div className="grid md:grid-cols-2 gap-3">
            {backlog.map((b, i) => (
              <div key={i} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{b.title}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Impact:{" "}
                      <span
                        className={
                          b.impact === "high"
                            ? "text-rose-600"
                            : b.impact === "med"
                            ? "text-amber-600"
                            : "text-emerald-600"
                        }
                      >
                        {b.impact}
                      </span>{" "}
                      • Effort: {b.effort}
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50">
                    ≈ +{b.upliftPct}% leads
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* BLURRED TABS */}
        {BLUR_TABS.has(activeTab) && (
          <BlurPanel>
            <div className="h-56 rounded-xl border bg-slate-50 grid place-items-center text-slate-400">
              {activeTab}
            </div>
          </BlurPanel>
        )}
      </div>
    </div>
  );

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
            onClick={handleRun}
            disabled={loading || !url.trim()}
            className="rounded-xl px-4 py-2 text-white bg-[#006D77] hover:opacity-90 disabled:opacity-60"
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
            <form
              className="mt-5 flex gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleRun();
              }}
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
                className="rounded-xl px-5 py-3 bg-[#FF6B6B] text-white font-semibold shadow-sm hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Running…" : "Run Free Test"}
              </button>
            </form>
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

          {/* HERO preview: VIDEO */}
          <div className="bg-white/80 rounded-2xl p-6 shadow-xl">
            <div className="rounded-xl overflow-hidden border">
              <video
                src="/hero.mp4"
                className="w-full h-48 md:h-56 object-cover"
                autoPlay
                muted
                loop
                playsInline
              />
            </div>
            <p className="mt-3 text-slate-700 text-sm">
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
        className="mx-auto max-w-[1200px] px-3 md:px-4 py-10 md:py-14"
      >
        {!showResults ? (
          <div className="rounded-2xl border bg-white p-5 text-slate-600 text-sm text-center">
            {/* Ja nav palaists tests – aicinājums */}
            Run a test to see your live preview here.
          </div>
        ) : (
          <>
            {/* Grade + sub-scores */}
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
                  <span className="ml-3 text-slate-500">Grade: C (demo)</span>
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
                  If you fix the top 5 issues we estimate ≈ <b>+18% leads</b>.
                </div>
              </div>
            </div>

            {/* TABI */}
            <TabsArea />

            {/* Scorecard CTA */}
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
              <form
                className="flex w-full flex-col sm:flex-row gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                }}
              >
                <input
                  placeholder="Enter your email"
                  className="flex-1 rounded-xl px-4 py-3 bg-slate-50 border outline-none focus:ring-2 focus:ring-[#83C5BE]"
                />
                <button
                  type="submit"
                  className="rounded-xl px-5 py-3 bg-[#006D77] text-white font-medium hover:opacity-90"
                >
                  Get My Free Scorecard
                </button>
              </form>
            </div>
          </>
        )}
      </section>

      {/* FEATURES */}
      <div id="features">
        <Features onPrimaryClick={handleRun} />
      </div>

      {/* FULL REPORT bloks (zem Features) ar hero.png + badges.png vienā rindā */}
      <section className="mx-auto max-w-[1200px] px-4 py-12">
        <div className="rounded-3xl border bg-white p-5 md:p-10 grid md:grid-cols-2 gap-6 items-center">
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
                onClick={onOrderFull ?? orderFullInternal}
                className="rounded-xl px-5 py-3 bg-[#FFDDD2] text-slate-900 font-medium hover:opacity-90"
              >
                Order Full Audit
              </button>
              <button
                onClick={onSeeSample ?? seeSampleInternal}
                className="rounded-xl px-5 py-3 border font-medium hover:bg-slate-50"
              >
                See Sample Report
              </button>
            </div>
          </div>
          <div className="grid gap-3">
            <img
              src="/hero.png"
              alt="Report preview"
              className="w-full rounded-2xl border"
              loading="lazy"
            />
            <img
              src="/badges.png"
              alt="Badges"
              className="w-full rounded-2xl border"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* COUNTERS PĀRCELTI AUGŠUP */}
      <Counters />

      {/* Case study */}
      <section className="mx-auto max-w-[1200px] px-4 py-14">
        <div className="rounded-3xl border bg-white p-5 md:p-10 grid md:grid-cols-3 gap-6 items-center">
          <div className="md:col-span-2">
            <h3 className="text-2xl font-semibold">
              How Holbox AI Gave This Business Owner Confidence in Their
              Agency's Work.
            </h3>
            <p className="mt-2 text-slate-600">
              Before: CTA below the fold, slow load times. After: CTA above the
              fold, load time &lt; 2.0s. Result: more sign-ups and lower CPA.
            </p>
            <blockquote className="mt-4 rounded-xl bg-slate-50 p-4 text-slate-700 text-sm">
              “I used to worry if I was wasting money, but the Holbox AI report
              gave me a clear list of improvements to request. Now I know I'm
              getting a great return.”
            </blockquote>
          </div>
          <div className="rounded-2xl border overflow-hidden">
            <img
              src="/before-after.png"
              alt="Before / After chart"
              className="w-full h-auto"
              loading="lazy"
            />
          </div>
        </div>
      </section>

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
            onClick={handleRun}
            className="rounded-xl px-5 py-3 bg-[#006D77] text-white font-medium hover:opacity-90"
          >
            Still have questions? Get a Free Scorecard
          </button>
        </div>
      </section>

      {/* CONTACT */}
      <div id="contact">
        <ContactForm />
      </div>

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
