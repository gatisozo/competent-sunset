import React, { useEffect, useMemo, useRef, useState } from "react";
import { analyzeUrl } from "./lib/analyze";
import type {
  CroReport,
  FreeReport,
  SectionPresence,
  Suggestion,
  Impact,
} from "./lib/analyze";

/* ========= ENV ========= */
const PAYMENT_LINK_URL = import.meta.env.VITE_PAYMENT_LINK_URL || "";
const EMAIL_ENDPOINT_URL = import.meta.env.VITE_EMAIL_ENDPOINT_URL || "";
const SALES_EMAIL = import.meta.env.VITE_SALES_EMAIL || "sales@holbox.ai";
const SCREENSHOT_URL_TMPL =
  import.meta.env.VITE_SCREENSHOT_URL_TMPL ||
  "https://s.wordpress.com/mshots/v1/{URL}?w=1200";

// Counteru sākumvērtības (override ar env, ja vēlies)
const METRIC_REPORTS = Number(import.meta.env.VITE_METRIC_REPORTS ?? 12843);
const METRIC_FULLS = Number(import.meta.env.VITE_METRIC_FULLS ?? 2122);
const METRIC_DOMAINS = Number(import.meta.env.VITE_METRIC_DOMAINS ?? 10057);

/* ========= HELPERS ========= */
type Phase = "idle" | "loading" | "ready" | "error";

const impactWeight: Record<Impact, number> = {
  high: 8,
  medium: 5,
  low: 2,
};

const impactRank = (i?: Impact) => (i === "high" ? 3 : i === "medium" ? 2 : 1);

function normalizeAbs(urlLike: string) {
  try {
    const u = new URL(urlLike);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return urlLike.startsWith("http") ? urlLike : `https://${urlLike}`;
  }
}
function backupShot(u: string) {
  const abs = normalizeAbs(u);
  return SCREENSHOT_URL_TMPL.replace("{URL}", encodeURIComponent(abs));
}

/** Pagaidu score, ja free atskaitē nav skaitļa */
function provisionalScore(r: FreeReport): number {
  const list: Suggestion[] = [
    ...(r.hero?.suggestions ?? []),
    ...(r.next_section?.suggestions ?? []),
  ];
  if (list.length === 0) return 60;
  let score = 84;
  for (const s of list) {
    if (s.impact === "high") score -= 4;
    else if (s.impact === "medium") score -= 2;
    else score -= 1;
  }
  return Math.max(20, Math.min(98, Math.round(score)));
}

/** Smart screenshot loaderis ar spinner + retry + cache-buster */
function useSmartScreenshot(primary?: string | null, pageUrl?: string) {
  const initial = primary || (pageUrl ? backupShot(pageUrl) : null);
  const [src, setSrc] = useState<string | null>(initial);
  const [loading, setLoading] = useState<boolean>(!!initial);
  const [tries, setTries] = useState(0);
  const MAX = 4;

  useEffect(() => {
    const next = primary || (pageUrl ? backupShot(pageUrl) : null);
    setSrc(next);
    setLoading(!!next);
    setTries(0);
  }, [primary, pageUrl]);

  const withCb = (u: string) =>
    u + (u.includes("?") ? "&" : "?") + "cb=" + Date.now();

  const onLoad: React.ReactEventHandler<HTMLImageElement> = (e) => {
    const img = e.currentTarget;
    if (
      (img.naturalWidth < 420 || img.naturalHeight < 260) &&
      tries < MAX &&
      src
    ) {
      setTries((t) => t + 1);
      setTimeout(() => setSrc(withCb(src)), 800);
    } else {
      setLoading(false);
    }
  };
  const onError = () => {
    if (tries < MAX && src) {
      setTries((t) => t + 1);
      setSrc(withCb(src));
    } else {
      setLoading(false);
    }
  };
  return { src, loading, onLoad, onError };
}

function worstFindings(free: FreeReport, max = 5): Suggestion[] {
  const all: Suggestion[] = [
    ...(free.hero?.suggestions ?? []),
    ...(free.next_section?.suggestions ?? []),
  ];
  return all
    .slice()
    .sort((a, b) => impactRank(b.impact) - impactRank(a.impact))
    .slice(0, Math.max(3, Math.min(max, all.length || 3)));
}

