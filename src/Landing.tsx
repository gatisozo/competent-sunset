// src/Landing.tsx
import React, { useRef, useState, useEffect, useMemo } from "react";
import GradeBadge from "./components/GradeBadge";
import Features from "./components/Features";
import Counters from "./components/Counters";
import ContactForm from "./components/ContactForm";
import { runAnalyze } from "./lib/analyzeClient";

type LandingProps = {
  freeReport?: any;
  onRunTest?: (url: string) => Promise<void> | void;
  onOrderFull?: () => void;
  onSeeSample?: () => void;
};

type AnalyzeData = {
  finalUrl?: string;
  url?: string;
  fetchedAt?: string;
  httpStatus?: number;
  meta?: {
    title?: string;
    description?: string;
    lang?: string;
    viewport?: string;
    canonical?: string;
  };
  seo?: {
    h1Count?: number;
    h2Count?: number;
    h3Count?: number;
    canonicalPresent?: boolean;
    metaDescriptionPresent?: boolean;
  };
  social?: {
    og?: Record<string, string | undefined>;
    twitter?: Record<string, string | undefined>;
  };
  links?: { total?: number; internal?: number; external?: number };
  images?: { total?: number; missingAlt?: number };
  robots?: {
    robotsTxtUrl?: string;
    robotsTxtOk?: boolean | null;
    sitemapUrlGuess?: string;
    sitemapOk?: boolean | null;
  };
  // headingsOutline?: Array<{ tag: string; text: string }>;
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
    (import.meta as any).env?.VITE_DEV_MODE) ||
  false;

