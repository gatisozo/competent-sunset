// src/Landing.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import GradeBadge from "./components/GradeBadge";
import Features from "./components/Features";
import Counters from "./components/Counters";
import ContactForm from "./components/ContactForm";
import { runAnalyze } from "./lib/analyzeClient";

type AnalyzeData = {
  finalUrl?: string;
  url?: string;
  meta?: { title?: string; description?: string; canonical?: string };
  seo?: {
    h1Count?: number;
    h2Count?: number;
    h3Count?: number;
    canonicalPresent?: boolean;
    metaDescriptionPresent?: boolean;
  };
  images?: { total?: number; missingAlt?: number };
  links?: { total?: number; internal?: number; external?: number };
  robots?: { robotsTxtOk?: boolean | null; sitemapOk?: boolean | null };
  headingsOutline?: Array<{ tag: string; text: string }>;
};

const BLUR_TABS = new Set(["Findings", "Content Audit", "Copy Suggestions"]);

function normalizeUrl(input: string): string {
  let s = (input || "").trim();
  if (!s) return s;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    u.hash = "";
    return u.toString();
  } catch {
    return s;
  }
}

function safePct(n?: number) {
  if (typeof n === "number" && isFinite(n))
    return Math.max(0, Math.min(100, n));
  return 0;
}

