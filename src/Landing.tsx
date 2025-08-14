// src/Landing.tsx
import React, { useMemo, useRef, useState, useEffect } from "react";
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
const SCREENSHOT_URL_TMPL =
  import.meta.env.VITE_SCREENSHOT_URL_TMPL ||
  // WordPress mShots kā drošs rezerves variants
  "https://s.wordpress.com/mshots/v1/{URL}?w=1200";

/* ---------------- helpers ---------------- */
function impactRank(i?: "high" | "medium" | "low") {
  if (i === "high") return 3;
  if (i === "medium") return 2;
  return 1;
}
function makeBackupShot(u: string) {
  try {
    const url = new URL(u);
    const abs = `${url.protocol}//${url.host}${url.pathname}`;
    return SCREENSHOT_URL_TMPL.replace("{URL}", encodeURIComponent(abs));
  } catch {
    // ja ievadīts tikai domēns
    const normalized = u.startsWith("http") ? u : `https://${u}`;
    return SCREENSHOT_URL_TMPL.replace("{URL}", encodeURIComponent(normalized));
  }
}
function isHeroFinding(title: string) {
  const t = (title || "").toLowerCase();
  return (
    t.includes("hero") ||
    t.includes("above the fold") ||
    t.includes("headline") ||
    t.includes("cta") ||
    t.includes("primary button")
  );
}

/** vienkāršs “gudrais” screenshot ielādētājs ar spinner + retry + cache-buster */
function useSmartScreenshot(primary?: string | null, fallbackFromUrl?: string) {
  const [src, setSrc] = useState<string | null>(primary || null);
  const [loading, setLoading] = useState<boolean>(!!primary);
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 5;

  useEffect(() => {
    setSrc(
      primary || (fallbackFromUrl ? makeBackupShot(fallbackFromUrl) : null)
    );
    setLoading(!!(primary || fallbackFromUrl));
    setAttempts(0);
  }, [primary, fallbackFromUrl]);

  const withCb = (u: string) =>
    u + (u.includes("?") ? "&" : "?") + "cb=" + Date.now();

  const onLoad: React.ReactEventHandler<HTMLImageElement> = (e) => {
    const img = e.currentTarget;
    // ja atnācis pārāk mazs, pamēģinam vēl
    if (
      (img.naturalWidth < 400 || img.naturalHeight < 250) &&
      attempts < MAX_ATTEMPTS &&
      src
    ) {
      setAttempts((a) => a + 1);
      setTimeout(() => setSrc(withCb(src)), 1200);
    } else {
      setLoading(false);
    }
  };

  const onError = () => {
    if (attempts < MAX_ATTEMPTS && src) {
      setAttempts((a) => a + 1);
      setSrc(withCb(src));
    } else {
      setLoading(false);
    }
  };

  return { src, loading, onLoad, onError };
}

