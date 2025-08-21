// api/analyze-stream.ts
// SSE endpoint Full reportam. Sūta: event:progress {value} un event:result {report}

const UA = "Mozilla/5.0 (compatible; HolboxAudit/1.0; +https://example.com)";

type Suggestion = {
  title: string;
  impact: "low" | "medium" | "high";
  recommendation: string;
};
type ContentAuditItem = {
  section: string;
  present: boolean;
  quality: "good" | "poor";
  suggestion?: string;
};
type BacklogItem = {
  title: string;
  impact?: number;
  effort_days?: number;
  eta_days?: number;
  notes?: string;
  lift_percent?: number;
};
type FullReport = {
  page?: { url?: string; title?: string };
  assets?: { screenshot_url?: string | null };
  screenshots?: { hero?: string | null };
  sections_detected?: Record<
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
  quick_wins?: string[];
  prioritized_backlog?: BacklogItem[];
  findings?: Suggestion[];
  content_audit?: ContentAuditItem[];
  meta?: any;
  seo?: any;
  images?: any;
  links?: any;
  social?: any;
  robots?: any;
  text_snippets?: string;
  score?: number;
};

const write = (res: any, ev: string, data: unknown) => {
  res.write(`event: ${ev}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};
const okHeaders = (res: any) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
};

function normalizeUrl(u: string) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`;
}
function screenshotPrimary(u: string) {
  const url = normalizeUrl(u);
  const tmpl =
    (globalThis as any).process?.env?.SCREENSHOT_URL_TMPL ||
    (globalThis as any).VITE_SCREENSHOT_URL_TMPL;
  if (tmpl) return String(tmpl).replace("{URL}", encodeURIComponent(url));
  return null;
}
function screenshotBackup(u: string) {
  const url = normalizeUrl(u);
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}
async function fetchText(u: string) {
  const r = await fetch(u, { headers: { "user-agent": UA } });
  const text = await r.text();
  return { status: r.status, url: r.url, text };
}
const extract = (html: string, re: RegExp) =>
  (html.match(re)?.[1] || "").trim() || undefined;
const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
function count(html: string, tag: string) {
  const re = new RegExp(`<${tag}\\b`, "gi");
  return (html.match(re) || []).length;
}
function countImgsMissingAlt(html: string) {
  const imgRe = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  let total = 0,
    missing = 0;
  while ((m = imgRe.exec(html))) {
    total++;
    const tag = m[0];
    const altMatch = tag.match(/\balt\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const ariaHidden = /\baria-hidden\s*=\s*("true"|'true'|true)/i.test(tag);
    const rolePresent = /\brole\s*=\s*("presentation"|'presentation')/i.test(
      tag
    );
    const altVal = altMatch
      ? (altMatch[2] || altMatch[3] || altMatch[4] || "").trim()
      : undefined;
    const isMissing = !altVal && !ariaHidden && !rolePresent;
    if (isMissing) missing++;
  }
  return { total, missing };
}
function countLinks(html: string, baseHost: string | null) {
  const aRe = /<a\b[^>]*href\s*=\s*("([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  let total = 0,
    internal = 0,
    external = 0;
  while ((m = aRe.exec(html))) {
    total++;
    const href = m[2] || m[3] || m[4] || "";
    try {
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        continue;
      if (href.startsWith("/")) internal++;
      else if (/^https?:\/\//i.test(href)) {
        const u = new URL(href);
        if (baseHost && u.host === baseHost) internal++;
        else external++;
      } else internal++;
    } catch {
      /* ignore */
    }
  }
  return { total, internal, external };
}

function sectionsDetected(r: any): FullReport["sections_detected"] {
  const text = (r.text_snippets || "").toLowerCase();
  const h1c = r?.seo?.h1Count ?? 0;
  return {
    hero: h1c > 0,
    value_prop: !!(r?.meta?.description && r.meta.description.length > 40),
    social_proof: /testimonial|review|trust|clients? logos?/i.test(text),
    pricing: /price|pricing|plans?/i.test(text),
    features: /feature|benefit|capabilit(y|ies)/i.test(text),
    faq: /faq|frequently asked|questions/i.test(text),
    contact: /contact|get in touch|support|help/i.test(text),
    footer: /privacy|terms/i.test(text) || (r?.links?.total ?? 0) >= 8,
  };
}

function quickWins(r: any): string[] {
  const wins: string[] = [];
  const h1c = r?.seo?.h1Count ?? 0;
  const md = r?.meta?.description as string | undefined;
  const hasCanon = !!(r?.seo?.canonicalPresent || r?.meta?.canonical);
  const altTotal = r?.images?.total ?? 0;
  const altMiss = r?.images?.missingAlt ?? 0;
  const altLift = altTotal
    ? Math.min(3, Math.round((altMiss / altTotal) * 3))
    : 0;

  if (h1c !== 1)
    wins.push(
      "Use a single clear H1 + primary CTA above the fold. (≈ +12% leads)"
    );
  if (!md || md.length < 140 || md.length > 180)
    wins.push(
      "Fix meta description to ~150 chars with benefits. (≈ +4% leads)"
    );
  if (altLift > 0) wins.push(`Add ALT text to images. (≈ +${altLift}% leads)`);
  if (!hasCanon)
    wins.push("Add canonical URL to prevent duplicates. (≈ +1% leads)");
  if ((r?.links?.internal ?? 0) < 5)
    wins.push("Add 5–10 internal links to key pages. (≈ +3% leads)");

  const ogCount = Object.values(r?.social?.og ?? {}).filter(Boolean).length;
  const twCount = Object.values(r?.social?.twitter ?? {}).filter(
    Boolean
  ).length;
  if (ogCount + twCount < 3)
    wins.push("Add OpenGraph/Twitter meta for rich shares. (≈ +1–2% leads)");

  if (r?.robots && (!r.robots.robotsTxtOk || !r.robots.sitemapOk)) {
    if (!r.robots.robotsTxtOk)
      wins.push("Publish /robots.txt and include sitemap link. (≈ +1% leads)");
    if (!r.robots.sitemapOk)
      wins.push(
        "Publish /sitemap.xml and reference it in robots.txt. (≈ +1% leads)"
      );
  }
  return wins.slice(0, 10);
}

function backlog(r: any): BacklogItem[] {
  const items: BacklogItem[] = [];
  const h1c = r?.seo?.h1Count ?? 0;
  const md = r?.meta?.description as string | undefined;
  const altTotal = r?.images?.total ?? 0;
  const altMiss = r?.images?.missingAlt ?? 0;
  const altLift = altTotal
    ? Math.min(3, Math.round((altMiss / altTotal) * 3))
    : 0;

  if (h1c !== 1)
    items.push({
      title: "Revamp the Hero Section",
      impact: 3,
      effort_days: 2,
      eta_days: 10,
      notes:
        "Strong value proposition, single H1, prominent CTA and benefit bullets.",
      lift_percent: 20,
    });
  items.push({
    title: "Implement a Testimonial Slider",
    impact: 2,
    effort_days: 3,
    eta_days: 7,
    notes:
      "Collect 6–10 short quotes with names/roles; add logo row if available.",
    lift_percent: 10,
  });
  items.push({
    title: "Optimize the FAQ Section",
    impact: 2,
    effort_days: 2,
    eta_days: 5,
    notes: "Collapsible groups; top 8–10 questions surfaced.",
    lift_percent: 10,
  });

  if (!md || md.length < 140 || md.length > 180)
    items.push({
      title: "Re-write Meta Description",
      impact: 1,
      effort_days: 1,
      eta_days: 2,
      notes: "Aim for 145–160 chars with benefit + brand.",
      lift_percent: 4,
    });
  if (altLift > 0)
    items.push({
      title: "Add ALT Text to Images",
      impact: 1,
      effort_days: 1,
      eta_days: 2,
      notes:
        "Short descriptive ALT for non-decorative; empty alt for decorative.",
      lift_percent: altLift,
    });

  const hasCanon = !!(r?.seo?.canonicalPresent || r?.meta?.canonical);
  if (!hasCanon)
    items.push({
      title: "Add Canonical URL",
      impact: 1,
      effort_days: 0.5,
      eta_days: 1,
      notes: "Point to the canonical route without params.",
      lift_percent: 1,
    });

  if ((r?.links?.internal ?? 0) < 5)
    items.push({
      title: "Strengthen Internal Linking",
      impact: 2,
      effort_days: 1,
      eta_days: 2,
      notes:
        "Add 5–10 links to product/pricing/contact/FAQ from relevant copy.",
      lift_percent: 3,
    });

  const ogCount = Object.values(r?.social?.og ?? {}).filter(Boolean).length;
  const twCount = Object.values(r?.social?.twitter ?? {}).filter(
    Boolean
  ).length;
  if (ogCount + twCount < 3)
    items.push({
      title: "Add Social Meta (OG/Twitter)",
      impact: 1,
      effort_days: 0.5,
      eta_days: 1,
      notes: "og:title/description/image/url + twitter:card for rich shares.",
      lift_percent: 1,
    });

  if (r?.robots && (!r.robots.robotsTxtOk || !r.robots.sitemapOk)) {
    if (!r.robots.robotsTxtOk)
      items.push({
        title: "Publish robots.txt",
        impact: 1,
        effort_days: 0.5,
        eta_days: 1,
        notes: "Allow crawling; include sitemap link.",
        lift_percent: 1,
      });
    if (!r.robots.sitemapOk)
      items.push({
        title: "Publish sitemap.xml",
        impact: 1,
        effort_days: 0.5,
        eta_days: 1,
        notes: "Autogenerate and keep up-to-date; link in robots.txt.",
        lift_percent: 1,
      });
  }
  return items.slice(0, 12);
}

function findings(r: any): Suggestion[] {
  const out: Suggestion[] = [];
  const h1c = r?.seo?.h1Count ?? 0;
  if (h1c !== 1)
    out.push({
      title: "Hero Section Needs Improvement",
      impact: "high",
      recommendation:
        "Use one strong H1, clear value proposition, and a primary CTA above the fold.",
    });
  if (!r?.meta?.description)
    out.push({
      title: "Missing Meta Description",
      impact: "low",
      recommendation:
        "Add a ~150-char meta description including your key benefit and brand.",
    });
  const text = (r.text_snippets || "").toLowerCase();
  if (!/testimonial|review|trust|clients? logos?/i.test(text))
    out.push({
      title: "Insufficient Social Proof",
      impact: "medium",
      recommendation:
        "Add testimonials, case-studies, or client logos to build trust.",
    });
  return out.slice(0, 8);
}

export default async function handler(req: any, res: any) {
  okHeaders(res);
  try {
    const qUrl = (req.query?.url as string) || "";
    const url = normalizeUrl(qUrl);
    if (!url) {
      write(res, "result", { error: "Missing URL" });
      return res.end();
    }

    write(res, "progress", { value: 8 });

    const { status, url: finalUrl, text: html } = await fetchText(url);

    write(res, "progress", { value: 22 });

    const title = extract(html, /<title>([\s\S]*?)<\/title>/i);
    const description =
      extract(
        html,
        /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["'][^>]*>/i
      ) ||
      extract(
        html,
        /<meta\s+property=["']og:description["']\s+content=["']([\s\S]*?)["'][^>]*>/i
      );
    const canonical = extract(
      html,
      /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/i
    );

    const h1Count = count(html, "h1");
    const h2Count = count(html, "h2");
    const h3Count = count(html, "h3");

    const { total: imgTotal, missing: imgMissing } = countImgsMissingAlt(html);

    const baseHost = (() => {
      try {
        return new URL(finalUrl || url).host;
      } catch {
        return null;
      }
    })();
    const { total: linkTotal, internal, external } = countLinks(html, baseHost);

    const origin = (() => {
      try {
        const u = new URL(finalUrl || url);
        return `${u.protocol}//${u.host}`;
      } catch {
        return null;
      }
    })();
    let robotsTxtOk: boolean | null = null;
    let sitemapOk: boolean | null = null;
    let robotsTxtUrl: string | undefined;
    let sitemapUrlGuess: string | undefined;
    if (origin) {
      robotsTxtUrl = `${origin}/robots.txt`;
      sitemapUrlGuess = `${origin}/sitemap.xml`;
      robotsTxtOk = await (async () => {
        try {
          const r = await fetch(robotsTxtUrl!);
          return r.status < 400;
        } catch {
          return false;
        }
      })();
      sitemapOk = await (async () => {
        try {
          const r = await fetch(sitemapUrlGuess!);
          return r.status < 400;
        } catch {
          return false;
        }
      })();
    }

    write(res, "progress", { value: 48 });

    const report: FullReport = {
      page: { url: finalUrl || url, title },
      assets: {
        screenshot_url:
          screenshotPrimary(finalUrl || url) ||
          screenshotBackup(finalUrl || url),
      },
      screenshots: { hero: screenshotPrimary(finalUrl || url) || null },
      meta: { description, canonical },
      seo: {
        h1Count,
        h2Count,
        h3Count,
        canonicalPresent: !!canonical,
        metaDescriptionPresent: !!description,
      },
      images: { total: imgTotal, missingAlt: imgMissing },
      links: { total: linkTotal, internal, external },
      robots: { robotsTxtUrl, robotsTxtOk, sitemapUrlGuess, sitemapOk },
      text_snippets: stripTags(html).slice(0, 4000),
    };

    write(res, "progress", { value: 70 });

    report.sections_detected = sectionsDetected(report);
    report.findings = findings(report);
    report.quick_wins = quickWins(report);
    report.prioritized_backlog = backlog(report);

    // Content audit saraksts
    report.content_audit = [
      {
        section: "Hero",
        present: !!report.sections_detected?.hero,
        quality: (report.seo?.h1Count ?? 0) === 1 ? "good" : "poor",
        suggestion:
          (report.seo?.h1Count ?? 0) === 1
            ? undefined
            : "Add a single clear H1 with the value proposition and a primary CTA.",
      },
      {
        section: "Value Prop",
        present: !!report.sections_detected?.value_prop,
        quality:
          report.meta?.description &&
          report.meta.description.length >= 120 &&
          report.meta.description.length <= 180
            ? "good"
            : "poor",
        suggestion: report.meta?.description
          ? "Refine the meta description to ~150 chars with a clear benefit."
          : "Add a clear value statement in the hero/meta description.",
      },
      {
        section: "Social Proof",
        present: !!report.sections_detected?.social_proof,
        quality: !!report.sections_detected?.social_proof ? "good" : "poor",
        suggestion: !!report.sections_detected?.social_proof
          ? undefined
          : "Include testimonials or client logos.",
      },
      {
        section: "Pricing",
        present: !!report.sections_detected?.pricing,
        quality: !!report.sections_detected?.pricing ? "good" : "poor",
        suggestion: !!report.sections_detected?.pricing
          ? undefined
          : "Display pricing or ‘Request pricing’ CTA.",
      },
      {
        section: "Features",
        present: !!report.sections_detected?.features,
        quality: !!report.sections_detected?.features ? "good" : "poor",
        suggestion: !!report.sections_detected?.features
          ? undefined
          : "Outline 4–6 key features in bullets.",
      },
      {
        section: "Faq",
        present: !!report.sections_detected?.faq,
        quality: !!report.sections_detected?.faq ? "poor" : "poor",
        suggestion: !!report.sections_detected?.faq
          ? "Use collapsible FAQ for quick scanning."
          : "Add a FAQ section.",
      },
      {
        section: "Contact",
        present: !!report.sections_detected?.contact,
        quality: !!report.sections_detected?.contact ? "good" : "poor",
        suggestion: !!report.sections_detected?.contact
          ? undefined
          : "Add a visible contact CTA/form in header/footer.",
      },
      {
        section: "Footer",
        present: !!report.sections_detected?.footer,
        quality: !!report.sections_detected?.footer ? "good" : "poor",
        suggestion: !!report.sections_detected?.footer
          ? undefined
          : "Include links to privacy, terms, social profiles.",
      },
      ...(report.images && report.images.total && report.images.missingAlt
        ? [
            {
              section: "Images",
              present: true,
              quality: "poor",
              suggestion: "Add ALT text to non-decorative images.",
            } as ContentAuditItem,
          ]
        : []),
    ];

    write(res, "progress", { value: 90 });

    write(res, "result", report);
    res.end();
  } catch (e: any) {
    write(res, "result", { error: e?.message || "Stream failed" });
    res.end();
  }
}