export default function Landing() {
  const [url, setUrl] = useState("");
  const [data, setData] = useState<AnalyzeData | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState("");

  const [overall, setOverall] = useState(0);
  const [structure, setStructure] = useState(0);
  const [content, setContent] = useState(0);

  const previewRef = useRef<HTMLDivElement | null>(null);

  function computeScores(d: AnalyzeData) {
    // vienkāršots skaitītājs, kas atbilst pašreizējam vizuālajam blokam
    let overall = 30;
    let structure = 30;
    let content = 30;

    structure += Math.min(20, (d.seo?.h1Count ?? 0) * 10);
    structure += Math.min(20, (d.seo?.h2Count ?? 0) * 4);
    structure += d.seo?.canonicalPresent ? 10 : 0;

    content += d.seo?.metaDescriptionPresent ? 15 : 0;
    const imgs = d.images?.total ?? 0;
    const miss = d.images?.missingAlt ?? 0;
    if (imgs > 0) content += 10;
    if (imgs > 0)
      content += Math.round(10 * ((imgs - (miss || 0)) / Math.max(1, imgs)));

    return {
      overall: Math.max(0, Math.min(100, Math.round(overall))),
      structure: Math.max(0, Math.min(100, Math.round(structure))),
      content: Math.max(0, Math.min(100, Math.round(content))),
    };
  }

  const derivedSections = useMemo(() => {
    const d = data;
    if (!d) return [] as { title: string; ok: boolean; why?: string }[];
    const ho = d.headingsOutline || [];
    const text = [
      d.meta?.title || "",
      d.meta?.description || "",
      ...ho.map((h) => h.text || ""),
    ]
      .join(" ")
      .toLowerCase();

    const has = (re: RegExp) => re.test(text);

    return [
      {
        title: "hero",
        ok: (d.seo?.h1Count ?? 0) > 0,
        why: (d.seo?.h1Count ?? 0) > 0 ? "Found H1/meta title" : "No H1",
      },
      {
        title: "social proof",
        ok: has(/testimonial|review|trust|logo/),
        why: has(/testimonial|review|trust|logo/)
          ? "Headings mention social proof"
          : "Not detected",
      },
      {
        title: "features",
        ok: has(/feature|benefit|capabilit/),
        why: has(/feature|benefit|capabilit/)
          ? "Features mentions"
          : "No features headings",
      },
      {
        title: "contact",
        ok: has(/contact|support|email|phone/),
        why: has(/contact|support|email|phone/)
          ? "Contact hints"
          : "No contact heading",
      },
      {
        title: "value prop",
        ok: (d.meta?.description || "").length >= 120,
        why:
          (d.meta?.description || "").length >= 120
            ? "Meta description present"
            : "Weak value statement",
      },
      {
        title: "pricing",
        ok: has(/price|pricing|plan/),
        why: has(/price|pricing|plan/) ? "Pricing hints" : "No pricing section",
      },
      {
        title: "faq",
        ok: has(/faq|frequently asked|question/),
        why: has(/faq|frequently asked|question/)
          ? "FAQ mentions"
          : "No FAQ heading",
      },
      {
        title: "footer",
        ok: (d.links?.total ?? 0) > 10,
        why:
          (d.links?.total ?? 0) > 10
            ? "Footer links likely"
            : "Footer not detected",
      },
    ];
  }, [data]);

  async function onRun() {
    if (!url.trim()) return;
    setErr(null);
    setLoading(true);
    setProgress(20);
    setData(null);

    const res = await runAnalyze(url.trim());
    if (!res.ok) {
      setErr(res.error);
      setLoading(false);
      setProgress(0);
      return;
    }

    setProgress(70);
    const d = (res as any).data as AnalyzeData;
    setData(d);
    setLastUrl(d.finalUrl || d.url || url);

    const sc = computeScores(d);
    setOverall(sc.overall);
    setStructure(sc.structure);
    setContent(sc.content);

    setProgress(100);
    setLoading(false);

    setTimeout(() => {
      previewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }

  const orderFull = () => {
    const u = lastUrl || (url.trim() ? normalizeUrl(url) : "");
    const href = `/full?autostart=1${u ? `&url=${encodeURIComponent(u)}` : ""}`;
    window.location.href = href;
  };

  // UI — atbilstoši tavām kartēm un tabiem (kā ekrānšāviņā)
  const [activeTab, setActiveTab] = useState<
    | "Sections Present"
    | "Quick Wins"
    | "Prioritized Backlog"
    | "Findings"
    | "Content Audit"
    | "Copy Suggestions"
  >("Sections Present");

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-900">
      {/* Hero top (saīsināts — tavs dizains) */}
      <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/60 bg-white/80 border-b">
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
            onClick={onRun}
            disabled={loading || !url.trim()}
            className="rounded-xl px-4 py-2 text-white bg-[#006D77] hover:opacity-90 disabled:opacity-60"
          >
            Run Free Test
          </button>
        </div>
      </header>

      {/* HERO section ar ievadi */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#006D77] via-[#83C5BE] to-[#EDF6F9]" />
        <div className="relative mx-auto max-w-[1200px] grid md:grid-cols-2 gap-6 px-4 py-10 md:py-14 text-white">
          <div>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight mt-4">
              Your Website.
            </h1>
            <p className="mt-3 text-white/90">
              The AI tool that instantly grades your landing pages and gives you
              an action plan to hold your team accountable.
            </p>
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="menopauze.lv"
                className="flex-1 rounded-xl px-4 py-3 text-slate-900 bg-white outline-none ring-0 focus:ring-2 focus:ring-white/60"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && url.trim()) onRun();
                }}
              />
              <button
                onClick={onRun}
                disabled={loading || !url.trim()}
                className="rounded-xl px-5 py-3 bg-white text-slate-900 font-medium hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Analyzing…" : "Run Free Test"}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80" /> No sign-up
                needed
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

          <div className="bg-white/80 rounded-2xl p-6 shadow-xl">
            <div className="rounded-xl overflow-hidden border">
              <img
                src="/hero.png"
                alt=""
                className="w-full h-48 md:h-56 object-cover"
              />
            </div>
            <p className="mt-3 text-slate-700 text-sm">
              This panel shows the current state of the audit (placeholder →
              analyzing → complete).
            </p>
          </div>
        </div>
      </section>

      {/* PREVIEW / RESULTS */}
      <section
        id="preview"
        ref={previewRef}
        className="mx-auto max-w-[1200px] px-4 py-8"
      >
        {(loading || progress > 0) && (
          <div className="mb-4">
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-[#006D77] transition-[width] duration-200"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          </div>
        )}
        {err && (
          <div className="mb-4 rounded-lg border bg-rose-50 text-rose-800 px-3 py-2 text-sm">
            {err}
          </div>
        )}

        <div className="grid md:grid-cols-[1.1fr,0.9fr] gap-6">
          {/* kreisā kolonna */}
          <div className="rounded-2xl border bg-white p-5 md:p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">
                Your Website’s Grade
              </div>
              <GradeBadge score={safePct(overall)} />
            </div>

            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">URL</div>
                <div className="truncate">
                  {data?.finalUrl || data?.url || "—"}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="font-medium mb-1">Meta</div>
                <ul className="list-disc pl-5">
                  <li>
                    <b>Title:</b> {data?.meta?.title ?? "—"}
                  </li>
                  <li>
                    <b>Description:</b>{" "}
                    {data?.meta?.description
                      ? `${data.meta.description.slice(0, 160)}${
                          data.meta.description.length > 160 ? "…" : ""
                        }`
                      : "—"}
                  </li>
                  <li>
                    <b>Canonical:</b> {data?.meta?.canonical ?? "—"}
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border p-3">
                <div className="font-medium mb-1">Headings</div>
                <div>
                  H1 / H2 / H3: {data?.seo?.h1Count ?? 0} /{" "}
                  {data?.seo?.h2Count ?? 0} / {data?.seo?.h3Count ?? 0}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="font-medium mb-1">Images & Links</div>
                <div>
                  Images: {data?.images?.total ?? 0} • Missing ALT:{" "}
                  {data?.images?.missingAlt ?? 0}
                </div>
                <div>
                  Links: {data?.links?.total ?? 0} • Internal:{" "}
                  {data?.links?.internal ?? 0} • External:{" "}
                  {data?.links?.external ?? 0}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="font-medium mb-1">Robots / Sitemap</div>
                <div>
                  robots.txt: {data?.robots?.robotsTxtOk ? "OK" : "—"} •
                  sitemap: {data?.robots?.sitemapOk ? "OK" : "—"}
                </div>
              </div>
            </div>

            <div className="mt-6 grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border bg-white p-5 md:p-6">
                <div className="text-sm font-medium text-slate-700">
                  Overall score
                </div>
                <div className="mt-3 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77]"
                    style={{ width: `${safePct(overall)}%` }}
                  />
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {safePct(overall)} / 100
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
                        style={{ width: `${safePct(structure)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {safePct(structure)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-600">Content</div>
                    <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-[#006D77]"
                        style={{ width: `${safePct(content)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {safePct(content)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* labā kolonna — Tabs */}
          <div className="rounded-2xl border bg-white p-5 md:p-6">
            <div className="flex gap-2 flex-wrap">
              {[
                "Sections Present",
                "Quick Wins",
                "Prioritized Backlog",
                "Findings",
                "Content Audit",
                "Copy Suggestions",
              ].map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t as any)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${
                    activeTab === t ? "bg-slate-900 text-white" : "bg-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {activeTab === "Sections Present" && (
                <div className="grid md:grid-cols-2 gap-2">
                  {(derivedSections.length ? derivedSections : []).map(
                    (s, i) => (
                      <div key={i} className="rounded-lg border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              s.ok ? "bg-emerald-500" : "bg-rose-500"
                            }`}
                          />
                          <span className="text-sm font-medium">{s.title}</span>
                        </div>
                        {s.why && (
                          <div className="mt-1 text-xs text-slate-500">
                            {s.why}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}

              {activeTab === "Quick Wins" && (
                <div className="rounded-lg border p-3 text-slate-700">
                  <div className="text-sm text-slate-500 mb-2">
                    Top 3 fixes for a quick lift
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      Fix meta description to ~150 chars with benefit + brand.
                    </li>
                    <li>Add ALT text to non-decorative images.</li>
                    <li>Ensure canonical URL is present and correct.</li>
                  </ul>
                </div>
              )}

              {activeTab === "Prioritized Backlog" && (
                <div className="rounded-lg border p-3">
                  <div className="text-sm text-slate-500 mb-2">
                    High-impact tasks
                  </div>
                  <ul className="space-y-2">
                    <li className="rounded border px-3 py-2">
                      Revamp hero (strong H1 + CTA)
                    </li>
                    <li className="rounded border px-3 py-2">
                      Improve internal linking (5–10 links)
                    </li>
                    <li className="rounded border px-3 py-2">
                      Add/testimonial slider
                    </li>
                  </ul>
                </div>
              )}

              {BLUR_TABS.has(activeTab) && (
                <div className="relative">
                  <div className="absolute inset-0 backdrop-blur-sm bg-white/50 rounded-xl pointer-events-none" />
                  <div className="h-56 rounded-xl border bg-slate-50 grid place-items-center text-slate-400">
                    {activeTab}
                  </div>
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white border px-3 py-1 text-xs shadow">
                      Unlock in Full Report
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={orderFull}
                className="rounded-xl px-5 py-3 bg-[#FFDDD2] text-slate-900 font-medium hover:opacity-90"
              >
                Order Full Audit
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* atlikušie bloki – tie paši kā produkcijā */}
      <section id="features" className="mx-auto max-w-[1200px] px-4 py-12">
        <Features />
      </section>
      <section className="bg-white">
        <div className="mx-auto max-w-[1200px] px-4 py-10">
          <Counters />
        </div>
      </section>
      <section id="contact" className="mx-auto max-w-[1200px] px-4 py-12">
        <ContactForm />
      </section>
      <footer className="bg-white border-t">
        <div className="mx-auto max-w-[1200px] px-4 py-8 grid gap-4 text-sm text-slate-600">
          <div className="flex gap-6">
            <a href="#">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="#contact">Contact</a>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
          <div>© {new Date().getFullYear()}</div>
        </div>
      </footer>
    </div>
  );
}
