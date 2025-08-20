import React, { useEffect, useMemo, useState } from "react";
import {
  type FullReport as ApiFullReport,
  type Suggestion,
  type ContentAuditItem,
  type BacklogItem,
} from "../lib/analyze";

/* ---------------- utils ---------------- */
function getQS(name: string): string | null {
  if (typeof window === "undefined") return null;
  const m = new URLSearchParams(window.location.search).get(name);
  return m ? decodeURIComponent(m) : null;
}
function clsx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
function animateNumber(
  setter: (n: number) => void,
  from: number,
  to: number,
  ms = 900
) {
  const start = performance.now(),
    delta = to - from;
  const tick = (now: number) => {
    const t = clamp((now - start) / ms, 0, 1);
    const eased = easeOutCubic(t);
    setter(from + delta * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------------- hero image crop ---------------- */
const heroCropWrap = "rounded-xl overflow-hidden border bg-white h-[520px]";
const heroCropImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "top",
};

/* ---------------- heuristics & lifts ---------------- */
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
function auditStatus(
  c: ContentAuditItem | undefined
): "ok" | "weak" | "missing" {
  if (!c) return "ok";
  if (c.present === false) return "missing";
  if (c.quality === "poor") return "weak";
  return "ok";
}
function computeScore(
  findings: Suggestion[] = [],
  audit: ContentAuditItem[] = []
) {
  let score = 100;
  for (const f of findings)
    score -= f.impact === "high" ? 10 : f.impact === "medium" ? 5 : 2;
  for (const c of audit) {
    const st = auditStatus(c);
    score -= st === "missing" ? 5 : st === "weak" ? 2 : 0;
  }
  return clamp(Math.round(score), 0, 100);
}
function scoreBarColor(n: number) {
  if (n >= 80) return "bg-emerald-500";
  if (n >= 60) return "bg-amber-500";
  return "bg-rose-500";
}

/* ---------------- screenshots ---------------- */
function buildScreenshotUrl(target: string) {
  const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  const tmpl =
    (import.meta as any).env?.VITE_SCREENSHOT_URL_TMPL ||
    (typeof process !== "undefined" &&
      (process as any).env?.SCREENSHOT_URL_TMPL);
  if (tmpl) return String(tmpl).replace("{URL}", encodeURIComponent(url));
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}
function withCacheBuster(u: string) {
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}cb=${Date.now()}`;
}
function useSmartImage(
  primary?: string | null,
  backup?: string | null
): {
  src?: string;
  loading: boolean;
  onLoad: () => void;
  onError: () => void;
} {
  const [src, setSrc] = useState<string | undefined>(
    primary || backup || undefined
  );
  const [loading, setLoading] = useState<boolean>(!!src);
  const [retries, setRetries] = useState(0);
  const MAX_RETRIES = 4;

  useEffect(() => {
    setSrc(primary || backup || undefined);
    setLoading(!!(primary || backup));
    setRetries(0);
  }, [primary, backup]);

  const onLoad = () => setLoading(false);
  const onError = () => {
    if (backup && src !== backup) {
      setSrc(withCacheBuster(backup));
      setLoading(true);
      return;
    }
    if (src && retries < MAX_RETRIES) {
      setSrc(withCacheBuster(src));
      setRetries((r) => r + 1);
    } else {
      setLoading(false);
    }
  };
  return { src, loading, onLoad, onError };
}

/* ---------------- augmentation: enrich report client-side ---------------- */
type SectionsDetected = Record<
  | "hero"
  | "value_prop"
  | "social_proof"
  | "pricing"
  | "features"
  | "faq"
  | "contact"
  | "footer",
  boolean
>;

function deriveSectionsDetected(r: any): SectionsDetected {
  const s: SectionsDetected = {
    hero: !!r?.sections_detected?.hero || (r?.seo?.h1Count ?? 0) > 0,
    value_prop:
      !!r?.sections_detected?.value_prop ||
      !!(r?.meta?.description && r.meta.description.length > 40),
    social_proof:
      !!r?.sections_detected?.social_proof ||
      /testimonial|review|trust|clients|logos?/i.test(
        (r?.text_snippets || "").toLowerCase()
      ),
    pricing:
      !!r?.sections_detected?.pricing ||
      /price|pricing|plans?/i.test((r?.text_snippets || "").toLowerCase()),
    features:
      !!r?.sections_detected?.features ||
      /feature|benefit|capabilit(y|ies)/i.test(
        (r?.text_snippets || "").toLowerCase()
      ),
    faq:
      !!r?.sections_detected?.faq ||
      /faq|frequently asked|questions/i.test(
        (r?.text_snippets || "").toLowerCase()
      ),
    contact:
      !!r?.sections_detected?.contact ||
      /contact|get in touch|support|help/i.test(
        (r?.text_snippets || "").toLowerCase()
      ),
    footer:
      !!r?.sections_detected?.footer ||
      (r?.links?.total ?? 0) >= 8 ||
      /privacy|terms/i.test((r?.text_snippets || "").toLowerCase()),
  };
  return s;
}

function deriveContentAudit(r: any): ContentAuditItem[] {
  const s = deriveSectionsDetected(r);
  const mdLen = r?.meta?.description ? r.meta.description.length : 0;
  const imgs = r?.images?.total ?? 0;
  const missAlt = r?.images?.missingAlt ?? 0;

  const list: ContentAuditItem[] = [
    {
      section: "Hero",
      present: s.hero,
      // FIX: nekad neatgriezt boolean; vienmēr "good" | "poor"
      quality: s.hero
        ? (r?.seo?.h1Count ?? 0) === 1
          ? "good"
          : "poor"
        : "poor",
      suggestion:
        s.hero && (r?.seo?.h1Count ?? 0) === 1
          ? undefined
          : "Add a single clear H1 with the value proposition and a primary CTA.",
    },
    {
      section: "Value Prop",
      present: s.value_prop,
      quality: s.value_prop && mdLen >= 120 && mdLen <= 180 ? "good" : "poor",
      suggestion: s.value_prop
        ? "Refine the meta description to ~150 chars with a clear benefit."
        : "Add a clear value statement in the hero/meta description.",
    },
    {
      section: "Social Proof",
      present: s.social_proof,
      quality: s.social_proof ? "good" : "poor",
      suggestion: s.social_proof
        ? undefined
        : "Include testimonials or client logos.",
    },
    {
      section: "Pricing",
      present: s.pricing,
      quality: s.pricing ? "good" : "poor",
      suggestion: s.pricing
        ? undefined
        : "Display pricing or ‘Request pricing’ CTA.",
    },
    {
      section: "Features",
      present: s.features,
      quality: s.features ? "good" : "poor",
      suggestion: s.features
        ? undefined
        : "Outline 4–6 key features in bullets.",
    },
    {
      section: "Faq",
      present: s.faq,
      quality: s.faq ? "poor" : "poor",
      suggestion: s.faq
        ? "Use collapsible FAQ for quick scanning."
        : "Add a FAQ section.",
    },
    {
      section: "Contact",
      present: s.contact,
      quality: s.contact ? "good" : "poor",
      suggestion: s.contact
        ? undefined
        : "Add a visible contact CTA/form in header/footer.",
    },
    {
      section: "Footer",
      present: s.footer,
      quality: s.footer ? "good" : "poor",
      suggestion: s.footer
        ? undefined
        : "Include links to privacy, terms, social profiles.",
    },
  ];

  if (imgs > 0 && missAlt > 0) {
    list.push({
      section: "Images",
      present: true,
      quality: "poor",
      suggestion: "Add ALT text to non-decorative images.",
    });
  }

  return list;
}

function deriveFindings(r: any): Suggestion[] {
  const f: Suggestion[] = Array.isArray(r?.findings) ? r.findings.slice(0) : [];
  const s = deriveSectionsDetected(r);

  if (!s.social_proof && !f.some((x) => /social proof/i.test(x.title))) {
    f.push({
      title: "Insufficient Social Proof",
      impact: "medium",
      recommendation:
        "Add testimonials, case-studies, or client logos to build trust.",
    });
  }
  if (
    (r?.seo?.h1Count ?? 0) !== 1 &&
    !f.some((x) => /hero|headline/i.test(x.title))
  ) {
    f.push({
      title: "Hero Section Needs Improvement",
      impact: "high",
      recommendation:
        "Use one strong H1, clear value proposition, and a primary CTA above the fold.",
    });
  }
  if (
    !r?.meta?.description &&
    !f.some((x) => /meta description/i.test(x.title))
  ) {
    f.push({
      title: "Missing Meta Description",
      impact: "low",
      recommendation:
        "Add a ~150-char meta description including your key benefit and brand.",
    });
  }
  return f.slice(0, 8);
}

function pctAltLift(r: any) {
  const total = r?.images?.total ?? 0;
  const miss = r?.images?.missingAlt ?? 0;
  if (!total) return 0;
  return Math.min(3, Math.round((miss / total) * 3)); // līdz 3%
}

function deriveQuickWins(r: any): string[] {
  const wins: string[] = Array.isArray(r?.quick_wins)
    ? r.quick_wins.slice(0)
    : [];
  const h1c = r?.seo?.h1Count ?? 0;
  const md = r?.meta?.description as string | undefined;
  const hasCanon = !!(r?.seo?.canonicalPresent || r?.meta?.canonical);

  if (h1c !== 1)
    wins.push("Add a single clear H1 + primary CTA above the fold. (≈ +12%)");
  if (!md || md.length < 140 || md.length > 180)
    wins.push("Fix meta description to ~150 chars with benefits. (≈ +4%)");
  if (!hasCanon) wins.push("Add canonical URL to prevent duplicates. (≈ +1%)");

  const altLift = pctAltLift(r);
  if (altLift > 0) wins.push(`Add ALT text to images (≈ +${altLift}% leads).`);

  const internal = r?.links?.internal ?? 0;
  if (internal < 5) wins.push("Add 5–10 internal links to key pages. (≈ +3%)");

  const ogCount = Object.values(r?.social?.og ?? {}).filter(Boolean).length;
  const twCount = Object.values(r?.social?.twitter ?? {}).filter(
    Boolean
  ).length;
  if (ogCount + twCount < 3)
    wins.push("Add OpenGraph/Twitter meta for better sharing. (≈ +1–2%)");

  if (r?.robots && (!r.robots.robotsTxtOk || !r.robots.sitemapOk)) {
    if (!r.robots.robotsTxtOk)
      wins.push("Publish /robots.txt and include sitemap link. (≈ +1%)");
    if (!r.robots.sitemapOk)
      wins.push("Publish /sitemap.xml and reference it in robots.txt. (≈ +1%)");
  }

  return wins.slice(0, 10);
}

function deriveBacklog(r: any): BacklogItem[] {
  const items: BacklogItem[] = Array.isArray(r?.prioritized_backlog)
    ? (r.prioritized_backlog as BacklogItem[]).slice(0)
    : [];

  const push = (b: Partial<BacklogItem> & { title: string }) =>
    items.push(b as BacklogItem);

  const h1c = r?.seo?.h1Count ?? 0;
  if (!items.some((x) => /hero/i.test(String((x as any).title))) && h1c !== 1) {
    push({
      title: "Revamp the Hero Section",
      impact: 3,
      effort_days: 2,
      eta_days: 10,
      notes:
        "Strong value proposition, single H1, prominent CTA and benefit bullets.",
      lift_percent: 20,
    });
  }

  const s = deriveSectionsDetected(r);
  if (
    !s.social_proof &&
    !items.some((x) => /testimonial|social/i.test(String((x as any).title)))
  ) {
    push({
      title: "Implement a Testimonial Slider",
      impact: 2,
      effort_days: 3,
      eta_days: 7,
      notes:
        "Collect 6–10 short quotes with names/roles; add logo row if available.",
      lift_percent: 10,
    });
  }

  if (!s.faq && !items.some((x) => /faq/i.test(String((x as any).title)))) {
    push({
      title: "Optimize the FAQ Section",
      impact: 2,
      effort_days: 2,
      eta_days: 5,
      notes: "Collapsible groups; top 8–10 questions surfaced.",
      lift_percent: 10,
    });
  }

  const md = r?.meta?.description as string | undefined;
  if (
    (!md || md.length < 140 || md.length > 180) &&
    !items.some((x) => /meta description/i.test(String((x as any).title)))
  ) {
    push({
      title: "Re-write Meta Description",
      impact: 1,
      effort_days: 1,
      eta_days: 2,
      notes: "Aim for 145–160 chars with benefit + brand.",
      lift_percent: 4,
    });
  }

  const altLift = pctAltLift(r);
  if (
    altLift > 0 &&
    !items.some((x) => /alt/i.test(String((x as any).title)))
  ) {
    push({
      title: "Add ALT Text to Images",
      impact: 1,
      effort_days: 1,
      eta_days: 2,
      notes:
        "Short, descriptive ALT for non-decorative images; empty alt for decorative.",
      lift_percent: altLift,
    });
  }

  const hasCanon = !!(r?.seo?.canonicalPresent || r?.meta?.canonical);
  if (
    !hasCanon &&
    !items.some((x) => /canonical/i.test(String((x as any).title)))
  ) {
    push({
      title: "Add Canonical URL",
      impact: 1,
      effort_days: 0.5,
      eta_days: 1,
      notes: "Point to the canonical route without params.",
      lift_percent: 1,
    });
  }

  const internal = r?.links?.internal ?? 0;
  if (
    internal < 5 &&
    !items.some((x) => /internal link/i.test(String((x as any).title)))
  ) {
    push({
      title: "Strengthen Internal Linking",
      impact: 2,
      effort_days: 1,
      eta_days: 2,
      notes:
        "Add 5–10 links to product/pricing/contact/FAQ from relevant copy.",
      lift_percent: 3,
    });
  }

  const ogCount = Object.values(r?.social?.og ?? {}).filter(Boolean).length;
  const twCount = Object.values(r?.social?.twitter ?? {}).filter(
    Boolean
  ).length;
  if (
    ogCount + twCount < 3 &&
    !items.some((x) => /og|twitter|social meta/i.test(String((x as any).title)))
  ) {
    push({
      title: "Add Social Meta (OG/Twitter)",
      impact: 1,
      effort_days: 0.5,
      eta_days: 1,
      notes: "og:title/description/image/url + twitter:card for rich shares.",
      lift_percent: 1,
    });
  }

  if (r?.robots && (!r.robots.robotsTxtOk || !r.robots.sitemapOk)) {
    if (
      !r.robots.robotsTxtOk &&
      !items.some((x) => /robots\.txt/i.test(String((x as any).title)))
    ) {
      push({
        title: "Publish robots.txt",
        impact: 1,
        effort_days: 0.5,
        eta_days: 1,
        notes: "Allow crawling; include sitemap link.",
        lift_percent: 1,
      });
    }
    if (
      !r.robots.sitemapOk &&
      !items.some((x) => /sitemap/i.test(String((x as any).title)))
    ) {
      push({
        title: "Publish sitemap.xml",
        impact: 1,
        effort_days: 0.5,
        eta_days: 1,
        notes: "Autogenerate and keep up-to-date; link in robots.txt.",
        lift_percent: 1,
      });
    }
  }

  return items.slice(0, 12);
}

/* ---------------- main component ---------------- */
export default function FullReportView() {
  const autostart = getQS("autostart") === "1";
  const qUrl = getQS("url") || "";

  const [url, setUrl] = useState<string>(qUrl ? qUrl : "");
  const [raw, setRaw] = useState<ApiFullReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [score, setScore] = useState(0);

  // derive/enrich
  const report = useMemo(() => {
    const r: any = raw || {};
    r.sections_detected = deriveSectionsDetected(r);
    r.content_audit = deriveContentAudit(r);
    r.findings = deriveFindings(r);
    r.quick_wins = deriveQuickWins(r);
    r.prioritized_backlog = deriveBacklog(r);
    return r as ApiFullReport;
  }, [raw]);

  const heroPrimary = useMemo(
    () =>
      (report as any)?.screenshots?.hero ||
      (report as any)?.assets?.screenshot_url ||
      (url ? buildScreenshotUrl(url) : undefined),
    [report, url]
  );
  const heroImg = useSmartImage(heroPrimary || undefined, undefined);

  const topHeroSuggestions = useMemo(() => {
    const all = (report as any)?.findings || [];
    const heroOnes = all.filter((f: Suggestion) => isHeroFinding(f.title));
    return (heroOnes.length ? heroOnes : all).slice(0, 3);
  }, [report]);

  const quickWinsLiftPct = useMemo(() => {
    const wins: string[] = ((report as any)?.quick_wins || []) as string[];
    let total = 0;
    wins.forEach((w) => {
      const m = w.match(/\+\s?(\d+)\%/i);
      if (m) total += parseInt(m[1]!, 10);
    });
    return Math.min(30, total || 9);
  }, [report]);

  function startStream(u: string, mode: "full" | "free" = "full") {
    const target = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    setLoading(true);
    setProgress(0);
    setRaw(null);

    const src = `/api/analyze-stream?url=${encodeURIComponent(
      target
    )}&mode=${mode}&sid=${Date.now()}`;

    const es = new EventSource(src);

    es.addEventListener("progress", (e: any) => {
      try {
        const { value } = JSON.parse(e.data);
        setProgress(value ?? 0);
      } catch {}
    });

    es.addEventListener("result", (e: any) => {
      try {
        const data = JSON.parse(e.data) as ApiFullReport;
        setRaw(data);
        setProgress(100);

        const baseScore =
          typeof (data as any).score === "number"
            ? (data as any).score!
            : computeScore(
                (data as any).findings || [],
                (data as any).content_audit || []
              );
        animateNumber(setScore, 0, baseScore, 800);
      } catch (err: any) {
        console.error(err);
        alert("Invalid result format");
      } finally {
        es.close();
        setLoading(false);
      }
    });

    es.addEventListener("error", () => {
      es.close();
      setLoading(false);
      alert("Stream failed.");
    });
  }

  useEffect(() => {
    if (autostart && qUrl) startStream(qUrl, "full");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, qUrl]);

  return (
    <div className="mx-auto max-w-6xl px-3 md:px-4 py-8">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl md:text-3xl font-semibold">Full Report</h1>

        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-sm"
          >
            Download PDF
          </button>
          <button
            onClick={() => alert("Email sending is not configured yet.")}
            className="px-3 py-2 rounded-lg bg-[#006D77] text-white text-sm"
          >
            Email PDF
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim())
                startStream(url.trim(), "full");
            }}
            placeholder="yourdomain.com"
            className="flex-1 rounded-lg px-3 py-2 bg-white border outline-none focus:ring-2 focus:ring-[#83C5BE]"
          />
          <button
            disabled={loading || !url.trim()}
            onClick={() => startStream(url.trim(), "full")}
            className="rounded-lg px-4 py-2 bg-[#006D77] text-white disabled:opacity-60"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>

        {/* Streaming progress */}
        {loading && (
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-[#006D77] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Main grid */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Left: page + hero visual + findings */}
        <div className="md:col-span-2 space-y-4">
          {/* Page meta */}
          {(report as any)?.page && (
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-slate-500">URL</div>
              <div className="truncate">{(report as any).page.url}</div>
              {(report as any).page.title && (
                <>
                  <div className="mt-2 text-xs text-slate-500">Title</div>
                  <div className="">{(report as any).page.title}</div>
                </>
              )}
            </div>
          )}

          {/* Visual: hero snapshot (cropped) */}
          {heroPrimary && (
            <div className="rounded-xl border bg-white p-3">
              <div className="font-medium">Hero Snapshot (top of page)</div>
              <div className="text-sm text-slate-600">
                Cropped to the first viewport for clarity.
              </div>

              <div className={`${heroCropWrap} relative mt-2`}>
                {heroImg.loading && (
                  <div className="absolute inset-0 grid place-items-center bg-white/60">
                    <div className="h-8 w-8 border-2 border-slate-300 border-t-[#006D77] rounded-full animate-spin" />
                  </div>
                )}
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <img
                  src={heroImg.src || heroPrimary}
                  style={heroCropImg}
                  onLoad={heroImg.onLoad}
                  onError={heroImg.onError}
                  className={heroImg.loading ? "opacity-0" : "opacity-100"}
                />
                {Array.isArray((report as any)?.findings) &&
                  (report as any).findings.length > 0 && (
                    <div className="absolute right-2 bottom-2 bg-white/95 border rounded-lg p-3 text-xs max-w-[85%] shadow">
                      <div className="font-medium mb-1">
                        Top hero suggestions
                      </div>
                      <ul className="space-y-1">
                        {((report as any).findings as Suggestion[])
                          .filter((s) => isHeroFinding(s.title))
                          .slice(0, 3)
                          .map((s, i) => (
                            <li key={i}>
                              • <b>{s.title}</b> — {s.recommendation}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                * We show screenshots only for sections with issues. Currently
                cropping to the hero area.
              </div>
            </div>
          )}

          {/* Findings */}
          {Array.isArray((report as any)?.findings) &&
            (report as any).findings.length > 0 && (
              <div className="rounded-xl border bg-white p-3">
                <div className="font-medium mb-2">Findings</div>
                <div className="grid gap-3">
                  {((report as any).findings as Suggestion[]).map((f, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-lg border bg-white flex items-start gap-3"
                    >
                      <div className="pt-1">
                        <span
                          className={clsx(
                            "px-2 py-0.5 rounded text-xs font-medium",
                            f.impact === "high" && "bg-red-100 text-red-700",
                            f.impact === "medium" &&
                              "bg-amber-100 text-amber-700",
                            f.impact === "low" &&
                              "bg-emerald-100 text-emerald-700"
                          )}
                        >
                          {(f.impact || "low").toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium">{f.title}</div>
                        <div className="text-sm text-slate-600 mt-1">
                          {f.recommendation}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Content audit */}
          {Array.isArray((report as any)?.content_audit) &&
            (report as any).content_audit.length > 0 && (
              <div className="rounded-xl border bg-white p-3">
                <div className="font-medium mb-2">Content Audit</div>
                <div className="grid gap-3">
                  {((report as any).content_audit as ContentAuditItem[]).map(
                    (c, i) => {
                      const st = auditStatus(c);
                      return (
                        <div key={i} className="p-4 rounded-lg border bg-white">
                          <div className="flex items-center gap-2">
                            <span className="font-medium capitalize">
                              {c.section.replace(/_/g, " ")}
                            </span>
                            <span
                              className={clsx(
                                "text-xs px-2 py-0.5 rounded",
                                st === "ok" &&
                                  "bg-emerald-100 text-emerald-700",
                                st === "weak" && "bg-amber-100 text-amber-700",
                                st === "missing" && "bg-red-100 text-red-700"
                              )}
                            >
                              {st}
                            </span>
                          </div>
                          {c.suggestion && (
                            <div className="text-sm text-slate-600 mt-1">
                              {c.suggestion}
                            </div>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Score */}
          <div className="rounded-xl border bg-white p-3">
            <div className="text-sm text-slate-600">Score</div>
            <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={clsx("h-full", scoreBarColor(Math.round(score)))}
                style={{ width: `${clamp(score, 0, 100)}%` }}
              />
            </div>
            <div className="mt-1 text-sm">{Math.round(score)} / 100</div>
            {loading && (
              <div className="mt-1 text-xs text-slate-500">
                Streaming analysis…
              </div>
            )}
          </div>

          {/* Sections present */}
          {(report as any)?.sections_detected && (
            <div className="rounded-xl border bg-white p-3">
              <div className="font-medium mb-2">Sections Present</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(
                  (report as any).sections_detected as SectionsDetected
                ).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span
                      className={clsx(
                        "h-2 w-2 rounded-full",
                        v ? "bg-emerald-500" : "bg-slate-300"
                      )}
                    />
                    <span className="capitalize">{k.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick wins */}
          {Array.isArray((report as any)?.quick_wins) &&
            (report as any).quick_wins.length > 0 && (
              <div className="rounded-xl border bg-white p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Quick Wins</div>
                  <div className="px-3 py-1 rounded-full text-xs md:text-sm font-semibold bg-emerald-100 text-emerald-800">
                    ≈ +{quickWinsLiftPct}% leads (if all done)
                  </div>
                </div>
                <ul className="text-sm text-slate-700 list-disc pl-5 mt-2">
                  {((report as any).quick_wins as string[]).map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

          {/* Backlog */}
          {Array.isArray((report as any)?.prioritized_backlog) &&
            (report as any).prioritized_backlog.length > 0 && (
              <div className="rounded-xl border bg-white p-3">
                <div className="font-medium mb-2">Prioritized Backlog</div>
                <div className="space-y-3">
                  {((report as any).prioritized_backlog as BacklogItem[]).map(
                    (b: any, i: number) => (
                      <div key={i} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{b.title}</div>
                          {typeof b.lift_percent === "number" && (
                            <span className="px-3 py-1 rounded-full text-xs md:text-sm font-semibold bg-emerald-100 text-emerald-800">
                              ≈ +{b.lift_percent}% leads
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-slate-600 flex flex-wrap items-center gap-2">
                          {"impact" in b && (
                            <span className="px-2 py-0.5 rounded bg-slate-100 capitalize">
                              impact {String(b.impact).toLowerCase()}
                            </span>
                          )}
                          {"effort_days" in b && (
                            <span className="px-2 py-0.5 rounded bg-slate-100">
                              effort {b.effort_days}d
                            </span>
                          )}
                          {"eta_days" in b && (
                            <span className="px-2 py-0.5 rounded bg-slate-100">
                              ETA {b.eta_days}d
                            </span>
                          )}
                        </div>
                        {"notes" in b && b.notes && (
                          <div className="mt-1 text-sm text-slate-600">
                            {b.notes}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
