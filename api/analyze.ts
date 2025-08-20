// api/analyze.ts
export const runtime = "edge";

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

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function normalizeUrl(input: string): URL {
  let s = (input ?? "").trim();
  if (!s) throw new Error('Missing "url" parameter');
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (!["http:", "https:"].includes(u.protocol)) {
    throw new Error("Only http(s) URLs are allowed");
  }
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

async function safeHeadOrGet(url: string, init?: RequestInit) {
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", ...init });
    if (r.ok) return { ok: true };
    r = await fetch(url, { method: "GET", redirect: "follow", ...init });
    return { ok: r.ok };
  } catch {
    return { ok: false };
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const method = req.method.toUpperCase();
    let inputUrl = searchParams.get("url") ?? "";
    if (method === "POST" && !inputUrl) {
      const body = await req.json().catch(() => ({} as any));
      inputUrl = (body?.url ?? "").toString();
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
      return new Response(JSON.stringify(err), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    // Fetch (15s timeout)
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
      return new Response(JSON.stringify(err), {
        status: 502,
        headers: JSON_HEADERS,
      });
    } finally {
      clearTimeout(tm);
    }

    const status = resp.status;
    const html = await resp.text();
    const headChunk = html.slice(0, 200_000);

    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(headChunk)?.[1];
    const getMeta = (n: string) => {
      const re = new RegExp(
        `<meta[^>]+(?:name|property)\\s*=\\s*["']${n}["'][^>]*?(?:content\\s*=\\s*("([^"]*)"|'([^']*)'))?[^>]*>`,
        "i"
      );
      const m = re.exec(headChunk);
      return (m?.[2] ?? m?.[3])?.trim();
    };
    const description = getMeta("description");
    const viewport = getMeta("viewport");
    const canonical = /<link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i.exec(
      headChunk
    )
      ? attrOf(
          /<link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i.exec(headChunk)![0],
          "href"
        )
      : undefined;

    const htmlTag = /<html[^>]*>/i.exec(html)?.[0] ?? "";
    const lang = attrOf(htmlTag, "lang");

    const og = [
      "og:title",
      "og:description",
      "og:image",
      "og:url",
      "og:type",
    ].reduce(
      (a, k) => ((a[k] = getMeta(k)), a),
      {} as Record<string, string | undefined>
    );
    const twitter = [
      "twitter:card",
      "twitter:title",
      "twitter:description",
      "twitter:image",
    ].reduce(
      (a, k) => ((a[k] = getMeta(k)), a),
      {} as Record<string, string | undefined>
    );

    const headings: Array<{ tag: string; text: string }> = [];
    for (let level = 1; level <= 6; level++) {
      const r = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi");
      let m: RegExpExecArray | null;
      while ((m = r.exec(html)))
        headings.push({ tag: `h${level}`, text: stripTags(m[1]) });
    }
    const h1Count = headings.filter((h) => h.tag === "h1").length;
    const h2Count = headings.filter((h) => h.tag === "h2").length;
    const h3Count = headings.filter((h) => h.tag === "h3").length;

    const origin = new URL(resp.url).origin;
    const aTags = extractBetween(html, "<a", ">");
    let total = 0,
      internal = 0,
      external = 0;
    for (const raw of aTags) {
      const tag = "<a" + raw + ">";
      const href = attrOf(tag, "href");
      if (!href) continue;
      total++;
      try {
        const u = new URL(href, origin);
        if (u.origin === origin) internal++;
        else external++;
      } catch {}
    }

    const imgTags = extractBetween(html, "<img", ">");
    let imgTotal = 0,
      imgMissingAlt = 0;
    for (const raw of imgTags) {
      const tag = "<img" + raw + ">";
      imgTotal++;
      const alt = attrOf(tag, "alt");
      if (!alt || !alt.trim()) imgMissingAlt++;
    }

    const site = new URL(resp.url);
    const robotsTxtUrl = `${site.origin}/robots.txt`;
    const sitemapUrlGuess = `${site.origin}/sitemap.xml`;
    const robotsTxtOk = (await safeHeadOrGet(robotsTxtUrl)).ok;
    const sitemapOk = (await safeHeadOrGet(sitemapUrlGuess)).ok;

    const data: AnalyzeResult = {
      url: target.toString(),
      finalUrl: resp.url,
      fetchedAt: new Date().toISOString(),
      httpStatus: status,
      meta: {
        title: title ? stripTags(title) : undefined,
        description,
        lang,
        viewport,
        canonical,
      },
      seo: {
        h1Count,
        h2Count,
        h3Count,
        canonicalPresent: !!canonical,
        metaDescriptionPresent: !!description && description.length > 0,
      },
      social: { og, twitter },
      links: { total, internal, external },
      images: { total: imgTotal, missingAlt: imgMissingAlt },
      robots: {
        robotsTxtUrl,
        robotsTxtOk,
        sitemapUrlGuess,
        sitemapOk,
      },
      headingsOutline: headings,
    };

    const ok: Ok<AnalyzeResult> = { ok: true, data };
    return new Response(JSON.stringify(ok), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (e: any) {
    const err: Err = {
      ok: false,
      error: e?.message ?? "Unknown error",
      code: "UNEXPECTED",
    };
    return new Response(JSON.stringify(err), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
