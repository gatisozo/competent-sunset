// src/Landing.tsx
import React, { useRef, useState, useEffect, useMemo } from "react";
import GradeBadge from "./components/GradeBadge";
import Features from "./components/Features";
import Counters from "./components/Counters";
import ContactForm from "./components/ContactForm";

// reālās analīzes klients
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
  // optionally: headingsOutline?: Array<{ tag: string; text: string }>;
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

// --- helperi ieteicamo tekstu veidošanai ---
const clamp = (s: string, max: number) =>
  s.length > max ? s.slice(0, max - 1) + "…" : s;
function hostFromUrl(u?: string) {
  try {
    return u ? new URL(u).host : "";
  } catch {
    return "";
  }
}
function firstHeadingText(data: any): string | undefined {
  const ho: Array<{ tag: string; text: string }> =
    (data as any)?.headingsOutline ?? [];
  const h1 = ho.find((h) => h.tag?.toLowerCase() === "h1")?.text;
  return h1 || ho[0]?.text;
}
function suggestMeta(data: AnalyzeData): string {
  const base =
    firstHeadingText(data) || data.meta?.title || "Discover our product";
  const site = hostFromUrl(data.finalUrl || data.url);
  // vienkāršs, drošs ieteikums 140–160 rakstzīmēs
  let s = `${base} — ${site}. Explore features, pricing and FAQs. Get started in minutes.`;
  if (s.length < 140) s += " Fast, secure and user-friendly.";
  return clamp(s, 160);
}
function canonicalSuggestion(data: AnalyzeData): string {
  try {
    const u = new URL(data.finalUrl || data.url || "");
    u.hash = "";
    u.search = "";
    return u.toString();
  } catch {
    return "https://example.com/";
  }
}

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

  // ⬇️ “Overall” tabu NOŅEMAM → sākam ar “Sections Present”
  const [activeTab, setActiveTab] = useState<string>("Sections Present");

  const [lastTestedUrl, setLastTestedUrl] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  // reālie dati + skori (Grade panelim paliek)
  const [data, setData] = useState<AnalyzeData | null>(null);
  const [overallScore, setOverallScore] = useState<number>(73); // default vizuālam
  const [structurePct, setStructurePct] = useState<number>(76);
  const [contentPct, setContentPct] = useState<number>(70);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // score no reālajiem datiem (kā iepriekš)
  const computeScores = (d: AnalyzeData | null) => {
    if (!d) return { overall: 0, structure: 0, content: 0 };
    let score = 50;
    if (d.seo?.metaDescriptionPresent) score += 8;
    if (d.seo?.canonicalPresent) score += 6;
    if ((d.seo?.h1Count ?? 0) === 1) score += 6;
    if ((d.seo?.h2Count ?? 0) >= 2) score += 4;
    const ogCount = Object.values(d.social?.og ?? {}).filter(Boolean).length;
    const twCount = Object.values(d.social?.twitter ?? {}).filter(
      Boolean
    ).length;
    score += Math.min(ogCount + twCount, 6);
    const imgs = d.images?.total ?? 0;
    const miss = d.images?.missingAlt ?? 0;
    if (imgs > 0) {
      const altRatio = (imgs - miss) / imgs;
      score += Math.round(10 * altRatio);
    }
    const links = d.links?.total ?? 0;
    if (links >= 5) score += 4;
    if (d.robots?.robotsTxtOk) score += 3;
    if (d.robots?.sitemapOk) score += 3;

    let structure = 30;
    structure += Math.min(20, (d.seo?.h2Count ?? 0) * 4);
    structure += d.seo?.canonicalPresent ? 10 : 0;
    structure = Math.min(100, Math.max(0, structure));

    let content = 30;
    content += d.seo?.metaDescriptionPresent ? 15 : 0;
    content += Math.min(15, imgs > 0 ? 10 : 0);
    content += Math.min(
      10,
      imgs > 0 ? Math.round(10 * ((imgs - miss) / Math.max(1, imgs))) : 0
    );
    content = Math.min(100, Math.max(0, content));

    score = Math.min(100, Math.max(0, score));
    return { overall: score, structure, content };
  };

  // Heuristikas “Sections Present” (paliek kā bija)
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

    const metaTitle = (d.meta?.title || "").toLowerCase();
    const metaDesc = (d.meta?.description || "").toLowerCase();
    const metaText = `${metaTitle} ${metaDesc}`;

    const sections: { title: string; ok: boolean; why?: string }[] = [];
    const heroOk = (d.seo?.h1Count ?? 0) >= 1 || !!metaTitle;
    sections.push({
      title: "hero",
      ok: heroOk,
      why: heroOk ? "Found H1/meta title" : "No clear H1/title",
    });

    const socialOk = hHas(
      /testimonial|review|clients|trusted|partners|logos?/i
    );
    sections.push({
      title: "social proof",
      ok: !!socialOk,
      why: socialOk
        ? "Headings mention social proof"
        : "No testimonials/reviews headings",
    });

    const featuresOk = hHas(/feature|benefit|what you get|capabilit(y|ies)/i);
    sections.push({
      title: "features",
      ok: !!featuresOk,
      why: featuresOk ? "Headings mention features" : "No features headings",
    });

    const contactOk = hHas(/contact|get in touch|support|help/i);
    sections.push({
      title: "contact",
      ok: !!contactOk,
      why: contactOk ? "Found contact-related heading" : "No contact heading",
    });

    const valuePropOk =
      (d.meta?.description?.length ?? 0) >= 50 ||
      hHas(/we help|we (are|do)|our (product|solution)|why (choose|us)/i);
    sections.push({
      title: "value prop",
      ok: !!valuePropOk,
      why: valuePropOk
        ? "Meta/heading describes value"
        : "Weak value statement",
    });

    const pricingOk = hHas(/pricing|price|plans?/i);
    sections.push({
      title: "pricing",
      ok: !!pricingOk,
      why: pricingOk ? "Found pricing/plans heading" : "No pricing section",
    });

    const faqOk = hHas(/faq|frequently asked|questions/i);
    sections.push({
      title: "faq",
      ok: !!faqOk,
      why: faqOk ? "Found FAQ heading" : "No FAQ heading",
    });

    const footerOk =
      (d.links?.total ?? 0) >= 8 &&
      (hHas(/privacy|terms/i) ||
        metaText.includes("privacy") ||
        metaText.includes("terms"));
    sections.push({
      title: "footer",
      ok: !!footerOk,
      why: footerOk ? "Likely footer links" : "Footer not detected",
    });

    return sections;
  }, [data]);

  // Quick Wins: “Esošais vs Ieteicamais”
  const quickWinsRows = useMemo(() => {
    const rows: { field: string; current: string; suggested: string }[] = [];
    const d = data;

    // Meta description
    if (d) {
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
          current: clamp(desc, 200) + note,
          suggested: suggestMeta(d),
        });
      }
    }

    // ALT teksti
    const imgs = d?.images?.total ?? 0;
    const miss = d?.images?.missingAlt ?? 0;
    if (imgs > 0) {
      const ratio = Math.round((miss / Math.max(1, imgs)) * 100);
      rows.push({
        field: "Image ALT texts",
        current:
          miss > 0
            ? `Trūkst: ${miss}/${imgs} (~${ratio}%)`
            : "OK — ALT pārsvarā ir",
        suggested:
          'Pievienot īsus, aprakstošus ALT (piem., “Produkts – galvenā īpašība”). Dekoratīviem attēliem alt="".',
      });
    }

    // H1
    const h1c = d?.seo?.h1Count ?? 0;
    rows.push({
      field: "H1 virsraksti",
      current: `${h1c} uz lapu`,
      suggested: "Nodrošināt tieši 1 H1 ar galveno nolūku/atslēgvārdu.",
    });

    // Canonical
    const hasCanonical = !!d?.seo?.canonicalPresent || !!d?.meta?.canonical;
    rows.push({
      field: "Canonical",
      current: hasCanonical ? d!.meta!.canonical || "Ir" : "Nav",
      suggested: hasCanonical
        ? "Pārbaudīt vai norāda uz kanonisko bez parametriem"
        : `Pievienot <link rel="canonical" href="${canonicalSuggestion(d!)}">`,
    });

    // Robots/Sitemap
    rows.push({
      field: "robots.txt",
      current: d?.robots?.robotsTxtOk ? "OK" : "Nav/nesasniedzams",
      suggested: d?.robots?.robotsTxtOk
        ? "Pievienot arī sitemap norādi robots.txt failā"
        : "Publicēt /robots.txt ar piemērotiem noteikumiem",
    });
    rows.push({
      field: "sitemap.xml",
      current: d?.robots?.sitemapOk ? "OK" : "Nav/nesasniedzams",
      suggested: d?.robots?.sitemapOk
        ? "Sekot, lai sitemap atjaunojas automātiski"
        : "Publicēt /sitemap.xml un norādīt to robots.txt",
    });

    // Social tags
    const ogCount = Object.values(d?.social?.og ?? {}).filter(Boolean).length;
    const twCount = Object.values(d?.social?.twitter ?? {}).filter(
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
    const total = d?.links?.total ?? 0;
    const internal = d?.links?.internal ?? 0;
    rows.push({
      field: "Iekšējās saites",
      current: `Kopā ${total} · Iekšējās ${internal}`,
      suggested:
        "Vismaz 5+ iekšējās saites uz galvenajām lapām (produkts, cenas, kontakti, FAQ).",
    });

    return rows;
  }, [data]);

  // Backlog: “Esošais vs Ieteicamais” + prioritāte/effort
  const backlogRows = useMemo(() => {
    const rows: {
      task: string;
      current: string;
      suggested: string;
      priority: "low" | "med" | "high";
      effort: string;
    }[] = [];
    const d = data;

    // Secinājumi balstīti uz tiem pašiem Quick Wins + papildinājumi
    const h1c = d?.seo?.h1Count ?? 0;
    if (h1c !== 1) {
      rows.push({
        task: "H1 struktūra",
        current: `${h1c} H1 uz lapu`,
        suggested: "Iestatīt tieši 1 H1 ar skaidru vērtības piedāvājumu.",
        priority: "high",
        effort: "1–2h",
      });
    }

    if (
      !d?.seo?.metaDescriptionPresent ||
      (d.meta?.description &&
        (d.meta.description.length < 140 || d.meta.description.length > 160))
    ) {
      rows.push({
        task: "Meta description",
        current: d?.meta?.description ? clamp(d.meta.description, 200) : "Nav",
        suggested: suggestMeta(d!),
        priority: "med",
        effort: "1–2h",
      });
    }

    if (!d?.seo?.canonicalPresent) {
      rows.push({
        task: "Canonical",
        current: "Nav",
        suggested: canonicalSuggestion(d!),
        priority: "med",
        effort: "1h",
      });
    }

    const imgs = d?.images?.total ?? 0;
    const miss = d?.images?.missingAlt ?? 0;
    if (imgs > 0 && miss > 0) {
      rows.push({
        task: "ALT teksti",
        current: `Trūkst: ${miss}/${imgs}`,
        suggested:
          "Pievienot ALT visiem nedekoratīviem attēliem; īss, aprakstošs teksts.",
        priority: "med",
        effort: "2–4h",
      });
    }

    if (!d?.robots?.robotsTxtOk) {
      rows.push({
        task: "robots.txt",
        current: "Nav/nesasniedzams",
        suggested: "Publicēt /robots.txt un iekļaut sitemap norādi.",
        priority: "med",
        effort: "1h",
      });
    }
    if (!d?.robots?.sitemapOk) {
      rows.push({
        task: "sitemap.xml",
        current: "Nav/nesasniedzams",
        suggested:
          "Publicēt /sitemap.xml (dinamiski ģenerētu) un norādīt robots.txt.",
        priority: "med",
        effort: "1–2h",
      });
    }

    const ogCount = Object.values(d?.social?.og ?? {}).filter(Boolean).length;
    const twCount = Object.values(d?.social?.twitter ?? {}).filter(
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

    const total = d?.links?.total ?? 0;
    const internal = d?.links?.internal ?? 0;
    if (internal < 5) {
      rows.push({
        task: "Iekšējās saites",
        current: `Iekšējās ${internal} no ${total}`,
        suggested: "Pievienot 5–10 iekšējās saites uz galvenajām ceļa lapām.",
        priority: "med",
        effort: "2–4h",
      });
    }

    // papildus: ja nav Pricing/FAQ/Social proof sekcijas (no “Sections Present”)
    const secMap = Object.fromEntries(
      derivedSections.map((s) => [s.title, s.ok])
    );
    if (secMap["pricing"] === false) {
      rows.push({
        task: "Pricing/Plans sadaļa",
        current: "Nav atrasta",
        suggested: "Pievienot skaidru cenu plānu salīdzinājumu ar CTA.",
        priority: "med",
        effort: "1–2d",
      });
    }
    if (secMap["faq"] === false) {
      rows.push({
        task: "FAQ sadaļa",
        current: "Nav atrasta",
        suggested: "Pievienot 6–10 biežākos jautājumus ar īsām atbildēm.",
        priority: "med",
        effort: "0.5–1d",
      });
    }
    if (secMap["social proof"] === false) {
      rows.push({
        task: "Testimonials/Logos",
        current: "Nav atrasti",
        suggested: "Pievienot klientu atsauksmes vai logo rindu (min. 6).",
        priority: "high",
        effort: "1–2d",
      });
    }

    return rows;
  }, [data, derivedSections]);

  // progress animācija
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
  function startProgress() {
    setProgress(0);
    const tick = () => {
      setProgress((p) => {
        if (!loading) return p;
        const next = Math.min(90, p + Math.random() * 6 + 1);
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  // reāls tests
  const normalizeUrl = (u: string) =>
    u?.trim().startsWith("http") ? u.trim() : `https://${u?.trim()}`;
  const runTestReal = async () => {
    if (!url.trim()) return;
    const normalized = normalizeUrl(url);
    setLastTestedUrl(normalized);

    // reset
    setActiveTab("Sections Present"); // ⬅️ vairs ne “Overall”
    setShowResults(false);
    setLoading(true);
    setErr(null);
    setData(null);
    startProgress();

    if (onRunTest) {
      try {
        await Promise.resolve(onRunTest(normalized));
      } catch {}
    }

    const res = await runAnalyze(normalized);
    setLoading(false);

    if (res.ok) {
      const d = res.data as AnalyzeData;
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
      setErr(res.error || "Analyze failed");
      setProgress(0);
      setShowResults(false);
    }
  };
  const handleRun = () => {
    if (!url.trim()) return;
    runTestReal();
  };

  // DEV → Full report links
  const resolvedAuditUrl =
    lastTestedUrl || (url.trim() ? normalizeUrl(url) : "");
  const orderFullInternal = () => {
    const href = `/full?autostart=1${
      resolvedAuditUrl ? `&url=${encodeURIComponent(resolvedAuditUrl)}` : ""
    }${DEV_MODE ? "&dev=1" : ""}`;
    window.location.href = href;
  };
  const seeSampleInternal = () => {
    const href = `/full?dev=1${
      resolvedAuditUrl ? `&url=${encodeURIComponent(resolvedAuditUrl)}` : ""
    }`;
    window.location.href = href;
  };

  // UI helpers
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

  const niceUrl = useMemo(
    () => (data ? data.finalUrl || data.url || "" : ""),
    [data]
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
        {loading && !showResults ? (
          <div className="rounded-2xl border bg-white p-5">
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
              Progress: {progress}%
            </div>
          </div>
        ) : !showResults ? (
          <div className="rounded-2xl border bg-white p-5 text-slate-600 text-sm text-center">
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
                  <GradeBadge score={overallScore} size="lg" />
                </div>
                <div className="mt-4 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#006D77]"
                    style={{ width: `${safePct(overallScore)}%` }}
                  />
                </div>
                <div className="mt-3 text-slate-700">
                  <span className="text-xl font-semibold">
                    {safePct(overallScore)} / 100
                  </span>
                  <span className="ml-3 text-slate-500">Grade (auto)</span>
                </div>

                {/* īss kopsavilkums */}
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
                    <div className="rounded-xl border p-3">
                      <div className="font-medium mb-1">Links</div>
                      <div>
                        Total: {data.links?.total ?? 0} · Internal:{" "}
                        {data.links?.internal ?? 0} · External:{" "}
                        {data.links?.external ?? 0}
                      </div>
                    </div>
                    <div className="rounded-xl border p-3">
                      <div className="font-medium mb-1">Images</div>
                      <div>
                        Total: {data.images?.total ?? 0} · Missing ALT:{" "}
                        {data.images?.missingAlt ?? 0}
                      </div>
                    </div>
                    <div className="rounded-xl border p-3 md:col-span-2">
                      <div className="font-medium mb-1">Robots / Sitemap</div>
                      <div>
                        robots.txt:{" "}
                        {data.robots?.robotsTxtOk ? "OK" : "Not found"} ·
                        sitemap: {data.robots?.sitemapOk ? "OK" : "Not found"}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 md:col-span-2">
                      URL: {niceUrl} · HTTP: {data.httpStatus ?? "—"} · Lang:{" "}
                      {data.meta?.lang ?? "—"}
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
                <div className="mt-4 text-sm text-slate-600">
                  If you fix the top 5 issues we estimate ≈ <b>+18% leads</b>.
                </div>
              </div>
            </div>

            {/* ======= TABS ======= */}
            <div className="mt-6">
              <div className="flex gap-2 pl-2">
                {[
                  // "Overall", // ⬅️ NOŅEMTS
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
                {/* Sections Present (kā bija) */}
                {activeTab === "Sections Present" && (
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {(derivedSections.length
                      ? derivedSections
                      : [
                          { title: "hero", ok: true },
                          { title: "social proof", ok: false },
                          { title: "features", ok: false },
                          { title: "contact", ok: false },
                          { title: "value prop", ok: false },
                          { title: "pricing", ok: false },
                          { title: "faq", ok: false },
                          { title: "footer", ok: false },
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
                                current: "Nav atrasts",
                                suggested:
                                  "Pievienot ~150 rakstzīmju aprakstu ar vērtības solījumu.",
                              },
                              {
                                field: "Image ALT texts",
                                current: "Trūkst ALT vairākos attēlos",
                                suggested:
                                  "Pievienot ALT tekstus visiem nedekoratīviem attēliem.",
                              },
                              {
                                field: "Canonical",
                                current: "Nav",
                                suggested:
                                  'Pievienot <link rel="canonical"> uz kanonisko URL.',
                              },
                            ]
                        ).map((r, i) => (
                          <tr key={i}>
                            <td className="p-2 border align-top">{r.field}</td>
                            <td className="p-2 border align-top">
                              {r.current}
                            </td>
                            <td className="p-2 border align-top">
                              {r.suggested}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Prioritized Backlog → Esošais vs Ieteicamais + Prioritāte/Effort */}
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
                              {
                                task: "Sitemap",
                                current: "Nav",
                                suggested:
                                  "Publicēt /sitemap.xml un norādīt robots.txt",
                                priority: "med",
                                effort: "1–2h",
                              },
                              {
                                task: "ALT teksti",
                                current: "Trūkst daudzviet",
                                suggested: "Pievienot ALT visiem attēliem",
                                priority: "med",
                                effort: "2–4h",
                              },
                            ] as any)
                        ).map((r: any, i: number) => (
                          <tr key={i}>
                            <td className="p-2 border align-top">{r.task}</td>
                            <td className="p-2 border align-top">
                              {r.current}
                            </td>
                            <td className="p-2 border align-top">
                              {r.suggested}
                            </td>
                            <td className="p-2 border align-top">
                              <span
                                className={
                                  r.priority === "high"
                                    ? "text-rose-600"
                                    : r.priority === "med"
                                    ? "text-amber-600"
                                    : "text-emerald-600"
                                }
                              >
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

                {/* Pārējie tab paliek blur (netiek mainīti) */}
                {BLUR_TABS.has(activeTab) && (
                  <BlurPanel>
                    <div className="h-56 rounded-xl border bg-slate-50 grid place-items-center text-slate-400">
                      {activeTab}
                    </div>
                  </BlurPanel>
                )}
              </div>
            </div>

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

      {/* FULL REPORT */}
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { title: "100+ Checkpoints", icon: "🔎" },
                { title: "Potential +20% Lift", icon: "📈" },
                { title: "Report in 1–2 Minutes", icon: "⏱️" },
                { title: "Trusted by 10,000+ Audits", icon: "🛡️" },
              ].map((b, i) => (
                <div
                  key={i}
                  className="rounded-2xl border px-3 py-4 text-center"
                >
                  <div className="text-2xl md:text-3xl">{b.icon}</div>
                  <div className="mt-2 text-xs md:text-sm text-slate-700 leading-snug">
                    {b.title}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* COUNTERS */}
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
