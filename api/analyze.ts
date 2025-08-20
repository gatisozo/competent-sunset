// api/analyze.ts
// Vercel Node Function (compatible with Node.js runtime on Vercel)
type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string; code?: string };

type AnalyzeResult = {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  httpStatus: number;
  meta: {
    title?: string;
    description?: string;
    lang?: string;
    viewport?: string;
    canonical?: string;
  };
  seo: {
    h1Count: number;
    h2Count: number;
    h3Count: number;
    canonicalPresent: boolean;
    metaDescriptionPresent: boolean;
  };
  social: {
    og: Record<string, string | undefined>;
    twitter: Record<string, string | undefined>;
  };
  links: { total: number; internal: number; external: number };
  images: { total: number; missingAlt: number };
  robots: {
    robotsTxtUrl: string;
    robotsTxtOk: boolean | null;
    sitemapUrlGuess: string;
    sitemapOk: boolean | null;
  };
  headingsOutline: Array<{ tag: string; text: string }>;
};

function json(res: any, status: number, body: any) {
  res
    .status(status)
    .setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.send(JSON.stringify(body));
}

function normalizeUrl(input: string): URL {
  let s = (input ?? "").trim();
  if (!s) throw new Error('Missing "url" parameter');
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (!["http:", "https:"].includes(u.protocol))
    throw new Error("Only http(s) URLs are allowed");
  return u;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function extractBetween(html: string, start: string, end: string): string[] {
  const res: string[] = [];
  let i = 0;
  for (;;) {
    const s = html.indexOf(start, i);
    if (s === -1) break;
    const e = html.indexOf(end, s + start.length);
    if (e === -1) break;
    res.push(html.slice(s + start.length, e));
    i = e + end.length;
  }
  return res;
}
function attrOf(tag: string, name: string): string | undefined {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m?.[2] ?? m?.[3] ?? undefined;
}
async function headOrGetOk(url: string, init?: RequestInit) {
  try {
    // Node 18+ has global fetch on Vercel
    let r = await fetch(url, { method: "HEAD", redirect: "follow", ...init });
    if (r.ok) return true;
    r = await fetch(url, { method: "GET", redirect: "follow", ...init });
    return r.ok;
  } catch {
    return false;
  }
}

// Default export for Vercel Node Function
export default async function handler(req: any, res: any) {
  try {
    const method = (req.method || "GET").toUpperCase();

    let inputUrl = "";
    if (method === "GET") {
      inputUrl = (req.query?.url ?? "").toString();
    } else if (method === "POST") {
      inputUrl = (req.body?.url ?? "").toString();
    }

    let target: URL;
    try {
      target = normalizeUrl(inputUrl);
    } catch (e: any) {
      const err: Err = {
        ok: false,
        error: e?.message || "Invalid URL",
        code: "INVALID_URL",
      };
      return json(res, 400, err);
    }

    // Fetch page (timeout approx via AbortController)
    const controller = new AbortController();
    const tm = setTimeout(() => controller.abort(), 15000);
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    let resp: Response;
    try {
      resp = await fetch(target.toString(), {
        redirect: "follow",
        headers: {
          "user-agent": ua,
          accept: "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      });
    } catch (e: any) {
      clearTimeout(tm);
      const err: Err = {
        ok: false,
        error: `Failed to fetch target: ${e?.message ?? "fetch failed"}`,
        code: "FETCH_ERROR",
      };
      return json(res, 502, err);
    } finally {
      clearTimeout(tm);
    }

    const status = (resp as any).status;
    const html = await resp.text();
    const head = html.slice(0, 200_000);

    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
    const title = titleMatch ? stripTags(titleMatch[1]) : undefined;

    const metaContent = (n: string) => {
      const re = new RegExp(
        `<meta[^>]+(?:name|property)\\s*=\\s*["']${n}["'][^>]*?(?:content\\s*=\\s*("([^"]*)"|'([^']*)'))?[^>]*>`,
        "i"
      );
      const m = re.exec(head);
      return (m?.[2] ?? m?.[3])?.trim();
    };
    const description = metaContent("description");
    const viewport = metaContent("viewport");
    const canonical = (() => {
      const m = /<link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i.exec(head);
      return m ? attrOf(m[0], "href") : undefined;
    })();

    const htmlTag = /<html[^>]*>/i.exec(html)?.[0] ?? "";
    const lang = attrOf(htmlTag, "lang");

    const og = [
      "og:title",
      "og:description",
      "og:image",
      "og:url",
      "og:type",
    ].reduce(
      (acc, k) => ((acc[k] = metaContent(k)), acc),
      {} as Record<string, string | undefined>
    );
    const twitter = [
      "twitter:card",
      "twitter:title",
      "twitter:description",
      "twitter:image",
    ].reduce(
      (acc, k) => ((acc[k] = metaContent(k)), acc),
      {} as Record<string, string | undefined>
    );

    const headings: Array<{ tag: string; text: string }> = [];
    for (let level = 1; level <= 6; level++) {
      const r = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi");
      let m: RegExpExecArray | null;
      while ((m = r.exec(html))) {
        headings.push({ tag: `h${level}`, text: stripTags(m[1]) });
      }
    }
    const h1Count = headings.filter((h) => h.tag === "h1").length;
    const h2Count = headings.filter((h) => h.tag === "h2").length;
    const h3Count = headings.filter((h) => h.tag === "h3").length;

    // Links
    const origin = new URL((resp as any).url || target.toString()).origin;
    const aChunks = extractBetween(html, "<a", ">");
    let linksTotal = 0,
      linksInternal = 0,
      linksExternal = 0;
    for (const raw of aChunks) {
      const tag = "<a" + raw + ">";
      const href = attrOf(tag, "href");
      if (!href) continue;
      linksTotal++;
      try {
        const u = new URL(href, origin);
        if (u.origin === origin) linksInternal++;
        else linksExternal++;
      } catch {}
    }

    // Images
    const imgChunks = extractBetween(html, "<img", ">");
    let imgTotal = 0,
      imgMissingAlt = 0;
    for (const raw of imgChunks) {
      const tag = "<img" + raw + ">";
      imgTotal++;
      const alt = attrOf(tag, "alt");
      if (!alt || !alt.trim()) imgMissingAlt++;
    }

    // robots/sitemap (best effort)
    const site = new URL((resp as any).url || target.toString());
    const robotsTxtUrl = `${site.origin}/robots.txt`;
    const sitemapGuess = `${site.origin}/sitemap.xml`;
    const robotsTxtOk = await headOrGetOk(robotsTxtUrl);
    const sitemapOk = await headOrGetOk(sitemapGuess);

    const data: AnalyzeResult = {
      url: target.toString(),
      finalUrl: (resp as any).url || target.toString(),
      fetchedAt: new Date().toISOString(),
      httpStatus: status,
      meta: { title, description, lang, viewport, canonical },
      seo: {
        h1Count,
        h2Count,
        h3Count,
        canonicalPresent: !!canonical,
        metaDescriptionPresent: !!description && description.length > 0,
      },
      social: { og, twitter },
      links: {
        total: linksTotal,
        internal: linksInternal,
        external: linksExternal,
      },
      images: { total: imgTotal, missingAlt: imgMissingAlt },
      robots: {
        robotsTxtUrl,
        robotsTxtOk,
        sitemapUrlGuess: sitemapGuess,
        sitemapOk,
      },
      headingsOutline: headings,
    };

    const ok: Ok<AnalyzeResult> = { ok: true, data };
    return json(res, 200, ok);
  } catch (e: any) {
    const err: Err = {
      ok: false,
      error: e?.message ?? "Unknown error",
      code: "UNEXPECTED",
    };
    return json(res, 500, err);
  }
}
