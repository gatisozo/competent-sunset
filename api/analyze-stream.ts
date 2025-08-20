// api/analyze-stream.ts
// SSE endpoint used by the Full report. Emits: "progress" events and one "result" event.

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
  impact?: number; // 1..3
  effort_days?: number;
  eta_days?: number;
  notes?: string;
  lift_percent?: number; // for UI badge
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
  // pass-through for client enrichment if needed:
  meta?: any;
  seo?: any;
  images?: any;
  links?: any;
  social?: any;
  robots?: any;
  text_snippets?: string;
  score?: number;
};

const write = (res: any, ev: string, data: any) => {
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

function screenshotUrl(u: string) {
  const url = normalizeUrl(u);
  const tmpl =
    (globalThis as any).process?.env?.SCREENSHOT_URL_TMPL ||
    (globalThis as any).VITE_SCREENSHOT_URL_TMPL;
  if (tmpl) return String(tmpl).replace("{URL}", encodeURIComponent(url));
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`;
}

async function fetchText(u: string) {
  const r = await fetch(u, { headers: { "user-agent": UA } });
  const text = await r.text();
  return { status: r.status, url: r.url, text };
}

function extract(html: string, re: RegExp) {
  const m = html.match(re);
  return m ? m[1]?.trim() : undefined;
}
function stripTags(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function parseHeadings(html: string) {
  const out: Array<{ tag: string; text: string }> = [];
  const re = /<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push({ tag: m[1].toLowerCase(), text: stripTags(m[2]) });
  }
  return out;
}
function countTags(html: string, tag: string) {
  const re = new RegExp(`<${tag}\\b`, "gi");
  const matches = html.match(re);
  return matches ? matches.length : 0;
}
function countImgsMissingAlt(html: string) {
  const imgRe = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  let total = 0;
  let missing = 0;
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
  let total = 0;
  let internal = 0;
  let external = 0;

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
      if (href.startsWith("/")) {
        internal++;
      } else if (/^https?:\/\//i.test(href)) {
        const u = new URL(href);
        if (baseHost && u.host === baseHost) internal++;
        else external++;
      } else {
        internal++; // relative
      }
    } catch {
      // ignore bad URLs
    }
  }
  return { total, internal, external };
}

async function fetchHead(url: string) {
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: { "user-agent": UA },
    });
    return r.status >= 200 && r.status < 400;
  } catch {
    return false;
  }
}

/* ---------- derivations used server-side (for richer FullReport) ---------- */

function deriveSectionsDetected(input: any) {
  const txt = (input.text_snippets || "").toLowerCase();
  return {
    hero: (input.seo?.h1Count ?? 0) > 0,
    value_prop: !!(
      input.meta?.description && input.meta.description.length > 40
    ),
    social_proof: /testimonial|review|trust|clients|logos?/i.test(txt),
    pricing: /price|pricing|plans?/i.test(txt),
    features: /feature|benefit|capabilit(y|ies)/i.test(txt),
    faq: /faq|frequently asked|questions/i.test(txt),
    contact: /contact|get in touch|support|help/i.test(txt),
    footer: (input.links?.total ?? 0) >= 8 || /privacy|terms/i.test(txt),
  };
}

function serverQuickWins(input: any): string[] {
  const out: string[] = [];
  const h1c = input.seo?.h1Count ?? 0;
  const md = input.meta?.description as string | undefined;
  const hasCanon = !!(input.seo?.canonicalPresent || input.meta?.canonical);
  const { total: imgTotal, missingAlt } = input.images || {};
  const internal = input.links?.internal ?? 0;
  const ogCount = Object.values(input.social?.og ?? {}).filter(Boolean).length;
  const twCount = Object.values(input.social?.twitter ?? {}).filter(
    Boolean
  ).length;

  if (h1c !== 1)
    out.push("Add a single clear H1 + primary CTA above the fold. (≈ +12%)");
  if (!md || md.length < 140 || md.length > 180)
    out.push("Fix meta description to ~150 chars with benefits. (≈ +4%)");
  if (!hasCanon) out.push("Add canonical URL to prevent duplicates. (≈ +1%)");

  if (imgTotal > 0 && typeof missingAlt === "number" && missingAlt > 0) {
    const altLift = Math.min(
      3,
      Math.round((missingAlt / Math.max(1, imgTotal)) * 3)
    );
    if (altLift > 0) out.push(`Add ALT text to images (≈ +${altLift}% leads).`);
  }
  if (internal < 5) out.push("Add 5–10 internal links to key pages. (≈ +3%)");
  if (ogCount + twCount < 3)
    out.push("Add OpenGraph/Twitter meta for better sharing. (≈ +1–2%)");
  if (input.robots && (!input.robots.robotsTxtOk || !input.robots.sitemapOk)) {
    if (!input.robots.robotsTxtOk)
      out.push("Publish /robots.txt and include sitemap link. (≈ +1%)");
    if (!input.robots.sitemapOk)
      out.push("Publish /sitemap.xml and reference it in robots.txt. (≈ +1%)");
  }

  return out.slice(0, 10);
}

function serverBacklog(input: any): BacklogItem[] {
  const items: BacklogItem[] = [];
  const h1c = input.seo?.h1Count ?? 0;
  const md = input.meta?.description as string | undefined;
  const { total: imgTotal, missingAlt } = input.images || {};
  const internal = input.links?.internal ?? 0;
  const hasCanon = !!(input.seo?.canonicalPresent || input.meta?.canonical);

  if (h1c !== 1) {
    items.push({
      title: "Revamp the Hero Section",
      impact: 3,
      effort_days: 2,
      eta_days: 10,
      lift_percent: 20,
      notes: "Strong value prop, single H1, prominent CTA and benefit bullets.",
    });
  }
  if (!md || md.length < 140 || md.length > 180) {
    items.push({
      title: "Re-write Meta Description",
      impact: 1,
      effort_days: 1,
      eta_days: 2,
      lift_percent: 4,
      notes: "Aim for 145–160 chars with benefit + brand.",
    });
  }
  if (!hasCanon) {
    items.push({
      title: "Add Canonical URL",
      impact: 1,
      effort_days: 0.5,
      eta_days: 1,
      lift_percent: 1,
      notes: "Point to the canonical route without params.",
    });
  }
  if (imgTotal > 0 && typeof missingAlt === "number" && missingAlt > 0) {
    const altLift = Math.min(
      3,
      Math.round((missingAlt / Math.max(1, imgTotal)) * 3)
    );
    items.push({
      title: "Add ALT Text to Images",
      impact: 1,
      effort_days: 1,
      eta_days: 2,
      lift_percent: altLift,
      notes: "Short, descriptive ALT; empty alt for decorative images.",
    });
  }
  if (internal < 5) {
    items.push({
      title: "Strengthen Internal Linking",
      impact: 2,
      effort_days: 1,
      eta_days: 2,
      lift_percent: 3,
      notes:
        "Add 5–10 links to product/pricing/contact/FAQ from relevant copy.",
    });
  }
  if (input.robots && (!input.robots.robotsTxtOk || !input.robots.sitemapOk)) {
    if (!input.robots.robotsTxtOk)
      items.push({
        title: "Publish robots.txt",
        impact: 1,
        effort_days: 0.5,
        eta_days: 1,
        lift_percent: 1,
        notes: "Allow crawling; include sitemap link.",
      });
    if (!input.robots.sitemapOk)
      items.push({
        title: "Publish sitemap.xml",
        impact: 1,
        effort_days: 0.5,
        eta_days: 1,
        lift_percent: 1,
        notes: "Autogenerate and keep up-to-date; link in robots.txt.",
      });
  }

  return items.slice(0, 12);
}

function serverFindings(input: any): Suggestion[] {
  const f: Suggestion[] = [];
  const h1c = input.seo?.h1Count ?? 0;
  const md = input.meta?.description as string | undefined;
  const s = deriveSectionsDetected(input);

  if (h1c !== 1) {
    f.push({
      title: "Hero Section Needs Improvement",
      impact: "high",
      recommendation:
        "Use one strong H1, clear value proposition, and a primary CTA above the fold.",
    });
  }
  if (!s.social_proof) {
    f.push({
      title: "Insufficient Social Proof",
      impact: "medium",
      recommendation:
        "Add testimonials, case-studies, or client logos to build trust.",
    });
  }
  if (!md || md.length < 140 || md.length > 180) {
    f.push({
      title: "Meta Description Not Optimal",
      impact: "low",
      recommendation:
        "Re-write to ~150 characters with the main benefit and brand.",
    });
  }

  return f.slice(0, 8);
}

function serverContentAudit(input: any): ContentAuditItem[] {
  const s = deriveSectionsDetected(input);
  const md = input.meta?.description as string | undefined;
  const list: ContentAuditItem[] = [
    {
      section: "Hero",
      present: s.hero,
      quality: s.hero && (input.seo?.h1Count ?? 0) === 1 ? "good" : "poor",
      suggestion: s.hero ? undefined : "Add one clear H1 and a primary CTA.",
    },
    {
      section: "Value Prop",
      present: s.value_prop,
      quality:
        s.value_prop && md && md.length >= 120 && md.length <= 180
          ? "good"
          : "poor",
      suggestion: s.value_prop
        ? "Refine meta/hero copy to clarify value."
        : "Add a clear value statement.",
    },
    {
      section: "Social Proof",
      present: s.social_proof,
      quality: s.social_proof ? "good" : "poor",
      suggestion: s.social_proof
        ? undefined
        : "Add testimonials or client logos.",
    },
    {
      section: "Pricing",
      present: s.pricing,
      quality: s.pricing ? "good" : "poor",
      suggestion: s.pricing
        ? undefined
        : "Display pricing or a clear pricing CTA.",
    },
    {
      section: "Features",
      present: s.features,
      quality: s.features ? "good" : "poor",
      suggestion: s.features
        ? undefined
        : "Outline 4–6 key features with bullets.",
    },
    {
      section: "Faq",
      present: s.faq,
      quality: s.faq ? "poor" : "poor",
      suggestion: s.faq ? "Use collapsible FAQ groups." : "Add a FAQ section.",
    },
    {
      section: "Contact",
      present: s.contact,
      quality: s.contact ? "good" : "poor",
      suggestion: s.contact ? undefined : "Add a visible contact CTA/form.",
    },
    {
      section: "Footer",
      present: s.footer,
      quality: s.footer ? "good" : "poor",
      suggestion: s.footer ? undefined : "Add privacy/terms/social links.",
    },
  ];
  const imgs = input.images?.total ?? 0;
  const missAlt = input.images?.missingAlt ?? 0;
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

function computeScore(findings: Suggestion[], audit: ContentAuditItem[]) {
  let score = 100;
  for (const f of findings)
    score -= f.impact === "high" ? 10 : f.impact === "medium" ? 5 : 2;
  for (const c of audit) {
    score -= c.present ? (c.quality === "poor" ? 2 : 0) : 5;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/* ---------------- handler ---------------- */

export default async function handler(req: any, res: any) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const url = normalizeUrl((req.query?.url as string) || "");
  if (!url) {
    res.statusCode = 400;
    res.end("Missing url");
    return;
  }

  okHeaders(res);
  write(res, "progress", { value: 8 });

  try {
    // fetch page HTML
    const { status, url: finalUrl, text: html } = await fetchText(url);
    write(res, "progress", { value: 28 });

    // basic extraction
    const lang = extract(html, /<html[^>]+lang\s*=\s*["']?([a-zA-Z-]+)[^>]*>/i);
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
    const viewport = extract(
      html,
      /<meta\s+name=["']viewport["']\s+content=["']([\s\S]*?)["'][^>]*>/i
    );
    const canonical = extract(
      html,
      /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/i
    );

    const og: Record<string, string | undefined> = {};
    const tw: Record<string, string | undefined> = {};
    const metaPairs = html.match(/<meta[^>]+>/gi) || [];
    for (const tag of metaPairs) {
      const prop =
        (tag.match(/\bproperty\s*=\s*("([^"]+)"|'([^']+)')/i) || [])[2] ||
        (tag.match(/\bproperty\s*=\s*('([^']+)')/i) || [])[2];
      const name =
        (tag.match(/\bname\s*=\s*("([^"]+)"|'([^']+)')/i) || [])[2] ||
        (tag.match(/\bname\s*=\s*('([^']+)')/i) || [])[2];
      const content =
        (tag.match(/\bcontent\s*=\s*("([^"]+)"|'([^']+)')/i) || [])[2] ||
        (tag.match(/\bcontent\s*=\s*('([^']+)')/i) || [])[2];
      const key = (prop || name || "").toLowerCase();
      if (key.startsWith("og:")) og[key] = content;
      if (key.startsWith("twitter:")) tw[key] = content;
    }

    // headings / counts
    const headingsOutline = parseHeadings(html);
    const h1Count = countTags(html, "h1");
    const h2Count = countTags(html, "h2");
    const h3Count = countTags(html, "h3");

    // images
    const { total: imgTotal, missing: missingAlt } = countImgsMissingAlt(html);
    write(res, "progress", { value: 52 });

    // links
    const baseUrl = new URL(finalUrl || url);
    const {
      total: linkTotal,
      internal,
      external,
    } = countLinks(html, baseUrl.host);

    // robots/sitemap
    const origin = `${baseUrl.protocol}//${baseUrl.host}`;
    const robotsTxtUrl = `${origin}/robots.txt`;
    const sitemapUrlGuess = `${origin}/sitemap.xml`;
    const robotsTxtOk = await fetchHead(robotsTxtUrl);
    const sitemapOk = await fetchHead(sitemapUrlGuess);

    // text snippet (for section heuristics on client)
    const text_snippets = stripTags(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
    ).slice(0, 15000);

    write(res, "progress", { value: 76 });

    // assemble base object (also used by client enrichment)
    const base: any = {
      page: { url: finalUrl || url, title },
      assets: { screenshot_url: screenshotUrl(finalUrl || url) },
      meta: { title, description, lang, viewport, canonical },
      seo: {
        h1Count,
        h2Count,
        h3Count,
        canonicalPresent: !!canonical,
        metaDescriptionPresent: !!description,
      },
      social: { og, twitter: tw },
      links: { total: linkTotal, internal, external },
      images: { total: imgTotal, missingAlt },
      robots: { robotsTxtUrl, robotsTxtOk, sitemapOk },
      text_snippets,
    };

    // server-side enrich for Full report (so UI uzreiz ir bagātāks)
    const sections_detected = deriveSectionsDetected(base);
    const content_audit = serverContentAudit(base);
    const findings = serverFindings(base);
    const quick_wins = serverQuickWins(base);
    const prioritized_backlog = serverBacklog(base);
    const score = computeScore(findings, content_audit);

    const result: FullReport = {
      ...base,
      sections_detected,
      content_audit,
      findings,
      quick_wins,
      prioritized_backlog,
      score,
      screenshots: { hero: base.assets.screenshot_url },
    };

    write(res, "result", result);
    res.end();
  } catch (err: any) {
    write(res, "error", { message: err?.message || "Analyze stream failed" });
    try {
      res.end();
    } catch {}
  }
}
