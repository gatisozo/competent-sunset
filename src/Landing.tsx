// src/Landing.tsx
import React, { useMemo, useState } from "react";
import heroUrl from "/hero.png";
import { Tabs } from "./components/Tabs";
import { GradeBadge } from "./components/GradeBadge";
import { BlurPanel } from "./components/BlurPanel";
import { MetricTile } from "./components/MetricTile";
import { SmartShot } from "./components/SmartShot";
import {
  normalizeFreeReport,
  letterFromScore,
  topFindings,
  estimateUpliftPct,
  type FreeReportNormalized,
  type Finding,
  type BacklogItem,
} from "./lib/grading";

type Props = {
  freeReport?: any; // dati no /api/analyze (free)
  onRunTest?: (url: string) => void;
  onOrderFull?: () => void;
  onSeeSample?: () => void;
};

const TABS = [
  { id: "overall", label: "Overall" },
  { id: "sections", label: "Sections Present" },
  { id: "quickwins", label: "Quick Wins" },
  { id: "backlog", label: "Prioritized Backlog" },
  { id: "findings", label: "Findings" },
  { id: "content", label: "Content Audit" },
  { id: "copy", label: "Copy Suggestions" },
];

const DEFAULT_SECTIONS = [
  "hero",
  "value prop",
  "social proof",
  "features",
  "pricing",
  "faq",
  "contact",
  "footer",
];

