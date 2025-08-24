// src/Landing.tsx
import React, { useMemo, useRef, useState } from "react";
import GradeBadge from "./components/GradeBadge";
import Features from "./components/Features";
import Counters from "./components/Counters";
import ContactForm from "./components/ContactForm";

// GLUE: drošais /api/analyze klients (nesabrūk uz “not valid JSON”)
import { runAnalyze } from "./lib/analyzeClient";
// GLUE: poga, kas vienmēr atver /full ar pēdējo analizēto URL
import OrderFullAuditButton from "./components/OrderFullAuditButton";

/* ===== helpers (tie paši, kas jau bija, tikai šeit lokāli) ===== */
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

/* ===== minimālā datu forma, ko rāda Free report panelis ===== */
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
  /* ===== UI state (kā produkcijā) ===== */
  const [url, setUrl] = useState("");
  const [data, setData] = useState<AnalyzeData | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // šie skaitļi sākotnēji dod to pašu “sample” skatu kā tavā produkcijā
  const [overall, setOverall] = useState(73);
  const [structure, setStructure] = useState(60);
  const [content, setContent] = useState(43);

  const previewRef = useRef<HTMLDivElement | null>(null);

  /* ===== vienkāršs score kalkulators (paliek kā produkcijā) ===== */
  function computeScores(d: AnalyzeData) {
    let s = 30,
      str = 30,
      cont = 30;

    str += Math.min(20, (d.seo?.h1Count ?? 0) * 10);
    str += Math.min(20, (d.seo?.h2Count ?? 0) * 4);
    str += d.seo?.canonicalPresent ? 10 : 0;

    cont += d.seo?.metaDescriptionPresent ? 15 : 0;
    const imgs = d.images?.total ?? 0;
    const miss = d.images?.missingAlt ?? 0;
    if (imgs > 0) cont += 10;
    if (imgs > 0)
      cont += Math.round(10 * ((imgs - (miss || 0)) / Math.max(1, imgs)));

    s = Math.round((str * 0.55 + cont * 0.45) / 1);
    return { overall: clamp(s), structure: clamp(str), content: clamp(cont) };
  }

  /* ===== sekciju pārskats (kā “Sections Present”) ===== */
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
      { title: "hero", ok: (d.seo?.h1Count ?? 0) > 0 },
      { title: "social proof", ok: has(/testimonial|review|trust|logo/) },
      { title: "features", ok: has(/feature|benefit|capabilit/) },
      { title: "contact", ok: has(/contact|support|email|phone/) },
      { title: "value prop", ok: (d.meta?.description || "").length >= 120 },
      { title: "pricing", ok: has(/price|pricing|plan/) },
      { title: "faq", ok: has(/faq|frequently asked|question/) },
      { title: "footer", ok: (d.links?.total ?? 0) > 10 },
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

  const backlog = useMemo(
    () => [
      { title: "Re-write Hero Section Copy", lift: "+20% leads" },
      { title: "Integrate Testimonials", lift: "+10% leads" },
      { title: "Enhance FAQ Section", lift: "+10% leads" },
    ],
    []
  );

  const heroSrc = useMemo(() => {
    const u = data?.finalUrl || data?.url || url || "";
    return u ? buildScreenshotUrl(u) : undefined;
  }, [data, url]);

  /* ===== RUN FREE TEST (GLUE: runAnalyze no analyzeClient) ===== */
  async function onRun() {
    if (!url.trim()) return;
    setErr(null);
    setLoading(true);
    setProgress(25);
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

  /* ===== UI (saglabāts izkārtojums kā produkcijā) ===== */
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

        {/* augšējie 2 paneļi: Grade (pa kreisi) + Sub-scores (pa labi) */}
        <div className="grid md:grid-cols-[1.1fr,0.9fr] gap-6">
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

            {/* meta info apakšā (kā produkcijā) */}
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

        {/* “Overview” sajaukums – kreisā puse bilde, labajā 3 paneļi, kā produkcijas ekrānā */}
        <div className="mt-6 grid md:grid-cols-[1.1fr,0.9fr] gap-6">
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
                  Hero Section — Revise the hero copy to clearly state benefits,
                  and highlight a call-to-action.
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
                      { title: "hero", ok: true },
                      { title: "value prop", ok: true },
                      { title: "social proof", ok: false },
                      { title: "pricing", ok: false },
                      { title: "features", ok: true },
                      { title: "faq", ok: false },
                      { title: "contact", ok: true },
                      { title: "footer", ok: true },
                    ]
                ).map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        s.ok ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                    />
                    <span className="capitalize">{s.title}</span>
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
                {backlog.map((b, i) => (
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

        {/* CTA uz Full report (pāri visai – saglabājot tavu copy) */}
        <div className="mt-4 flex gap-3">
          {/* GLUE: šī poga atver /full ar pēdējo analizēto URL */}
          <OrderFullAuditButton className="rounded-xl px-5 py-3 bg-[#FFDDD2] text-slate-900 font-medium hover:opacity-90">
            Order Full Audit
          </OrderFullAuditButton>
          <button
            onClick={() =>
              window.open("/full?url=https%3A%2F%2Fexample.com", "_blank")
            }
            className="rounded-xl px-5 py-3 border bg-white"
          >
            See Sample Report
          </button>
        </div>
      </section>

      {/* Zemāk – tie paši bloki, kas jau bija produkcijā */}
      <section id="features" className="mx-auto max-w-[1200px] px-4 py-12">
        <Features />
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-[1200px] px-4 py-10">
          <Counters />
        </div>
      </section>

      {/* Testimonials / stats (ja tev bija) – atstāts ārpus šī faila */}

      <section id="faq" className="mx-auto max-w-[1200px] px-4 py-12">
        {/* ja tev bija savs FAQ – atstāj kā ir; te neko nepievienoju */}
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
