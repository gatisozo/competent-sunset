// api/analyze-stream.ts
export const config = { runtime: "edge" };

type Mode = "free" | "full";

// Mazs encoder helpers SSE
const enc = new TextEncoder();
function send(
  controller: ReadableStreamDefaultController,
  event: string,
  data: unknown
) {
  controller.enqueue(enc.encode(`event: ${event}\n`));
  controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
}

async function fetchText(u: string) {
  const res = await fetch(u, { redirect: "follow" });
  const html = await res.text();
  return { res, html };
}

function normalizeUrl(u: string) {
  const s = (u || "").trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
function buildScreenshotUrl(u: string) {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(u)}?w=1200`;
}

function baseAnalyze(url: string, html: string) {
  // Šeit ļoti vienkārša, bet noderīga HTML heuristika — tas pats, kas analyze.ts
  const m = (re: RegExp) => html.match(re);
  const all = (re: RegExp) =>
    Array.from(html.matchAll(re)).map((m) => m[1] || m[0]);

  const title = m(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  const metaDesc = m(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i
  )?.[1];
  const canonical = m(
    /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i
  )?.[1];

  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const h2Count = (html.match(/<h2\b/gi) || []).length;
  const h3Count = (html.match(/<h3\b/gi) || []).length;

  const imgs = all(/<img\b([^>]*)>/gi);
  const imgTotal = imgs.length;
  let missingAlt = 0;
  for (const at of imgs) if (!/alt\s*=/.test(at)) missingAlt++;

  const host = new URL(url).host;
  const links = all(/<a\b[^>]*href=["']([^"']+)["']/gi);
  let internal = 0,
    external = 0;
  for (const href of links) {
    if (/^https?:\/\//i.test(href))
      href.includes(host) ? internal++ : external++;
    else internal++;
  }

  const textLower = html.toLowerCase();
  const sections = {
    hero: /<h1\b|hero|above the fold|headline/.test(textLower),
    value_prop: /value prop|we help|we (do|are)|why choose|benefits/.test(
      textLower
    ),
    social_proof: /testimonial|review|trusted|logos?/.test(textLower),
    pricing: /pricing|price|plans?/.test(textLower),
    features: /feature|benefit|capabilit/.test(textLower),
    faq: /\bfaq\b|frequently asked|questions/.test(textLower),
    contact: /contact|get in touch|support/.test(textLower),
    footer: /privacy|terms|copyright/.test(textLower),
  };

  // Findings + audits + quick wins/backlog (kā analyze.ts)
  const findings = [];
  if (h1Count !== 1)
    findings.push({
      title: "Unclear Hero Heading Structure",
      recommendation: "Use exactly one H1 with a clear value proposition.",
      impact: "high",
    });
  if (!metaDesc || metaDesc.length < 140 || metaDesc.length > 160)
    findings.push({
      title: "Meta Description Not Optimized",
      recommendation: "Keep description ~150–160 chars with benefits and CTA.",
      impact: "medium",
    });
  if (!sections.social_proof)
    findings.push({
      title: "Insufficient Social Proof",
      recommendation: "Add testimonials/logos to build trust.",
      impact: "medium",
    });

  const q = (present: boolean, score: number) =>
    !present ? "poor" : score >= 2 ? "good" : score >= 1 ? "fair" : "poor";
  const content_audit = [
    {
      section: "hero",
      present: sections.hero,
      quality: q(sections.hero, h1Count ? 2 : 0),
      suggestion: "Add a strong headline and a clear CTA.",
    },
    {
      section: "value_prop",
      present: sections.value_prop,
      quality: q(sections.value_prop, metaDesc ? 2 : 1),
      suggestion: "Highlight key benefits in bullets.",
    },
    {
      section: "social_proof",
      present: sections.social_proof,
      quality: q(sections.social_proof, 0),
      suggestion: "Add testimonials or client logos.",
    },
    {
      section: "pricing",
      present: sections.pricing,
      quality: q(sections.pricing, 0),
      suggestion: "Show pricing/plans or at least 'from' price.",
    },
    {
      section: "features",
      present: sections.features,
      quality: q(sections.features, 1),
      suggestion: "Use concise bullets for scannability.",
    },
    {
      section: "faq",
      present: sections.faq,
      quality: q(sections.faq, 1),
      suggestion: "Provide collapsible FAQ with 6–10 Q&A.",
    },
    {
      section: "contact",
      present: sections.contact,
      quality: q(sections.contact, 1),
      suggestion: "Make phone/email and form easy to find.",
    },
    {
      section: "footer",
      present: sections.footer,
      quality: q(sections.footer, 1),
      suggestion: "Include legal links and newsletter/SM icons.",
    },
  ];

  const quick_wins: string[] = [];
  const prioritized_backlog: any[] = [];
  if (h1Count !== 1) {
    quick_wins.push("Set exactly one H1 with a clear value proposition.");
    prioritized_backlog.push({
      title: "Revamp the Hero Section",
      impact: 3,
      effort_days: 2,
      eta_days: 10,
      notes: "Strong value prop + visuals above the fold.",
      lift_percent: 20,
    });
  }
  if (!metaDesc) {
    quick_wins.push("Add a meta description of ~150–160 chars.");
    prioritized_backlog.push({
      title: "Write a Compelling Meta Description",
      impact: 2,
      effort_days: 0.5,
      eta_days: 1,
      lift_percent: 4,
    });
  } else if (metaDesc.length < 140 || metaDesc.length > 160) {
    quick_wins.push("Adjust meta description length to ~150–160 chars.");
    prioritized_backlog.push({
      title: "Tighten the Meta Description",
      impact: 1,
      effort_days: 0.5,
      eta_days: 1,
      lift_percent: 2,
    });
  }
  if (imgTotal > 0 && missingAlt > 0) {
    quick_wins.push(`Add ALT texts to ${missingAlt}/${imgTotal} images.`);
    prioritized_backlog.push({
      title: "Add ALT Texts to Images",
      impact: 2,
      effort_days: 1,
      eta_days: 2,
      lift_percent: Math.min(3, Math.round((missingAlt / imgTotal) * 10)),
    });
  }
  if (!sections.social_proof) {
    quick_wins.push("Add testimonials or client logos to build trust.");
    prioritized_backlog.push({
      title: "Implement a Testimonial Slider",
      impact: 2,
      effort_days: 3,
      eta_days: 7,
      lift_percent: 10,
    });
  }
  if (!sections.faq) {
    quick_wins.push("Add a concise, collapsible FAQ section.");
    prioritized_backlog.push({
      title: "Optimize the FAQ Section",
      impact: 2,
      effort_days: 2,
      eta_days: 5,
      lift_percent: 10,
    });
  }
  if (internal < 5) {
    quick_wins.push(
      "Add 5–10 internal links to key pages (product, pricing, contact, FAQ)."
    );
    prioritized_backlog.push({
      title: "Increase Internal Links",
      impact: 1,
      effort_days: 1,
      eta_days: 2,
      lift_percent: 3,
    });
  }

  return {
    page: { url, title },
    assets: { screenshot_url: buildScreenshotUrl(url) },
    screenshots: { hero: buildScreenshotUrl(url) },
    sections_detected: sections,
    findings,
    content_audit,
    quick_wins,
    prioritized_backlog,
    meta: { title, description: metaDesc, canonical: canonical || undefined },
    seo: {
      h1Count,
      h2Count,
      h3Count,
      canonicalPresent: !!canonical,
      metaDescriptionPresent: !!metaDesc,
    },
    links: { total: links.length, internal, external },
    images: { total: imgTotal, missingAlt },
    robots: {
      robotsTxtUrl: `${new URL(url).origin}/robots.txt`,
      robotsTxtOk: null,
      sitemapUrlGuess: `${new URL(url).origin}/sitemap.xml`,
      sitemapOk: null,
    },
  };
}

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url") || "";
  const mode = (searchParams.get("mode") || "full") as Mode;
  const url = normalizeUrl(rawUrl);
  if (!url) {
    return new Response("Missing url", { status: 400 });
  }

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          send(controller, "progress", { value: 5 });

          const { html } = await fetchText(url);
          send(controller, "progress", { value: 30 });

          const data = baseAnalyze(url, html);
          send(controller, "progress", { value: 75 });

          // For “free” we varētu apcirpt, bet atstājam to pašu — UI izlems, ko rādīt
          send(controller, "result", data);
          send(controller, "progress", { value: 100 });
          controller.close();
        } catch (err: any) {
          send(controller, "error", {
            message: err?.message || "Stream failed",
          });
          controller.close();
        }
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    }
  );
}
