// api/analyze.ts
// JSON endpoint for the Free report.
// Accepts: GET ?url=...  or  POST { url: "..."} (http/https prefix optional)

const UA = "Mozilla/5.0 (compatible; HolboxAudit/1.0; +https://example.com)";

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
  headingsOutline?: Array<{ tag: string; text: string }>;
};

function ok(res: any, obj: any) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}
function bad(res: any, code: number, message: string) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: false, error: message }));
}

function normalizeUrl(u: string) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`;
}

async function fetchText(u: string) {
  const r = await fetch(u, { headers: { "user-agent": UA } });
  const text = await r.text();
  return { status: r.status, url: r.url, text };
}

function stripTags(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function extract(html: string, re: RegExp) {
  const m = html.match(re);
  return m ? m[1]?.trim() : undefined;
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

export default async function handler(req: any, res: any) {
  try {
    const method = (req.method || "GET").toUpperCase();
    const body = method === "POST" ? await readBody(req) : null;
    const qUrl = (req.query?.url as string) || (body?.url as string) || "";
    const url = normalizeUrl(qUrl);
    if (!url) return bad(res, 400, "Missing URL");

    // fetch html
    const { status, url: finalUrl, text: html } = await fetchText(url);

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

    const headingsOutline = parseHeadings(html);
    const h1Count = countTags(html, "h1");
    const h2Count = countTags(html, "h2");
    const h3Count = countTags(html, "h3");
    const { total: imgTotal, missing: missingAlt } = countImgsMissingAlt(html);

    const baseHost = (() => {
      try {
        const u = new URL(finalUrl || url);
        return u.host;
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
      robotsTxtOk = await fetchHead(robotsTxtUrl);
      sitemapOk = await fetchHead(sitemapUrlGuess);
    }

    const data: AnalyzeData = {
      finalUrl,
      url,
      fetchedAt: new Date().toISOString(),
      httpStatus: status,
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
      robots: { robotsTxtUrl, robotsTxtOk, sitemapUrlGuess, sitemapOk },
      headingsOutline,
    };

    return ok(res, { ok: true, data });
  } catch (e: any) {
    console.error(e);
    return bad(res, 500, e?.message || "Analyze failed");
  }
}

function readBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let buf = "";
    req.on("data", (c: Buffer) => (buf += c.toString("utf8")));
    req.on("end", () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch {
        resolve({});
      }
    });
  });
}
