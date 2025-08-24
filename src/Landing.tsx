// src/Landing.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import GradeBadge from "./components/GradeBadge";
import Features from "./components/Features";
import Counters from "./components/Counters";
import ContactForm from "./components/ContactForm";
import { runAnalyze } from "./lib/analyzeClient";

/* ---------- helpers ---------- */
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
function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}
function letterFromScore(n: number) {
  if (n >= 90) return "A";
  if (n >= 80) return "B";
  if (n >= 70) return "C";
  if (n >= 60) return "D";
  return "E";
}
function buildScreenshotUrl(target: string) {
  const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  const tmpl =
    (import.meta as any).env?.VITE_SCREENSHOT_URL_TMPL ||
    (typeof process !== "undefined" &&
      (process as any).env?.VITE_SCREENSHOT_URL_TMPL);
  if (tmpl) return String(tmpl).replace("{URL}", encodeURIComponent(url));
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}

/* ---------- datu formas (minimālais kopums, ko rāda Free) ---------- */
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

export default function Landing() {
  /* state */
  const [url, setUrl] = useState("");
  const [data, setData] = useState<AnalyzeData | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState("");

  const [overall, setOverall] = useState(73); // sākuma sample vērtība (kā ekrānā)
  const [structure, setStructure] = useState(60);
  const [content, setContent] = useState(43);

  const previewRef = useRef<HTMLDivElement | null>(null);

  /* vienkāršots “score” kalkulators pietuvināts tavam vizuālajam */
  function computeScores(d: AnalyzeData) {
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

    overall = Math.round((structure * 0.55 + content * 0.45) / 1);
    overall = clamp(overall);

    return {
      overall: clamp(overall),
      structure: clamp(structure),
      content: clamp(content),
    };
  }

  /* atvasinām “Sections Present” no headingu un meta */
  const sectionsPresent = useMemo(() => {
    const d = data;
    if (!d) return [] as { title: string; ok: boolean }[];
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
      { title: "Hero", ok: (d.seo?.h1Count ?? 0) > 0 },
      { title: "Social Proof", ok: has(/testimonial|review|trust|logo/) },
      { title: "Features", ok: has(/feature|benefit|capabilit/) },
      { title: "Contact", ok: has(/contact|support|email|phone/) },
      { title: "Value Prop", ok: (d.meta?.description || "").length >= 120 },
      { title: "Pricing", ok: has(/price|pricing|plan/) },
      { title: "Faq", ok: has(/faq|frequently asked|question/) },
      { title: "Footer", ok: (d.links?.total ?? 0) > 10 },
    ];
  }, [data]);

  const quickWins = useMemo(() => {
    const wins: string[] = [];
    if (!data) return wins;
    if (!data.seo?.metaDescriptionPresent)
      wins.push("Fix meta description to ~150 chars with benefits.");
    const imgs = data.images?.total ?? 0;
    const miss = data.images?.missingAlt ?? 0;
    if (imgs && miss) wins.push("Add ALT text to images.");
    if (!data.seo?.canonicalPresent) wins.push("Add canonical URL.");
    if (wins.length === 0) wins.push("Tweak headings for clarity.");
    return wins.slice(0, 4);
  }, [data]);

  const prioritizedBacklog = useMemo(() => {
    const items = [
      { title: "Re-write Hero Section Copy", lift: "+20% leads" },
      { title: "Integrate Testimonials", lift: "+10% leads" },
      { title: "Enhance FAQ Section", lift: "+10% leads" },
    ];
    return items;
  }, []);

  /* Hero snapshot (Overview tab kreisā puse) */
  const heroSrc = useMemo(() => {
    const u = data?.finalUrl || data?.url || lastUrl || url || "";
    return u ? buildScreenshotUrl(u) : undefined;
  }, [data, lastUrl, url]);

  /* run */
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
    setLastUrl(d.finalUrl || d.url || normalizeUrl(url));

    const sc = computeScores(d);
    setOverall(sc.overall);
    setStructure(sc.structure);
    setContent(sc.content);

    setProgress(100);
    setLoading(false);

    requestAnimationFrame(() =>
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  const orderFull = () => {
    const u =
      data?.finalUrl ||
      data?.url ||
      lastUrl ||
      (url.trim() ? normalizeUrl(url) : "");
    const href = `/full?autostart=1${u ? `&url=${encodeURIComponent(u)}` : ""}`;
    window.location.href = href;
  };

  /* Tabs (kā tavā ekrānā) */
  type Tab =
    | "Overall"
    | "Sections Present"
    | "Quick Wins"
    | "Prioritized Backlog"
    | "Findings"
    | "Content Audit"
    | "Copy Suggestions";
  const [tab, setTab] = useState<Tab>("Overall");

  /* UI */
  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-900">
      {/* Header */}
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

      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-[#006D77] via-[#83C5BE] to-[#EDF6F9]" />
        <div className="relative mx-auto max-w-[1200px] grid md:grid-cols-2 gap-6 px-4 py-10 md:py-14 text-white">
          <div>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight mt-4">
              Get a Second Opinion on Your Website.
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
                onKeyDown={(e) => e.key === "Enter" && url.trim() && onRun()}
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

      {/* Preview / Results */}
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

        {/* augšējie 2 paneļi */}
        <div className="grid md:grid-cols-[1.1fr,0.9fr] gap-6">
          {/* kreisā: Grade */}
          <div className="rounded-2xl border bg-white p-5">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-700">
                  Your Website’s Grade
                </div>
                <div className="mt-3 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77]"
                    style={{ width: `${clamp(overall)}%` }}
                  />
                </div>
                <div className="mt-2 text-sm">
                  {clamp(overall)} / 100{" "}
                  <span className="text-slate-500">Grade (auto)</span>
                </div>
              </div>
              <div className="shrink-0">
                <GradeBadge score={clamp(overall)} />
              </div>
            </div>

            {/* meta info kastītes */}
            <div className="mt-4 grid md:grid-cols-2 gap-3 text-sm text-slate-700">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">Meta</div>
                <ul className="list-disc pl-5">
                  <li>
                    <b>Title:</b> {data?.meta?.title ?? "—"}
                  </li>
                  <li>
                    <b>Description:</b>{" "}
                    {data?.meta?.description
                      ? `${data.meta.description.slice(0, 160)}${
                          (data.meta.description || "").length > 160 ? "…" : ""
                        }`
                      : "—"}
                  </li>
                  <li>
                    <b>Canonical:</b> {data?.meta?.canonical ?? "—"}
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">Headings</div>
                <div>
                  H1 / H2 / H3: {data?.seo?.h1Count ?? 0} /{" "}
                  {data?.seo?.h2Count ?? 0} / {data?.seo?.h3Count ?? 0}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">Links</div>
                <div>
                  Total: {data?.links?.total ?? 0} • Internal:{" "}
                  {data?.links?.internal ?? 0} • External:{" "}
                  {data?.links?.external ?? 0}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">Images</div>
                <div>
                  Total: {data?.images?.total ?? 0} • Missing ALT:{" "}
                  {data?.images?.missingAlt ?? 0}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">Robots / Sitemap</div>
                <div>
                  robots.txt: {data?.robots?.robotsTxtOk ? "OK" : "—"} •
                  sitemap: {data?.robots?.sitemapOk ? "OK" : "—"}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">URL</div>
                <div className="truncate">
                  {data?.finalUrl || data?.url || "—"}
                </div>
              </div>
            </div>
          </div>

          {/* labā: Sub-scores */}
          <div className="rounded-2xl border bg-white p-5">
            <div className="text-sm font-medium text-slate-700">Sub-scores</div>
            <div className="mt-4 text-sm">
              <div>Structure</div>
              <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-[#99D6D0]"
                  style={{ width: `${clamp(structure)}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {clamp(structure)}%
              </div>
            </div>
            <div className="mt-5 text-sm">
              <div>Content</div>
              <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-[#006D77]"
                  style={{ width: `${clamp(content)}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {clamp(content)}%
              </div>
            </div>
            <div className="mt-5 text-xs text-slate-500">
              If you fix the top 3 issues we estimate ≈ <b>+18% leads</b>.
            </div>
          </div>
        </div>

        {/* Tabs + Overview saturs (kā ekrānā) */}
        <div className="mt-6">
          <div className="flex gap-2 flex-wrap">
            {[
              "Overall",
              "Sections Present",
              "Quick Wins",
              "Prioritized Backlog",
              "Findings",
              "Content Audit",
              "Copy Suggestions",
            ].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t as any)}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  tab === t ? "bg-slate-900 text-white" : "bg-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* OVERALL: kreisā — hero snapshot; labā — trīs paneļi */}
          {tab === "Overall" && (
            <div className="mt-4 grid md:grid-cols-[1.1fr,0.9fr] gap-6">
              <div className="rounded-2xl border bg-white p-5">
                <div className="text-sm text-slate-500">
                  Hero Snapshot (top of page)
                </div>
                <div className="text-xs text-slate-500">
                  Cropped to the first viewport for clarity. Suggestions overlay
                  shows the most impactful fixes.
                </div>
                <div className="mt-3 rounded-xl overflow-hidden border bg-white h-[420px]">
                  {heroSrc ? (
                    <img
                      src={heroSrc}
                      alt="Hero snapshot"
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-slate-400">
                      no image
                    </div>
                  )}
                </div>
                <div className="mt-2 text-[11px] text-slate-500">
                  * We show screenshots only for sections with issues. Currently
                  cropping to the hero area.
                </div>
                <div className="mt-3 rounded-lg border bg-white p-3 text-sm">
                  <div className="text-xs text-slate-500 mb-1">
                    Top hero suggestions
                  </div>
                  <ul className="list-disc pl-5 text-slate-700">
                    <li>
                      Hero Section — Revise the hero copy to clearly state
                      benefits, and highlight a call-to-action.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border bg-white p-5">
                  <div className="text-sm font-medium text-slate-700">
                    Sections Present
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    {(sectionsPresent.length
                      ? sectionsPresent
                      : [
                          { title: "Hero", ok: true },
                          { title: "Value Prop", ok: true },
                          { title: "Social Proof", ok: false },
                          { title: "Pricing", ok: false },
                          { title: "Features", ok: true },
                          { title: "Faq", ok: false },
                          { title: "Contact", ok: true },
                          { title: "Footer", ok: true },
                        ]
                    ).map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            s.ok ? "bg-emerald-500" : "bg-rose-500"
                          }`}
                        />
                        <span>{s.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border bg-white p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-slate-700">
                      Quick Wins
                    </div>
                    <div className="text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5">
                      ≈ +9% leads (if all done)
                    </div>
                  </div>
                  <ul className="mt-3 list-disc pl-5 text-sm text-slate-700">
                    {(quickWins.length
                      ? quickWins
                      : [
                          "Improve call-to-action buttons to make them more visible.",
                          "Include testimonials in the hero section for immediate social proof.",
                        ]
                    ).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border bg-white p-5">
                  <div className="text-sm font-medium text-slate-700">
                    Prioritized Backlog
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {prioritizedBacklog.map((b, i) => (
                      <div
                        key={i}
                        className="rounded-lg border px-3 py-2 flex items-center justify-between"
                      >
                        <div>{b.title}</div>
                        <div className="text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5">
                          {b.lift}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* pārējie tabu satura vietturis (viens-pret-vienu nosaukumi) */}
          {tab === "Sections Present" && (
            <div className="mt-4 grid md:grid-cols-2 gap-2">
              {(sectionsPresent.length ? sectionsPresent : []).map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border px-3 py-2 flex items-center gap-2"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      s.ok ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  <span>{s.title}</span>
                </div>
              ))}
            </div>
          )}

          {tab === "Quick Wins" && (
            <div className="mt-4 rounded-2xl border bg-white p-5">
              <ul className="list-disc pl-5 space-y-1 text-slate-700">
                {quickWins.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {tab === "Prioritized Backlog" && (
            <div className="mt-4 rounded-2xl border bg-white p-5">
              <div className="space-y-2">
                {prioritizedBacklog.map((b, i) => (
                  <div
                    key={i}
                    className="rounded-lg border px-3 py-2 flex items-center justify-between"
                  >
                    <div>{b.title}</div>
                    <div className="text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5">
                      {b.lift}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* pārējie tabu — tikai “lock” priekškars, kā tavā lapā */}
          {["Findings", "Content Audit", "Copy Suggestions"].includes(tab) && (
            <div className="relative mt-4">
              <div className="h-56 rounded-2xl border bg-slate-50" />
              <div className="absolute inset-0 backdrop-blur-sm bg-white/50 rounded-2xl grid place-items-center">
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
          <button
            onClick={() => alert("Sample report open")}
            className="rounded-xl px-5 py-3 border bg-white"
          >
            See Sample Report
          </button>
        </div>
      </section>

      {/* zemāk — kā tavā lapā */}
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
