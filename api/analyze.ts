// api/analyze.ts
export const config = { runtime: "edge" };

type Quality = "good" | "fair" | "poor";
export type Suggestion = {
  title: string;
  recommendation: string;
  impact: "low" | "medium" | "high";
};
export type ContentAuditItem = {
  section: string; // 'hero' | 'value_prop' | ...
  present: boolean; // was it detected?
  quality: Quality; // quick heuristic
  suggestion?: string; // single suggestion line
};
export type BacklogItem = {
  title: string;
  impact: 1 | 2 | 3; // 3 high, 2 med, 1 low
  effort_days?: number;
  eta_days?: number;
  notes?: string;
  lift_percent?: number; // ≈ leads lift if implemented
};

export type FullReport = {
  page?: { url: string; title?: string };
  assets?: { screenshot_url?: string | null };
  screenshots?: { hero?: string | null };
  sections_detected?: Record<string, boolean>;
  findings?: Suggestion[];
  content_audit?: ContentAuditItem[];
  quick_wins?: string[];
  prioritized_backlog?: BacklogItem[];
  // “free” laukiem (saglabājam saderību ar Free report)
  meta?: {
    title?: string;
    description?: string;
    canonical?: string;
    lang?: string;
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
};

function normalizeUrl(u: string) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function tagCount(html: string, tag: string) {
  const re = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  return (html.match(re) || []).length;
}
function findAll(html: string, re: RegExp) {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1] || m[0]);
  return out;
}
function metaByName(html: string, name: string) {
  const re = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m?.[1];
}
function metaByProp(html: string, prop: string) {
  const re = new RegExp(
    `<meta[^>]+property=["']${prop}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m?.[1];
}
function linkCanonical(html: string) {
  const m = html.match(
    /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i
  );
  return m?.[1];
}
function titleTag(html: string) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1];
}
function langAttr(html: string) {
  const m = html.match(/<html[^>]+lang=["']([^"']+)["'][^>]*>/i);
  return m?.[1];
}
function imageStats(html: string) {
  const imgs = findAll(html, /<img\b([^>]*)>/gi);
  let total = imgs.length;
  let missingAlt = 0;
  for (const attrs of imgs) {
    const altMatch = /alt\s*=\s*("|')([^"']*)\1/i.exec(attrs);
    if (!altMatch) missingAlt++;
  }
  return { total, missingAlt };
}
function linkStats(html: string, domain: string) {
  const links = findAll(html, /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi);
  let internal = 0,
    external = 0;
  for (const href of links) {
    if (/^https?:\/\//i.test(href)) {
      if (href.includes(domain)) internal++;
      else external++;
    } else {
      internal++;
    }
  }
  return { total: links.length, internal, external };
}
function buildScreenshotUrl(u: string) {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(u)}?w=1200`;
}

function sectionPresence(text: string) {
  const t = text.toLowerCase();
  const has = (s: RegExp) => s.test(t);
  return {
    hero: has(/<h1\b|hero|above the fold|headline/i),
    value_prop: has(/value prop|we help|we (do|are)|why choose|benefits/i),
    social_proof: has(/testimonial|review|trusted|logos?/i),
    pricing: has(/pricing|price|plans?/i),
    features: has(/feature|benefit|capabilit/i),
    faq: has(/\bfaq\b|frequently asked|questions/i),
    contact: has(/contact|get in touch|support/i),
    footer: has(/privacy|terms|copyright/i),
  };
}

function qualityFromPresence(
  present: boolean,
  strengthScore: number
): "good" | "fair" | "poor" {
  if (!present) return "poor";
  if (strengthScore >= 2) return "good";
  if (strengthScore >= 1) return "fair";
  return "poor";
}

function suggestMeta(title?: string, h1?: string, site?: string) {
  const base = h1 || title || "Discover our product";
  let s = `${base} — ${
    site || "your site"
  }. Explore features, pricing and FAQs. Get started in minutes.`;
  if (s.length < 140) s += " Fast, secure and user-friendly.";
  return s.slice(0, 160);
}

async function analyzeCore(
  targetUrl: string,
  mode: "free" | "full"
): Promise<FullReport> {
  const url = normalizeUrl(targetUrl);
  const res = await fetch(url, { redirect: "follow" });
  const httpOk = res.ok;
  const html = await res.text();

  const pageTitle = titleTag(html);
  const metaDesc = metaByName(html, "description");
  const canonical = linkCanonical(html);
  const lang = langAttr(html);

  const h1Count = tagCount(html, "h1");
  const h2Count = tagCount(html, "h2");
  const h3Count = tagCount(html, "h3");

  const og: Record<string, string | undefined> = {
    "og:title": metaByProp(html, "og:title"),
    "og:description": metaByProp(html, "og:description"),
    "og:image": metaByProp(html, "og:image"),
    "og:url": metaByProp(html, "og:url"),
  };
  const twitter: Record<string, string | undefined> = {
    "twitter:card": metaByName(html, "twitter:card"),
    "twitter:title": metaByName(html, "twitter:title"),
    "twitter:description": metaByName(html, "twitter:description"),
    "twitter:image": metaByName(html, "twitter:image"),
  };

  const { total: imgTotal, missingAlt } = imageStats(html);

  const domain = new URL(url).host;
  const { total: linkTotal, internal, external } = linkStats(html, domain);

  // robots/sitemap quick checks (no fetch, only guesses)
  const robotsTxtUrl = `${new URL(url).origin}/robots.txt`;
  const sitemapUrlGuess = `${new URL(url).origin}/sitemap.xml`;
  // we don't fetch here (Edge friendly), just mark unknown as null
  const robots = {
    robotsTxtUrl,
    robotsTxtOk: null,
    sitemapUrlGuess,
    sitemapOk: null,
  };

  const sections = sectionPresence(html);

  // Headline (h1) text for hero
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Findings
  const findings: Suggestion[] = [];
  if (h1Count !== 1) {
    findings.push({
      title: "Unclear Hero Heading Structure",
      recommendation: "Use exactly one H1 with a clear value proposition.",
      impact: "high",
    });
  }
  if (!metaDesc || metaDesc.length < 140 || metaDesc.length > 160) {
    findings.push({
      title: "Meta Description Not Optimized",
      recommendation: "Keep description ~150–160 chars with benefits and CTA.",
      impact: "medium",
    });
  }
  if (sections.social_proof === false) {
    findings.push({
      title: "Insufficient Social Proof",
      recommendation: "Add testimonials/logos to build trust.",
      impact: "medium",
    });
  }

  // Content audit (good/fair/poor + single suggestion)
  const audit: ContentAuditItem[] = [
    {
      section: "hero",
      present: sections.hero,
      quality: qualityFromPresence(sections.hero, h1 ? 2 : 0),
      suggestion: "Add a strong headline and a clear CTA.",
    },
    {
      section: "value_prop",
      present: sections.value_prop,
      quality: qualityFromPresence(sections.value_prop, metaDesc ? 2 : 1),
      suggestion: "Highlight key benefits in bullets.",
    },
    {
      section: "social_proof",
      present: sections.social_proof,
      quality: qualityFromPresence(sections.social_proof, 0),
      suggestion: "Add testimonials or client logos.",
    },
    {
      section: "pricing",
      present: sections.pricing,
      quality: qualityFromPresence(sections.pricing, 0),
      suggestion: "Show pricing/plans or at least 'from' price.",
    },
    {
      section: "features",
      present: sections.features,
      quality: qualityFromPresence(sections.features, 1),
      suggestion: "Use concise bullets for scannability.",
    },
    {
      section: "faq",
      present: sections.faq,
      quality: qualityFromPresence(sections.faq, 1),
      suggestion: "Provide collapsible FAQ with 6–10 Q&A.",
    },
    {
      section: "contact",
      present: sections.contact,
      quality: qualityFromPresence(sections.contact, 1),
      suggestion: "Make phone/email and form easy to find.",
    },
    {
      section: "footer",
      present: sections.footer,
      quality: qualityFromPresence(sections.footer, 1),
      suggestion: "Include legal links and newsletter/SM icons.",
    },
  ];

  // Quick wins (strings) + prioritized backlog (with lift%)
  const quickWins: string[] = [];
  const backlog: BacklogItem[] = [];

  // Hero
  if (h1Count !== 1) {
    quickWins.push("Set exactly one H1 with a clear value proposition.");
    backlog.push({
      title: "Revamp the Hero Section",
      impact: 3,
      effort_days: 2,
      eta_days: 10,
      notes: "Strong value prop + visuals above the fold.",
      lift_percent: 20,
    });
  }

  // Meta description
  if (!metaDesc) {
    quickWins.push("Add a meta description of ~150–160 chars.");
    backlog.push({
      title: "Write a Compelling Meta Description",
      impact: 2,
      effort_days: 0.5,
      eta_days: 1,
      lift_percent: 4,
    });
  } else if (metaDesc.length < 140 || metaDesc.length > 160) {
    quickWins.push("Adjust meta description length to ~150–160 chars.");
    backlog.push({
      title: "Tighten the Meta Description",
      impact: 1,
      effort_days: 0.5,
      eta_days: 1,
      lift_percent: 2,
    });
  }

  // ALT
  if (imgTotal > 0 && missingAlt > 0) {
    quickWins.push(`Add ALT texts to ${missingAlt}/${imgTotal} images.`);
    backlog.push({
      title: "Add ALT Texts to Images",
      impact: 2,
      effort_days: 1,
      eta_days: 2,
      lift_percent: Math.min(3, Math.round((missingAlt / imgTotal) * 10)),
    });
  }

  // Social proof
  if (!sections.social_proof) {
    quickWins.push("Add testimonials or client logos to build trust.");
    backlog.push({
      title: "Implement a Testimonial Slider",
      impact: 2,
      effort_days: 3,
      eta_days: 7,
      lift_percent: 10,
    });
  }

  // FAQ
  if (!sections.faq) {
    quickWins.push("Add a concise, collapsible FAQ section.");
    backlog.push({
      title: "Optimize the FAQ Section",
      impact: 2,
      effort_days: 2,
      eta_days: 5,
      lift_percent: 10,
    });
  }

  // Internal links simple heuristic
  if (internal < 5) {
    quickWins.push(
      "Add 5–10 internal links to key pages (product, pricing, contact, FAQ)."
    );
    backlog.push({
      title: "Increase Internal Links",
      impact: 1,
      effort_days: 1,
      eta_days: 2,
      lift_percent: 3,
    });
  }

  const full: FullReport = {
    page: { url, title: pageTitle || undefined },
    assets: { screenshot_url: buildScreenshotUrl(url) },
    screenshots: { hero: buildScreenshotUrl(url) },
    sections_detected: sections,
    findings,
    content_audit: audit,
    quick_wins: quickWins,
    prioritized_backlog: backlog,
    meta: {
      title: pageTitle || undefined,
      description: metaDesc || undefined,
      canonical: canonical || undefined,
      lang,
    },
    seo: {
      h1Count,
      h2Count,
      h3Count,
      canonicalPresent: !!canonical,
      metaDescriptionPresent: !!metaDesc,
    },
    social: { og, twitter },
    links: { total: linkTotal, internal, external },
    images: { total: imgTotal, missingAlt },
    robots,
  };

  // Free režīmā vari samazināt, bet atstājam laukus — tas palīdz Free report tabiem
  if (mode === "free") {
    return full;
  }
  return full;
}

export default async function handler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url") || "";
    const mode = (searchParams.get("mode") || "free") as "free" | "full";
    if (!url) {
      return new Response(JSON.stringify({ ok: false, error: "Missing url" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const data = await analyzeCore(url, mode);
    return new Response(JSON.stringify({ ok: true, data }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || "Analyze failed" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}