export default function Landing({
  freeReport,
  onRunTest,
  onOrderFull,
  onSeeSample,
}: Props) {
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState<string>("overall");

  // Normalize incoming report (safe)
  const n: FreeReportNormalized | null = useMemo(() => {
    try {
      if (!freeReport) return null;
      return normalizeFreeReport(freeReport);
    } catch {
      return null;
    }
  }, [freeReport]);

  // Map uz jaunajiem laukiem no grading utilīša
  const structurePct = n?.structureScore ?? 76;
  const contentPct = n?.contentScore ?? 70;
  const score = n?.score ?? Math.round((structurePct + contentPct) / 2);
  const headlineLetter = letterFromScore(score);

  const uplift = n ? estimateUpliftPct(n.prioritized_backlog || []) : 18;
  const top: Finding[] = n ? topFindings(n.findings || [], 5) : [];

  // Sections present/missing no record -> masīvi
  const presentSections: string[] = useMemo(() => {
    if (!n) return [];
    return Object.entries(n.sections_present || {})
      .filter(([, v]) => !!v)
      .map(([k]) => k);
  }, [n]);

  const missingSections: string[] = useMemo(() => {
    if (!n) return DEFAULT_SECTIONS;
    const presentSet = new Set(presentSections.map((s) => s.toLowerCase()));
    return DEFAULT_SECTIONS.filter((s) => !presentSet.has(s.toLowerCase()));
  }, [n, presentSections]);

  const hasReport = !!n;

  const rawUrl: string =
    typeof freeReport?.url === "string" ? freeReport.url : "";

  function run() {
    if (!url.trim()) return;
    onRunTest?.(url.startsWith("http") ? url : `https://${url}`);
    // automātiski scroll uz rezultātiem
    setTimeout(() => {
      const el = document.getElementById("free-results");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-900">
      {/* NAV */}
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 border-b">
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
            onClick={run}
            className="rounded-xl px-4 py-2 text-white bg-[#005a62] hover:brightness-110"
          >
            Run Free Test
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#006D77] to-[#83C5BE]" />
        <div className="relative mx-auto max-w-[2030px] px-4 py-12 md:py-20 grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          <div className="text-white">
            <h1 className="text-3xl md:text-5xl font-bold leading-tight">
              Get a Second Opinion on Your Website.
            </h1>
            <p className="mt-3 md:mt-4 text-base md:text-xl text-white/90">
              The AI tool that instantly grades your landing pages and gives you
              an action plan to hold your team accountable.
            </p>
            <div className="mt-4 md:mt-6 flex flex-col sm:flex-row gap-3">
              <input
                aria-label="Enter your website URL"
                placeholder="Enter your website URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 rounded-xl px-4 py-3 bg-white/95 text-slate-900 placeholder-slate-500 outline-none focus:ring-2 focus:ring-[#83C5BE]"
              />
              <button
                onClick={run}
                className="rounded-xl px-5 py-3 bg-[#FFDDD2] text-slate-900 font-medium hover:opacity-90"
              >
                Run Free Test
              </button>
            </div>
            <div className="mt-3 md:mt-4 flex flex-wrap items-center gap-3 md:gap-4 text-white/80 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80" />
                No sign-up needed
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
          <div className="bg-white/90 rounded-2xl p-5 md:p-6 shadow-xl">
            <img
              src={heroUrl}
              className="w-full h-auto rounded-xl border"
              alt="Hero illustration"
            />
            <p className="mt-3 text-slate-700 text-sm">
              This panel will show the analysis progress animation (scanning →
              parsing → grading → preview).
            </p>
          </div>
        </div>
      </section>

      {/* FREE REPORT RESULTS */}
      <section
        id="free-results"
        className="mx-auto max-w-[2030px] px-4 py-10 md:py-16"
      >
        <h2 className="text-2xl md:text-3xl font-semibold">
          Your Website Summary
        </h2>
        <p className="mt-1 text-slate-600">
          AI-generated grade and top blockers.
        </p>

        <div className="mt-6 grid lg:grid-cols-3 gap-6 md:gap-8">
          <div className="lg:col-span-1 grid gap-6">
            <GradeBadge score={score} />

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">Sub-scores</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <ScorePill label="Structure" pct={structurePct} />
                <ScorePill label="Content" pct={contentPct} />
              </div>
              <div className="mt-3 text-sm text-slate-600">
                Grade: <b>{headlineLetter}</b>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">
                If you fix the top 5 issues
              </div>
              <div className="mt-2 text-lg font-semibold">
                ≈ +{uplift}% leads
              </div>
              <div className="text-xs text-slate-500">
                Estimate based on heuristics & past benchmarks.
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <Tabs tabs={TABS} value={tab} onChange={setTab} />
            <div className="rounded-b-2xl border border-t-0 bg-white p-4 md:p-6">
              {!hasReport && (
                <div className="text-sm text-slate-600">
                  Run a test to see your live preview here.
                </div>
              )}

              {hasReport && tab === "overall" && n && (
                <div className="grid md:grid-cols-2 gap-6">
                  <SmartShot url={rawUrl} className="min-h-[260px]" />
                  <div className="grid gap-3">
                    <div className="font-medium">Top Issues</div>
                    <ul className="space-y-3">
                      {top.length ? (
                        top.map((f: Finding, i: number) => (
                          <li key={i} className="rounded-xl border p-3">
                            <div className="flex items-center gap-2">
                              <SeverityDot level={f.impact || "medium"} />
                              <div className="font-medium">
                                {f.title || "Issue"}
                              </div>
                            </div>
                            {f.recommendation && (
                              <div className="mt-1 text-sm text-slate-600">
                                {f.recommendation}
                              </div>
                            )}
                          </li>
                        ))
                      ) : (
                        <li className="text-sm text-slate-600">
                          No issues detected in the preview.
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {hasReport && tab === "sections" && n && (
                <div className="grid md:grid-cols-2 gap-6">
                  <SectionList title="Present" items={presentSections} ok />
                  <SectionList title="Missing" items={missingSections} />
                </div>
              )}

              {hasReport && tab === "quickwins" && n && (
                <div className="grid gap-3">
                  {(n.quick_wins || []).length ? (
                    (n.quick_wins || []).map((w: string, i: number) => (
                      <div
                        key={i}
                        className="rounded-xl border p-3 flex items-center justify-between"
                      >
                        <div className="text-sm">{w}</div>
                        <div className="text-sm font-medium text-emerald-700">
                          ≈ +2% leads
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-600">
                      No quick wins detected.
                    </div>
                  )}
                  <div className="mt-2 text-sm text-emerald-700 font-medium">
                    All done: ≈ +{uplift}% leads
                  </div>
                </div>
              )}

              {hasReport && tab === "backlog" && n && (
                <div className="grid gap-3">
                  {(n.prioritized_backlog || []).length ? (
                    (n.prioritized_backlog || []).map(
                      (
                        b: BacklogItem & { note?: string; uplift_pct?: number },
                        i: number
                      ) => (
                        <div key={i} className="rounded-xl border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium">{b.title}</div>
                            <div className="flex gap-2 text-xs">
                              <Chip>{`Impact: ${b.impact || "high"}`}</Chip>
                              {typeof (b as any).effort_days === "number" && (
                                <Chip>{`Effort: ${
                                  (b as any).effort_days
                                }d`}</Chip>
                              )}
                              {typeof (b as any).uplift_pct === "number" && (
                                <Chip className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                  ≈ +{(b as any).uplift_pct}% leads
                                </Chip>
                              )}
                            </div>
                          </div>
                          {(b as any).note && (
                            <div className="mt-1 text-sm text-slate-600">
                              {(b as any).note}
                            </div>
                          )}
                        </div>
                      )
                    )
                  ) : (
                    <div className="text-sm text-slate-600">
                      No prioritized backlog yet.
                    </div>
                  )}
                </div>
              )}

              {hasReport && tab === "findings" && (
                <BlurPanel
                  title="Unlock all findings with annotated screenshots"
                  onOrder={() => onOrderFull?.()}
                  onSample={() => onSeeSample?.()}
                />
              )}

              {hasReport && tab === "content" && (
                <BlurPanel
                  title="See full Content Audit and quality scores per section"
                  onOrder={() => onOrderFull?.()}
                  onSample={() => onSeeSample?.()}
                />
              )}

              {hasReport && tab === "copy" && (
                <BlurPanel
                  title="Get rewritten headlines, subheads and CTAs tailored to your page"
                  onOrder={() => onOrderFull?.()}
                  onSample={() => onSeeSample?.()}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* BENEFITS (before / after, īss) */}
      <section className="mx-auto max-w-[2030px] px-4 py-12 md:py-16">
        <div className="rounded-3xl border bg-white p-5 md:p-10">
          <h3 className="text-2xl font-semibold">
            How Holbox AI Gave This Business Owner Confidence in Their Agency’s
            Work.
          </h3>
          <p className="mt-2 text-slate-600">
            Before: CTA hidden below the fold, slow load times. After: CTA above
            the fold, load time &lt; 2.0s.
          </p>
          <blockquote className="mt-4 rounded-xl border bg-slate-50 p-4 text-slate-700">
            “I used to worry if I was wasting money, but the Holbox AI report
            gave me a clear list of improvements to request. Now I know I’m
            getting a great return.”
          </blockquote>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-[2030px] px-4 py-12 md:py-16">
        <h3 className="text-2xl font-semibold mb-6">What You Get</h3>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            [
              "40+ UX/SEO/CRO checks",
              "Each audit scans layout, clarity and performance cues.",
            ],
            ["Annotated screenshots", "We mark exactly where & why to fix."],
            [
              "Prioritized To-Do list",
              "Impact vs Effort; hand straight to dev or freelancer.",
            ],
            ["Quick Wins", "3–5 changes you can do today."],
            ["Copy suggestions", "Stronger headlines and CTAs ready to adapt."],
            ["Benchmarks", "See position vs similar sites in your vertical."],
          ].map(([h, d], i: number) => (
            <div key={i} className="rounded-2xl border bg-white p-5">
              <div className="font-medium">{h}</div>
              <div className="mt-1 text-sm text-slate-600">{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* COUNTERS */}
      <section className="mx-auto max-w-[2030px] px-4 pb-12 md:pb-16">
        <div className="grid md:grid-cols-4 gap-4">
          <MetricTile label="Websites analyzed" value={1200} />
          <MetricTile label="Full reports delivered" value={600} />
          <MetricTile label="Median uplift (top 5 fixes)" value={18} />
          <MetricTile label="Audit checks run" value={10000} />
        </div>
      </section>

      {/* SCORECARD CTA */}
      <section className="mx-auto max-w-[2030px] px-4 pb-12 md:pb-16">
        <div className="rounded-3xl border bg-white p-5 md:p-10 grid md:grid-cols-2 gap-6 items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-semibold">
              Get a Free Scorecard for Your Website.
            </h3>
            <p className="mt-2 text-slate-600">
              Download a report with your website’s top 3 weaknesses and a few
              quick fixes. No credit card, no spam.
            </p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <input
              className="rounded-xl px-4 py-3 bg-slate-50 border outline-none focus:ring-2 focus:ring-[#83C5BE]"
              placeholder="Enter your email"
            />
            <button className="rounded-xl px-5 py-3 bg-[#006D77] text-white font-medium hover:brightness-110">
              Get My Free Scorecard
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* — helpers (iekšējie komponenti) jaa— */

function ScorePill({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-sm">{label}</div>
      <div className="mt-2 h-2 rounded bg-slate-200 overflow-hidden">
        <div
          className="h-full bg-[#006D77]"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-slate-600">{Math.round(pct)}%</div>
    </div>
  );
}

function SeverityDot({ level }: { level: "high" | "medium" | "low" }) {
  const c =
    level === "high"
      ? "bg-red-500"
      : level === "medium"
      ? "bg-amber-500"
      : "bg-emerald-500";
  return <span className={`h-2.5 w-2.5 rounded-full ${c}`} />;
}

function SectionList({
  title,
  items,
  ok,
}: {
  title: string;
  items: string[];
  ok?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="font-medium">{title}</div>
      <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
        {items.length ? (
          items.map((s: string, i: number) => (
            <li key={i} className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  ok ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {s}
            </li>
          ))
        ) : (
          <li className="text-slate-500">—</li>
        )}
      </ul>
    </div>
  );
}

function Chip({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`px-2 py-0.5 rounded border bg-slate-50 ${className}`}>
      {children}
    </span>
  );
}
 