function normalizeUrl(input: string): string {
  let s = (input ?? "").trim();
  if (!s) return s;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol)) throw new Error();
    u.hash = "";
    return u.toString();
  } catch {
    return s;
  }
}
function hostFromUrl(u?: string | null) {
  if (!u) return "";
  try {
    return new URL(u).host || "";
  } catch {
    return u.replace(/^https?:\/\//, "");
  }
}
function clamp(s: string, len = 160) {
  const t = (s || "").trim();
  if (t.length <= len) return t;
  return t.slice(0, len - 1) + "…";
}
function firstHeadingText(data?: AnalyzeData | null): string | undefined {
  if (!data) return undefined;
  const ho: Array<{ tag: string; text: string }> =
    (data as any)?.headingsOutline ?? [];
  const h1 = ho.find((h) => h.tag?.toLowerCase() === "h1")?.text;
  return h1 || ho[0]?.text || undefined;
}
function suggestMeta(data?: AnalyzeData | null): string {
  const base =
    firstHeadingText(data) || data?.meta?.title || "Discover our product";
  const site = hostFromUrl(data?.finalUrl || data?.url);
  let s = `${base} — ${site}. Explore features, pricing and FAQs. Get started in minutes.`;
  if (s.length < 140) s += " Fast, secure and user-friendly.";
  return clamp(s, 160);
}
function canonicalSuggestion(data?: AnalyzeData | null): string {
  try {
    const raw = data?.finalUrl || data?.url || "";
    const u = new URL(raw);
    u.hash = "";
    u.search = "";
    return u.toString();
  } catch {
    return "https://example.com/";
  }
}

export default function Landing({
  freeReport,
  onRunTest,
  onOrderFull,
  onSeeSample,
}: LandingProps) {
  const [url, setUrl] = useState("");
  const [data, setData] = useState<AnalyzeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [lastTestedUrl, setLastTestedUrl] = useState<string>("");

  const [overallScore, setOverallScore] = useState<number>(0);
  const [structurePct, setStructurePct] = useState<number>(0);
  const [contentPct, setContentPct] = useState<number>(0);

  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (DEV_MODE && typeof window !== "undefined") {
      const qs = new URLSearchParams(window.location.search);
      const u = qs.get("url");
      if (u) setUrl(u);
    }
  }, []);

  // ── scoring (rough) — null-safe ────────────────────────────────────────────
  const computeScores = (d: AnalyzeData) => {
    let score = 30;

    // structure part: headings, canonical
    let structure = 30;
    structure += Math.min(20, (d.seo?.h1Count ?? 0) * 10);
    structure += Math.min(20, (d.seo?.h2Count ?? 0) * 4);
    structure += d.seo?.canonicalPresent ? 10 : 0;
    structure = Math.min(100, Math.max(0, structure));

    let content = 30;
    content += d.seo?.metaDescriptionPresent ? 15 : 0;
    const imgs = d.images?.total ?? 0;
    const miss = d.images?.missingAlt ?? 0;
    content += Math.min(15, imgs > 0 ? 10 : 0);
    content += Math.min(
      10,
      imgs > 0 ? Math.round(10 * ((imgs - miss) / Math.max(1, imgs))) : 0
    );
    content = Math.min(100, Math.max(0, content));

    score = Math.min(100, Math.max(0, score));
    return { overall: score, structure, content };
  };

  // ── Sections Present (null-safe) ────────────────────────────────────────────
  const derivedSections = useMemo(() => {
    const d = data;
    if (!d) return [] as { title: string; ok: boolean; why?: string }[];

    const ho: Array<{ tag: string; text: string }> =
      (d as any).headingsOutline ?? [];
    const headingsText = ho.map((h) => h.text?.toLowerCase() || "").join(" | ");
    const hHas = (kw: string | RegExp) =>
      typeof kw === "string"
        ? headingsText.includes(kw.toLowerCase())
        : kw.test(headingsText);

    const sections: { title: string; ok: boolean; why?: string }[] = [];

    // hero
    const heroOk = (d.seo?.h1Count ?? 0) >= 1 || hHas(/book|try|start|get/i);
    sections.push({
      title: "hero",
      ok: !!heroOk,
      why: heroOk ? "H1 + CTA likely present" : "No clear H1/CTA detected",
    });

    // value prop
    const vOk = !!d.meta?.description && d.meta.description.length >= 120;
    sections.push({
      title: "value prop",
      ok: !!vOk,
      why: vOk
        ? "Meta description present"
        : "Meta description not found or too short",
    });

    // social proof
    const metaText = [
      d.meta?.title || "",
      d.meta?.description || "",
      headingsText || "",
    ]
      .join(" ")
      .toLowerCase();
    const socialOk = /testimonial|review|trust|clients|logos?/.test(metaText);
    sections.push({
      title: "social proof",
      ok: !!socialOk,
      why: socialOk ? "Mentions of testimonials/logos" : "Not detected",
    });

    // pricing
    const pricingOk = /price|pricing|plan|invest/i.test(metaText);
    sections.push({
      title: "pricing",
      ok: !!pricingOk,
      why: pricingOk ? "Pricing hints found" : "Pricing not detected",
    });

    // features
    const featuresOk = /feature|benefit|capabilit/i.test(metaText);
    sections.push({
      title: "features",
      ok: !!featuresOk,
      why: featuresOk ? "Feature-related text" : "No features detected",
    });

    // faq
    const faqOk = /faq|frequently asked|question/i.test(metaText);
    sections.push({
      title: "faq",
      ok: !!faqOk,
      why: faqOk ? "FAQ-related text" : "FAQ not detected",
    });

    // contact
    const contactOk = /contact|support|help|email|phone|reach/.test(metaText);
    sections.push({
      title: "contact",
      ok: !!contactOk,
      why: contactOk ? "Contact-related text" : "No obvious contact block",
    });

    // footer
    const footerOk =
      (d.links?.total ?? 0) >= 8 &&
      (metaText.includes("privacy") || metaText.includes("terms"));
    sections.push({
      title: "footer",
      ok: !!footerOk,
      why: footerOk ? "Likely footer links" : "Footer not detected",
    });

    return sections;
  }, [data]);

  // ── Quick Wins (Esošais vs Ieteicamais) — null-safe ────────────────────────
  const quickWinsRows = useMemo(() => {
    if (!data)
      return [] as { field: string; current: string; suggested: string }[];
    const d = data;
    const rows: { field: string; current: string; suggested: string }[] = [];

    // Meta description
    const desc = d.meta?.description;
    if (!desc) {
      rows.push({
        field: "Meta description",
        current: "Nav atrasts",
        suggested: suggestMeta(d),
      });
    } else {
      let note = "";
      if (desc.length < 140) note = " (par īsu — ieteicams ~150 rakstzīmes)";
      if (desc.length > 160) note = " (par garu — ≤160 rakstzīmes)";
      rows.push({
        field: "Meta description",
        current: desc,
        suggested: suggestMeta(d) + note,
      });
    }

    // ALT text
    const total = d.images?.total ?? 0;
    const missing = d.images?.missingAlt ?? 0;
    let altNote =
      missing > 0
        ? `Trūkst ALT pie ${missing} no ${total} attēliem`
        : "OK (nav trūkstošu ALT)";
    rows.push({
      field: "ALT text",
      current: total ? altNote : "Nav attēlu",
      suggested:
        "Īss, aprakstošs ALT teksts tikai nedekoratīviem attēliem; dekoratīviem — tukšs alt.",
    });

    // Canonical
    rows.push({
      field: "Canonical URL",
      current: d.meta?.canonical || "Nav",
      suggested: canonicalSuggestion(d),
    });

    // Social meta (OG/Twitter)
    const ogCount = Object.values(d.social?.og ?? {}).filter(Boolean).length;
    const twCount = Object.values(d.social?.twitter ?? {}).filter(
      Boolean
    ).length;
    rows.push({
      field: "Social meta (OG/Twitter)",
      current:
        ogCount + twCount > 0
          ? `Daļēji (${ogCount + twCount} lauki)`
          : "Trūkst",
      suggested:
        "Pievienot og:title, og:description, og:image, og:url, twitter:card u.c. kopīgošanas bagātinājumiem.",
    });

    // Internal links
    const total2 = d.links?.total ?? 0;
    const internal = d.links?.internal ?? 0;
    rows.push({
      field: "Iekšējās saites",
      current: `Kopā ${total2} · Iekšējās ${internal}`,
      suggested:
        "Vismaz 5+ iekšējās saites uz galvenajām lapām (produkts, cenas, kontakti, FAQ).",
    });

    return rows;
  }, [data]);

  // ── Backlog (Esošais vs Ieteicamais + priority/effort) — null-safe ─────────
  const backlogRows = useMemo(() => {
    if (!data)
      return [] as {
        task: string;
        current: string;
        suggested: string;
        priority: "high" | "med" | "low";
        effort: string;
      }[];

    const d = data;
    const rows: {
      task: string;
      current: string;
      suggested: string;
      priority: "high" | "med" | "low";
      effort: string;
    }[] = [];

    // Hero / H1
    const h1c = d.seo?.h1Count ?? 0;
    if (h1c !== 1) {
      rows.push({
        task: "Hero / H1",
        current: `H1 skaits: ${h1c}`,
        suggested:
          "Viena spēcīga H1 virsraksta un CTA kombinācija virs loka (above the fold).",
        priority: "high",
        effort: "1–2d",
      });
    }

    // Meta description
    const desc = d.meta?.description || "";
    if (!desc || desc.length < 140 || desc.length > 180) {
      rows.push({
        task: "Meta description",
        current: desc ? `${desc.length} rakstzīmes` : "Nav",
        suggested: "Pārrakstīt uz 145–160 rakstzīmēm ar ieguvumu + zīmolu.",
        priority: "low",
        effort: "1–2h",
      });
    }

    // ALT text
    const imgs = d.images?.total ?? 0;
    const miss = d.images?.missingAlt ?? 0;
    if (imgs > 0 && miss > 0) {
      rows.push({
        task: "ALT text",
        current: `Trūkst ${miss} no ${imgs}`,
        suggested:
          "Aizpildīt ALT tikai nedekoratīviem attēliem; dekoratīviem — tukšs alt.",
        priority: "low",
        effort: "2–4h",
      });
    }

    // OG/Twitter
    const ogCount = Object.values(d.social?.og ?? {}).filter(Boolean).length;
    const twCount = Object.values(d.social?.twitter ?? {}).filter(
      Boolean
    ).length;
    if (ogCount + twCount < 3) {
      rows.push({
        task: "Social meta",
        current:
          ogCount + twCount > 0 ? `Daļēji (${ogCount + twCount})` : "Trūkst",
        suggested: "og:title, og:description, og:image, og:url, twitter:card",
        priority: "low",
        effort: "1–2h",
      });
    }

    const total = d.links?.total ?? 0;
    const internal = d.links?.internal ?? 0;
    if (internal < 5) {
      rows.push({
        task: "Iekšējās saites",
        current: `Iekšējās ${internal} no ${total}`,
        suggested: "Pievienot 5–10 iekšējās saites uz galvenajām ceļa lapām.",
        priority: "med",
        effort: "2–4h",
      });
    }

    // papildus: ja trūkst noteiktas sadaļas
    const secMap = Object.fromEntries(
      derivedSections.map((s) => [s.title, s.ok] as const)
    ) as Record<string, boolean>;
    if (!secMap["faq"])
      rows.push({
        task: "FAQ",
        current: "Trūkst / vāja",
        suggested: "Sakārtot populārākos jautājumus; akordeona formāts.",
        priority: "med",
        effort: "0.5–1d",
      });
    if (!secMap["social proof"])
      rows.push({
        task: "Sociālie pierādījumi",
        current: "Nav / vāji",
        suggested:
          "2–3 īsas atsauksmes ar vārdu/uzvārdu/āmatu + logo josla, ja iespējams.",
        priority: "high",
        effort: "1–2d",
      });

    return rows;
  }, [data, derivedSections]);

  // ── quick % lifts (vienkāršots) ────────────────────────────────────────────
  const quickWinsLift = useMemo(() => {
    if (!data) return 0;
    let pct = 0;
    if (!data.meta?.description || data.meta.description.length < 140) pct += 4;
    if ((data.images?.missingAlt ?? 0) > 0) pct += 3;
    if (!data.seo?.canonicalPresent) pct += 1;
    if ((data.links?.internal ?? 0) < 5) pct += 3;
    return Math.min(15, pct || 9);
  }, [data]);

  // ── UI handlers ────────────────────────────────────────────────────────────
  const runTestReal = async () => {
    setErr(null);
    setLoading(true);
    setProgress(20);
    setShowResults(false);
    setData(null);

    const res = await runAnalyze(url.trim());

    if ((res as any).ok) {
      setProgress(75);
      const d = (res as any).data as AnalyzeData;
      setLastTestedUrl(d.finalUrl || d.url || url);
      setData(d);
      const sc = computeScores(d);
      setOverallScore(sc.overall);
      setStructurePct(sc.structure);
      setContentPct(sc.content);
      setProgress(100);
      setShowResults(true);
      setTimeout(() => {
        previewRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 120);
    } else {
      setErr((res as any).error || "Analyze failed");
      setProgress(0);
      setShowResults(false);
    }
  };
  const handleRun = () => {
    if (!url.trim()) return;
    runTestReal();
  };

  // ── Full report pārejas (nemainītas) ────────────────────────────────────────
  const resolvedAuditUrl =
    lastTestedUrl || (url.trim() ? normalizeUrl(url) : "");
  const orderFullInternal = () => {
    const href = `/full?autostart=1${
      resolvedAuditUrl ? `&url=${encodeURIComponent(resolvedAuditUrl)}` : ""
    }`;
    window.location.href = href;
  };
  const seeSampleInternal = () => {
    window.location.href =
      "/full?autostart=1&url=https%3A%2F%2Fskride.lv%2F&sample=1";
  };

  // ── UI (Landing) ───────────────────────────────────────────────────────────
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
      {/* top bar */}
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
        <div className="absolute inset-0 bg-gradient-to-b from-[#006D77] via-[#83C5BE] to-[#EDF6F9]" />
        <div className="relative mx-auto max-w-[1200px] grid md:grid-cols-2 gap-6 px-4 py-10 md:py-14 text-white">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-3 py-1 text-xs">
              Running in Draft/Test Mode; “Order Full Audit” opens the Full
              report directly.
            </div>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight mt-4">
              Get a Second Opinion <br /> on Your Website.
            </h1>
            <p className="mt-3 text-white/90">
              The AI tool that instantly grades your landing pages and gives you
              an action plan to hold your team accountable.
            </p>
            {/* input + buttons */}
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter your website URL"
                className="flex-1 rounded-xl px-4 py-3 text-slate-900 bg-white outline-none ring-0 focus:ring-2 focus:ring-white/60"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && url.trim()) handleRun();
                }}
              />
              <button
                onClick={handleRun}
                disabled={loading || !url.trim()}
                className="rounded-xl px-5 py-3 bg-white text-slate-900 font-medium hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Analyzing…" : "Run Free Test"}
              </button>
              <button
                onClick={onOrderFull ?? orderFullInternal}
                className="rounded-xl px-5 py-3 bg-[#FFDDD2] text-slate-900 font-medium hover:opacity-90"
              >
                Order Full Audit
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
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

      {/* PREVIEW / RESULTS */}
      <section
        id="preview"
        ref={previewRef}
        className="mx-auto max-w-[1200px] px-4 py-8"
      >
        {/* progress + error */}
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
          {/* left: meta/seo snapshot */}
          <div className="rounded-2xl border bg-white p-5 md:p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">
                Your quick snapshot
              </div>
              <GradeBadge value={safePct(overallScore)} />
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
            </div>

            {/* sub-scores */}
            <div className="mt-6 grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border bg-white p-5 md:p-6">
                <div className="text-sm font-medium text-slate-700">
                  Overall score
                </div>
                <div className="mt-3 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77]"
                    style={{ width: `${safePct(overallScore)}%` }}
                  />
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#006D77]" />
                    {safePct(overallScore)} / 100
                  </span>
                  <span className="ml-3 text-slate-500">Grade (auto)</span>
                </div>

                {data && (
                  <div className="mt-4 grid md:grid-cols-2 gap-3 text-sm text-slate-700">
                    <div className="rounded-xl border p-3">
                      <div className="font-medium mb-1">Meta</div>
                      <ul className="list-disc pl-5">
                        <li>
                          <b>Title:</b> {data.meta?.title ?? "—"}
                        </li>
                        <li>
                          <b>Description:</b>{" "}
                          {data.meta?.description
                            ? `${data.meta.description.slice(0, 160)}${
                                data.meta.description.length > 160 ? "…" : ""
                              }`
                            : "—"}
                        </li>
                        <li>
                          <b>Canonical:</b> {data.meta?.canonical ?? "—"}
                        </li>
                      </ul>
                    </div>
                    <div className="rounded-xl border p-3">
                      <div className="font-medium mb-1">Headings</div>
                      <div>
                        H1 / H2 / H3: {data.seo?.h1Count ?? 0} /{" "}
                        {data.seo?.h2Count ?? 0} / {data.seo?.h3Count ?? 0}
                      </div>
                    </div>
                  </div>
                )}
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
              </div>
            </div>
          </div>

          {/* right: tabs */}
          <div className="rounded-2xl border bg-white p-5 md:p-6">
            {/* tabs header */}
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

            {/* tabs body */}
            <div className="mt-4">
              {/* Sections Present */}
              {activeTab === "Sections Present" && (
                <div className="grid gap-2">
                  {(derivedSections.length
                    ? derivedSections
                    : [
                        { title: "hero", ok: true, why: "placeholder" },
                        { title: "value prop", ok: true },
                        { title: "social proof", ok: false },
                        { title: "pricing", ok: false },
                        { title: "features", ok: true },
                        { title: "faq", ok: false },
                        { title: "contact", ok: true },
                        { title: "footer", ok: true },
                      ]
                  ).map((s, i) => (
                    <div key={i} className="rounded-lg border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "h-2 w-2 rounded-full " +
                            (s.ok ? "bg-emerald-500" : "bg-rose-500")
                          }
                        />
                        <span className="text-sm font-medium">{s.title}</span>
                      </div>
                      {s.why && (
                        <div className="mt-1 text-xs text-slate-500">
                          {s.why}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Quick Wins → Esošais vs Ieteicamais */}
              {activeTab === "Quick Wins" && (
                <div className="overflow-x-auto">
                  <table className="w-full border text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="p-2 border text-left">Lauks</th>
                        <th className="p-2 border text-left">Esošais</th>
                        <th className="p-2 border text-left">Ieteicamais</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(quickWinsRows.length
                        ? quickWinsRows
                        : [
                            {
                              field: "Meta description",
                              current: "—",
                              suggested:
                                "145–160 rakstzīmes ar ieguvumu + zīmolu.",
                            },
                            {
                              field: "ALT text",
                              current: "—",
                              suggested:
                                "Īss, aprakstošs ALT nedekoratīviem attēliem.",
                            },
                          ]
                      ).map((r, i) => (
                        <tr key={i}>
                          <td className="p-2 border align-top">{r.field}</td>
                          <td className="p-2 border align-top">
                            <div className="whitespace-pre-wrap break-words">
                              {r.current || "—"}
                            </div>
                          </td>
                          <td className="p-2 border align-top">
                            <div className="whitespace-pre-wrap break-words">
                              {r.suggested || "—"}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Prioritized Backlog → Esošais vs Ieteicamais + Priority/Effort */}
              {activeTab === "Prioritized Backlog" && (
                <div className="overflow-x-auto">
                  <table className="w-full border text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="p-2 border text-left">Uzdevums</th>
                        <th className="p-2 border text-left">Esošais</th>
                        <th className="p-2 border text-left">Ieteicamais</th>
                        <th className="p-2 border text-left">Prioritāte</th>
                        <th className="p-2 border text-left">Effort</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(backlogRows.length
                        ? backlogRows
                        : ([
                            {
                              task: "Canonical",
                              current: "Nav",
                              suggested: "Pievienot kanonisko URL",
                              priority: "med",
                              effort: "1h",
                            },
                          ] as any[])
                      ).map((r: any, i: number) => (
                        <tr key={i}>
                          <td className="p-2 border align-top">{r.task}</td>
                          <td className="p-2 border align-top">
                            <div className="whitespace-pre-wrap break-words">
                              {r.current || "—"}
                            </div>
                          </td>
                          <td className="p-2 border align-top">
                            <div className="whitespace-pre-wrap break-words">
                              {r.suggested || "—"}
                            </div>
                          </td>
                          <td className="p-2 border align-top">
                            <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 capitalize">
                              {r.priority}
                            </span>
                          </td>
                          <td className="p-2 border align-top">{r.effort}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pārējie tab paliek blur */}
              {BLUR_TABS.has(activeTab) && (
                <BlurPanel>
                  <div className="h-56 rounded-xl border bg-slate-50 grid place-items-center text-slate-400">
                    {activeTab}
                  </div>
                </BlurPanel>
              )}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-3xl border bg-white p-5 md:p-8 grid md:grid-cols-[1fr,0.9fr] gap-6 items-center">
          <div>
            <h3 className="text-xl md:text-2xl font-semibold">
              Get a Free Scorecard for Your Website.
            </h3>
            <p className="mt-2 text-slate-600">
              Download a report with your website’s top 3 weaknesses and a 7-day
              action plan to fix them. Hand it directly to your team or
              freelancer.
            </p>
            <ul className="mt-4 text-sm text-slate-700 space-y-1">
              <li>• Instant snapshot of your page</li>
              <li>• Actionable tasks with priority and effort</li>
              <li>
                • Shareable link — send it to your{" "}
                <span className="underline">Slack</span> or{" "}
                <span className="underline">Trello</span> board, or hand
                directly to your team or freelancer.
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { title: "100+ Checkpoints", icon: "🔎" },
                { title: "Action Plan", icon: "🧭" },
                { title: "PDF + Link", icon: "🔗" },
                { title: "No Login", icon: "⚡" },
              ].map((x) => (
                <div
                  key={x.title}
                  className="rounded-xl border bg-white p-3 grid place-items-center gap-2"
                >
                  <div className="text-2xl">{x.icon}</div>
                  <div className="text-xs text-slate-600">{x.title}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="mx-auto max-w-[1200px] px-4 py-12">
        <Features />
      </section>

      {/* counters */}
      <section className="bg-white">
        <div className="mx-auto max-w-[1200px] px-4 py-10">
          <Counters />
        </div>
      </section>

      {/* contact */}
      <section id="contact" className="mx-auto max-w-[1200px] px-4 py-12">
        <ContactForm />
      </section>

      {/* footer */}
      <footer className="bg-white border-t">
        <div className="mx-auto max-w-[1200px] px-4 py-8 grid gap-4 text-sm text-slate-600">
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

/* ───────────────────────────── helpers: blur overlay ─────────────────────── */
function BlurPanel({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 backdrop-blur-sm bg-white/50 rounded-xl pointer-events-none" />
      <div className="relative">{children}</div>
      <div className="absolute inset-0 grid place-items-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-white border px-3 py-1 text-xs shadow">
          Unlock in Full Report
        </div>
      </div>
    </div>
  );
}