/* ---------------- Badges row (nemainīts) ---------------- */
function BadgesRow() {
  const Item = ({
    title,
    subtitle,
    icon,
  }: {
    title: string;
    subtitle: string;
    icon: React.ReactNode;
  }) => (
    <div className="flex flex-col items-center text-center gap-3">
      <div className="relative grid place-items-center h-24 w-24 rounded-full">
        <div className="absolute inset-0 rounded-full border border-slate-200" />
        <div className="absolute inset-2 rounded-full border border-slate-200" />
        <div className="relative">{icon}</div>
      </div>
      <div className="text-base font-medium">{title}</div>
      <div className="text-sm text-slate-600">{subtitle}</div>
    </div>
  );

  const accent = "#E29578";

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Item
          title="100+"
          subtitle="Checkpoints"
          icon={
            <svg
              aria-hidden
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              className="opacity-90"
            >
              <circle cx="11" cy="11" r="7" stroke={accent} strokeWidth="2" />
              <line
                x1="16.65"
                y1="16.65"
                x2="21"
                y2="21"
                stroke={accent}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          }
        />
        <Item
          title="Potential"
          subtitle="+20% Lift"
          icon={
            <svg
              aria-hidden
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M4 20V6"
                stroke={accent}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M8 20V10"
                stroke={accent}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M12 20V8"
                stroke={accent}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M16 20V5m0 0l3 3m-3-3l-3 3"
                stroke={accent}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          }
        />
        <Item
          title="Report"
          subtitle="in 1–2 Minutes"
          icon={
            <svg
              aria-hidden
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="12" cy="12" r="9" stroke={accent} strokeWidth="2" />
              <path
                d="M12 7v6l4 2"
                stroke={accent}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
        />
        <Item
          title="Trusted by"
          subtitle="10,000+ Audits"
          icon={
            <svg
              aria-hidden
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M12 3l7 3v5c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6l7-3z"
                stroke={accent}
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M9 12l2 2 4-4"
                stroke={accent}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
        />
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function Landing() {
  // URL + run test
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0); // 0..100
  const [eta, setEta] = useState(15); // sekundes līdz gatavs (demo)
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

  // progress demo → animated fallback grade
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
    setEta(15);
    setLoading(true);
    setReport(null);
    setAiError("");
    setRetryIn(null);

    const durationMs = 15000; // demo countdown
    const start = Date.now();

    // ETA sekundes
    const etaTimer = setInterval(() => {
      const left = Math.max(0, 15 - Math.floor((Date.now() - start) / 1000));
      setEta(left);
      if (left <= 0) clearInterval(etaTimer);
    }, 250);

    const onDone = async () => {
      setLoading(false);
      setShowResults(true);
      setTimeout(
        () => previewRef.current?.scrollIntoView({ behavior: "smooth" }),
        100
      );

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
        subject: "Your Holbox AI Website Scorecard",
        message:
          "Requesting my free website scorecard from Holbox AI (top weaknesses + quick fixes).",
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

  // Dev flow → /full
  const handleOrderFullAudit = () => {
    const dest = "/full?url=" + encodeURIComponent(url || "") + "&dev=1";
    window.location.href = dest;
  };
  const handleSeeSample = () => {
    window.location.href = "/full?sample=1";
  };

  // derived for free preview
  const score =
    report && typeof (report as any).score === "number"
      ? ((report as any).score as number)
      : null;
  const sections: SectionPresence | undefined = report?.sections_detected;

  // Izvilksim ieteikumus, izvēloties TOP-3 ar augstāko impact
  const heroSuggestions: Suggestion[] =
    (report as FreeReport)?.hero?.suggestions || [];
  const nextSuggestions: Suggestion[] =
    (report as FreeReport)?.next_section?.suggestions || [];
  const top3Suggestions = useMemo(() => {
    const all = [...heroSuggestions, ...nextSuggestions];
    return all
      .slice()
      .sort((a, b) => impactRank(b.impact) - impactRank(a.impact))
      .slice(0, 3);
  }, [heroSuggestions, nextSuggestions]);

  // Hero screenshot (ja atdod API), citādi – rezerves mShots
  const pageUrl = (report as any)?.page?.url || url || "";
  const apiShot = (report as any)?.assets?.screenshot_url as string | undefined;
  const {
    src: heroShot,
    loading: shotLoading,
    onLoad,
    onError,
  } = useSmartScreenshot(apiShot || null, pageUrl);

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-900">
      {/* Test banner */}
      {(!PAYMENT_LINK_URL || !EMAIL_ENDPOINT_URL) && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 text-sm">
          <div className="mx-auto max-w-[2030px] px-4 py-2">
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
        <div className="mx-auto max-w-[2030px] px-4 py-3 flex items-center justify-between">
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
            className="rounded-xl px-4 py-2 text-white bg-[#E76F51] hover:bg-[#d86147] disabled:opacity-60"
          >
            {loading ? "Running…" : "Run Free Test"}
          </button>
        </div>
      </header>

      {/* HERO — ar attēlu labajā pusē un uzlabotu stilu */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#006D77] to-[#83C5BE]" />
        <div className="relative mx-auto max-w-[2030px] px-4 py-12 md:py-16 grid md:grid-cols-2 gap-8 md:gap-10 items-center">
          <div className="text-white">
            <h1 className="text-3xl md:text-5xl font-bold leading-tight">
              Get a Second Opinion on Your Website.
            </h1>
            <p className="mt-3 md:mt-4 text-base md:text-xl text-white/90">
              The AI tool that instantly grades your landing pages and gives you
              an action plan to hold your team accountable.
            </p>

            <div className="mt-4 md:mt-6">
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
                  className="rounded-xl px-5 py-3 bg-[#E76F51] hover:bg-[#d86147] text-white font-medium disabled:opacity-60"
                >
                  {loading ? "Running…" : "Run Free Test"}
                </button>
              </form>
            </div>

            <div className="mt-3 md:mt-4 flex flex-wrap items-center gap-4 text-white/90 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80" /> No sign-up
                needed
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80" /> No credit
                card required
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80" /> Results in
                1–2 min
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80" /> AI
                analysis
              </div>
            </div>
          </div>

          {/* HERO IMAGE PANEL */}
          <div className="hidden md:block">
            <div className="relative rounded-2xl border bg-white/90 p-3 shadow-xl overflow-hidden">
              {/* Glare stripe */}
              <div className="pointer-events-none absolute -left-1/3 top-0 h-full w-1/2 rotate-12 bg-white/20 blur-2xl animate-glide" />
              {/* Image */}
              <img
                src="/hero.png"
                alt="Holbox AI hero illustration"
                className="w-full h-auto rounded-xl animate-float"
              />
              {/* Soft gradient at bottom to blend */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" />
            </div>
          </div>
        </div>

        {/* local keyframes */}
        <style>{`
          @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-6px); } 100% { transform: translateY(0px); } }
          .animate-float { animation: float 9s ease-in-out infinite; }
          @keyframes glide { 0% { transform: translateX(-40%) rotate(12deg); opacity: .0; } 30% { opacity: .35; } 60% { opacity: .2; } 100% { transform: translateX(140%) rotate(12deg); opacity: .0; } }
          .animate-glide { animation: glide 7.5s ease-in-out infinite; }
        `}</style>
      </section>

      {/* PREVIEW — **Free report** */}
      <section
        id="preview"
        ref={previewRef}
        className="mx-auto max-w-[2030px] px-3 md:px-4 py-8 md:py-12"
      >
        {!showResults ? (
          <div className="rounded-2xl border bg-white p-5 text-slate-600 text-sm text-center">
            Run a test to see your live preview here.
          </div>
        ) : (
          <>
            {/* Animēts statusbar + ETA */}
            {loading && (
              <div className="mb-4">
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77] transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Generating… ~{eta}s left
                </div>
              </div>
            )}

            {score !== null ||
            sections ||
            (heroShot && top3Suggestions.length) ? (
              <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
                {/* Summary (Grade) */}
                <div className="lg:col-span-1">
                  <h2 className="text-2xl md:text-3xl font-semibold">
                    Your Website Summary
                  </h2>
                  <p className="mt-2 text-slate-600">
                    AI-generated grade and top blockers.
                  </p>

                  <div className="mt-5 p-5 rounded-2xl border bg-white">
                    <div className="text-sm text-slate-500">
                      Your Website’s Grade
                    </div>
                    <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-[#006D77]"
                        style={{ width: `${score ?? animatedScore}%` }}
                      />
                    </div>
                    <div className="mt-2 text-sm font-medium">
                      {score ?? animatedScore} / 100
                    </div>
                  </div>

                  {aiError && (
                    <p className="mt-3 text-sm text-red-600">
                      {aiError}
                      {retryIn !== null && <> — retry in {retryIn}s…</>}
                    </p>
                  )}
                </div>

                {/* Hero preview ar overlay (TOP-3 worst findings) */}
                <div className="lg:col-span-2 grid gap-4">
                  {heroShot && top3Suggestions.length > 0 ? (
                    <div className="p-3 rounded-2xl border bg-white">
                      <div className="font-medium mb-1">Hero — Top Issues</div>
                      <div className="relative rounded-xl overflow-hidden border bg-white h-[420px]">
                        {/* Spinner */}
                        {shotLoading && (
                          <div className="absolute inset-0 grid place-items-center bg-white/60 z-10">
                            <div className="h-8 w-8 border-2 border-slate-300 border-t-[#006D77] rounded-full animate-spin" />
                          </div>
                        )}
                        {/* eslint-disable-next-line jsx-a11y/alt-text */}
                        <img
                          src={heroShot || undefined}
                          onLoad={onLoad}
                          onError={onError}
                          className={
                            shotLoading
                              ? "opacity-0 transition-opacity duration-300 w-full h-full object-cover"
                              : "opacity-100 transition-opacity duration-300 w-full h-full object-cover"
                          }
                          style={{ objectPosition: "top" }}
                        />

                        {/* Overlay ar 3 sliktākajiem */}
                        <div className="absolute right-2 bottom-2 bg-white/95 border rounded-lg p-3 text-xs max-w-[85%] shadow">
                          <div className="font-medium mb-1">
                            Top suggestions
                          </div>
                          <ul className="space-y-1">
                            {top3Suggestions.map((s, i) => (
                              <li key={i}>
                                • [{s.impact}] <b>{s.title}</b> —{" "}
                                {s.recommendation}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Sections present */}
                  {sections && (
                    <div className="p-5 rounded-2xl border bg-white">
                      <div className="font-medium mb-2">Sections Present</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                        {Object.entries(sections).map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2">
                            <span
                              className={
                                v
                                  ? "h-2 w-2 rounded-full bg-emerald-500"
                                  : "h-2 w-2 rounded-full bg-slate-300"
                              }
                            />
                            <span className={v ? "" : "text-slate-400"}>
                              {k.split("_").join(" ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border bg-white p-5 text-slate-600 text-sm text-center">
                We couldn’t parse enough content from that URL. Try another
                page.
              </div>
            )}
          </>
        )}
      </section>

      {/* SCORECARD */}
      <section className="mx-auto max-w-[2030px] px-3 md:px-4 py-10 md:py-12">
        <div className="rounded-3xl border bg-white p-5 md:p-8 grid md:grid-cols-2 gap-6 md:gap-8 items-center">
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
        className="mx-auto max-w-[2030px] px-3 md:px-4 py-10 md:py-12"
      >
        <div className="rounded-3xl border bg-white p-5 md:p-8 grid md:grid-cols-2 gap-6 md:gap-8 items-start">
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
                className="rounded-xl px-5 py-3 bg-[#E76F51] hover:bg-[#d86147] text-white font-medium"
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

          {/* RIGHT column ar preview + badges */}
          <div className="grid gap-4">
            <div className="rounded-2xl border bg-slate-50 overflow-hidden">
              <img
                src="/report-1.png"
                alt="Report preview"
                className="w-full h-auto block"
              />
            </div>
            <BadgesRow />
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="mx-auto max-w-[2030px] px-3 md:px-4 py-10 md:py-12">
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

      {/* CASE STUDY */}
      <section className="mx-auto max-w-[2030px] px-3 md:px-4 py-10 md:py-12">
        <div className="rounded-3xl border bg-white p-5 md:p-8 grid md:grid-cols-3 gap-6 md:gap-8 items-center">
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
          <div className="rounded-2xl border bg-slate-50 overflow-hidden">
            <img
              src="/before-after.png"
              alt="Before and after results"
              className="w-full h-auto block"
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className="mx-auto max-w-[2030px] px-3 md:px-4 py-10 md:py-12"
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
        <div className="mx-auto max-w-[2030px] px-3 md:px-4 py-8 md:py-10 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 text-sm text-slate-600">
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