function sumLiftPercent(items: Suggestion[]): number {
  const total = items.reduce(
    (acc, s) => acc + impactWeight[s.impact ?? "low"],
    0
  );
  // capped pie 40% free testam
  return Math.min(40, total);
}

/* ========= MAIN ========= */
export default function Landing() {
  // form / flow
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState(15);
  const [report, setReport] = useState<CroReport | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [retryIn, setRetryIn] = useState<number | null>(null);

  // email gate
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  // counters (animated)
  const [cReports, setCReports] = useState(METRIC_REPORTS);
  const [cFulls, setCFulls] = useState(METRIC_FULLS);
  const [cDomains, setCDomains] = useState(METRIC_DOMAINS);

  const previewRef = useRef<HTMLDivElement | null>(null);

  // derived
  const free = report as FreeReport | null;
  const apiScore = (report as any)?.score as number | undefined;
  const computedScore = useMemo(() => {
    if (typeof apiScore === "number") return apiScore;
    if (free) return provisionalScore(free);
    return undefined;
  }, [apiScore, free]);

  const sections: SectionPresence | undefined = free?.sections_detected;
  const topWorst = useMemo(() => (free ? worstFindings(free, 5) : []), [free]);
  const quickWinsLift = useMemo(() => sumLiftPercent(topWorst), [topWorst]);

  const pageUrl = (free as any)?.page?.url || url || "";
  const apiShot = (free as any)?.assets?.screenshot_url as string | undefined;
  const {
    src: heroShot,
    loading: shotLoading,
    onLoad,
    onError,
  } = useSmartScreenshot(apiShot || null, pageUrl);

  // counters auto-increment (mazliet dzīves)
  useEffect(() => {
    const id = setInterval(() => {
      setCReports((v) => v + Math.floor(Math.random() * 3));
      setCFulls((v) => v + (Math.random() < 0.2 ? 1 : 0));
      setCDomains((v) => v + Math.floor(Math.random() * 2));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const startTimers = (durationMs: number) => {
    const start = Date.now();
    const etaTimer = setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((durationMs - (Date.now() - start)) / 1000)
      );
      setEta(left);
      if (left <= 0) clearInterval(etaTimer);
    }, 300);

    const tick = () => {
      const delta = Date.now() - start;
      const p = Math.min(100, Math.round((delta / durationMs) * 100));
      setProgress(p);
      if (p < 100 && phase === "loading") requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const runTest = () => {
    if (!url.trim()) return;
    setPhase("loading");
    setReport(null);
    setErrorMsg("");
    setRetryIn(null);
    setProgress(0);
    setEta(15);
    startTimers(15000);
    setTimeout(async () => {
      try {
        const r = await analyzeUrl(url, "free");
        setReport(r);
        setPhase("ready");
        setTimeout(
          () => previewRef.current?.scrollIntoView({ behavior: "smooth" }),
          120
        );
      } catch (e: any) {
        const msg = String(e?.message || "AI error");
        setErrorMsg(msg);
        setPhase("error");
        if (msg.includes("429")) {
          let t = 8;
          setRetryIn(t);
          const timer = setInterval(async () => {
            t -= 1;
            setRetryIn(t);
            if (t <= 0) {
              clearInterval(timer);
              setRetryIn(null);
              setPhase("loading");
              setProgress(0);
              startTimers(6000);
              try {
                const r2 = await analyzeUrl(url, "free");
                setReport(r2);
                setPhase("ready");
              } catch (e2: any) {
                setErrorMsg(String(e2?.message || "AI error"));
                setPhase("error");
              }
            }
          }, 1000);
        }
      }
    }, 250);
  };

  const submitRun = (e: React.FormEvent) => {
    e.preventDefault();
    if (phase !== "loading" && url.trim()) runTest();
  };

  const handleOrderFullAudit = () => {
    const dest = "/full?url=" + encodeURIComponent(url || "") + "&dev=1";
    window.location.href = dest;
  };
  const handleSeeSample = () => (window.location.href = "/full?sample=1");

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    setEmailSubmitted(false);
    if (!/.+@.+\..+/.test(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }
    if (!EMAIL_ENDPOINT_URL) {
      setEmailSubmitted(true);
      return;
    }
    try {
      const res = await fetch(EMAIL_ENDPOINT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          site: url || "",
          score: computedScore,
          subject: "Your Holbox AI Website Scorecard",
          message:
            "Requesting my free website scorecard (top weaknesses + quick fixes).",
        }),
      });
      if (!res.ok) throw new Error("Email endpoint error");
      setEmailSubmitted(true);
    } catch {
      setEmailError("Couldn't send email right now. Please try again.");
    }
  };

  /* ========= UI ========= */
  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-900">
      {/* Dev banner */}
      {(!PAYMENT_LINK_URL || !EMAIL_ENDPOINT_URL) && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 text-sm">
          <div className="mx-auto max-w-[2030px] px-4 py-2">
            Running in <b>Dev/Test Mode</b>. “Order Full Audit” opens the full
            report directly.
          </div>
        </div>
      )}

      {/* NAV */}
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 border-b hidden md:block">
        <div className="mx-auto max-w-[2030px] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[#006D77]" />
            <span className="font-semibold tracking-tight">Holbox AI</span>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#006D77] to-[#83C5BE]" />
        <div className="relative mx-auto max-w-[2030px] px-4 py-10 md:py-14 grid md:grid-cols-2 gap-8 md:gap-10 items-center">
          <div className="text-white">
            <h1 className="text-3xl md:text-5xl font-bold leading-tight">
              Get a Second Opinion on Your Website.
            </h1>
            <p className="mt-3 md:mt-4 text-base md:text-xl text-white/90">
              The AI tool that instantly grades your landing pages and gives you
              an action plan to hold your team accountable.
            </p>

            <form
              onSubmit={submitRun}
              className="mt-4 md:mt-6 flex w-full flex-col sm:flex-row gap-3"
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
                disabled={phase === "loading" || !url.trim()}
                className="rounded-xl px-5 py-3 bg-[#E76F51] hover:bg-[#d86147] text-white font-medium disabled:opacity-60"
              >
                {phase === "loading" ? "Running…" : "Run Free Test"}
              </button>
            </form>

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

          {/* hero dekoratīvais attēls (nemainām) */}
          <div className="hidden md:block">
            <div className="relative rounded-2xl border bg-white/90 p-3 shadow-xl overflow-hidden">
              <div className="pointer-events-none absolute -left-1/3 top-0 h-full w-1/2 rotate-12 bg-white/20 blur-2xl animate-glide" />
              <img
                src="/hero.png"
                alt="Holbox AI hero"
                className="w-full h-auto rounded-xl animate-float"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" />
            </div>
          </div>
        </div>
        <style>{`
          @keyframes float{0%{transform:translateY(0)}50%{transform:translateY(-6px)}100%{transform:translateY(0)}}
          .animate-float{animation:float 9s ease-in-out infinite}
          @keyframes glide{0%{transform:translateX(-40%) rotate(12deg);opacity:.0}30%{opacity:.35}60%{opacity:.2}100%{transform:translateX(140%) rotate(12deg);opacity:.0}}
          .animate-glide{animation:glide 7.5s ease-in-out infinite}
        `}</style>
      </section>

      {/* PREVIEW */}
      <section
        id="preview"
        ref={previewRef}
        className="mx-auto max-w-[2030px] px-3 md:px-4 py-8 md:py-10"
      >
        {phase === "idle" && (
          <div className="rounded-2xl border bg-white p-5 text-slate-600 text-sm text-center">
            Run a test to see your live preview here.
          </div>
        )}

        {phase === "loading" && (
          <div className="rounded-2xl border bg-white p-5">
            <div className="text-slate-700 font-medium">
              Analyzing your site…
            </div>
            <div className="mt-3 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-[#006D77] transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-slate-600">~{eta}s left</div>
          </div>
        )}

        {phase === "ready" && (
          <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
            {/* Summary */}
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
                    style={{ width: `${computedScore ?? 75}%` }}
                  />
                </div>
                <div className="mt-2 text-sm font-medium">
                  {computedScore ?? 75} / 100
                </div>
              </div>

              {/* Sections Present */}
              {sections && (
                <div className="mt-5 p-5 rounded-2xl border bg-white">
                  <div className="text-sm font-medium mb-2">
                    Sections Present
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
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

              {/* If you fix these… */}
              {topWorst.length > 0 && (
                <div className="mt-5 p-5 rounded-2xl border bg-white">
                  <div className="text-sm text-slate-500">
                    Potential lift (if all are done)
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-[#006D77]">
                    ≈ +{quickWinsLift}% leads
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Estimate based on issue severity. Real results may vary.
                  </p>
                </div>
              )}
            </div>

            {/* Hero overlay + worst findings */}
            <div className="lg:col-span-2 grid gap-4">
              <div className="p-3 rounded-2xl border bg-white">
                <div className="font-medium mb-1">Hero — Top Issues</div>
                <div className="relative rounded-xl overflow-hidden border bg-white h-[420px]">
                  {shotLoading && (
                    <div className="absolute inset-0 grid place-items-center bg-white/60 z-10">
                      <div className="h-8 w-8 border-2 border-slate-300 border-top-[#006D77] rounded-full animate-spin" />
                    </div>
                  )}
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <img
                    src={heroShot || backupShot(pageUrl) || undefined}
                    onLoad={onLoad}
                    onError={onError}
                    className={
                      shotLoading
                        ? "opacity-0 transition-opacity duration-300 w-full h-full object-cover"
                        : "opacity-100 transition-opacity duration-300 w-full h-full object-cover"
                    }
                    style={{ objectPosition: "top" }}
                  />
                  {topWorst.length > 0 && (
                    <div className="absolute right-2 bottom-2 bg-white/95 border rounded-lg p-3 text-xs max-w-[85%] shadow">
                      <div className="font-medium mb-1">Top suggestions</div>
                      <ul className="space-y-1">
                        {topWorst.slice(0, 3).map((s, i) => (
                          <li key={i}>
                            • [{s.impact}] <b>{s.title}</b> — {s.recommendation}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Worst 3–5 findings list */}
              {topWorst.length > 0 && (
                <div className="grid gap-3">
                  {topWorst.map((f, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl border bg-white flex items-start gap-3"
                    >
                      <span
                        className={`mt-1 h-2.5 w-2.5 rounded-full ${
                          f.impact === "high"
                            ? "bg-red-500"
                            : f.impact === "medium"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                      />
                      <div>
                        <div className="font-medium">{f.title}</div>
                        <div className="text-sm text-slate-600 mt-0.5">
                          {f.recommendation}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-2xl border bg-white p-5 text-slate-600 text-sm text-center">
            {errorMsg.includes("parse enough") ? (
              "We couldn’t parse enough content from that URL. Try another page."
            ) : (
              <>
                Something went wrong.{" "}
                {retryIn !== null
                  ? `Retrying in ${retryIn}s…`
                  : "Please try again."}
              </>
            )}
          </div>
        )}
      </section>

      {/* SCORECARD */}
      <section className="mx-auto max-w-[2030px] px-3 md:px-4 py-8 md:py-10">
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
            onSubmit={(e) => {
              e.preventDefault();
            }}
            className="flex w-full flex-col sm:flex-row gap-3"
          >
            <input
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-xl px-4 py-3 bg-slate-50 border outline-none focus:ring-2 focus:ring-[#83C5BE]"
            />
            <button
              onClick={handleEmailSubmit}
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
                  Check your inbox for the scorecard link.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* PRICING + BADGES */}
      <section
        id="pricing"
        className="mx-auto max-w-[2030px] px-3 md:px-4 py-8 md:py-10"
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
          <div className="grid gap-4">
            <div className="rounded-2xl border bg-slate-50 overflow-hidden">
              <img
                src="/report-1.png"
                alt="Report preview"
                className="w-full h-auto block"
              />
            </div>

            {/* Counters */}
            <div className="rounded-2xl border bg-white p-5 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-semibold">
                  {cReports.toLocaleString()}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Reports generated
                </div>
              </div>
              <div>
                <div className="text-2xl font-semibold">
                  {cFulls.toLocaleString()}
                </div>
                <div className="text-xs text-slate-600 mt-1">Full reports</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">
                  {cDomains.toLocaleString()}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Domains analyzed
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CASE STUDY */}
      <section className="mx-auto max-w-[2030px] px-3 md:px-4 py-8 md:py-10">
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
