import React, { useEffect, useMemo, useRef, useState } from "react";
import { runAnalyze } from "../lib/analyzeClient";
import { StatusBar } from "./StatusBar";

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

function normalizeUrl(input: string): string {
  let s = (input ?? "").trim();
  if (!s) return s;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol))
      throw new Error("bad protocol");
    u.hash = "";
    return u.toString();
  } catch {
    return s;
  }
}

function safePct(n?: number) {
  if (typeof n === "number" && isFinite(n))
    return Math.max(0, Math.min(100, n));
  return 0;
}

export default function FreeReport() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalyzeData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const rafRef = useRef<number | null>(null);

  const scores = useMemo(() => {
    const d = data;
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
  }, [data]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      abortRef.current?.abort();
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

  async function onAnalyze(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim()) return;
    const url = normalizeUrl(input);

    setErr(null);
    setData(null);
    setLoading(true);
    startProgress();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await runAnalyze(url, controller.signal);
    setLoading(false);

    if ((res as any).ok) {
      setData((res as any).data as AnalyzeData);
      setProgress(100);
    } else {
      setErr((res as any).error || "Analyze failed");
      setProgress(0);
    }
  }

  const niceUrl = useMemo(
    () => (data ? data.finalUrl || data.url || "" : ""),
    [data]
  );

  return (
    <div className="w-full border rounded-2xl p-4 md:p-6 bg-white">
      <h2 className="text-xl font-semibold mb-3">Free report</h2>

      {/* Input */}
      <form
        onSubmit={onAnalyze}
        className="flex flex-col md:flex-row gap-2 mb-4"
      >
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="piem., example.com vai https://example.com"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          disabled={loading || !input.trim()}
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </form>

      {/* Progress */}
      {loading && (
        <div className="mb-4">
          <StatusBar active={true} />
          <div className="mt-2 text-sm text-gray-600">
            Progress: {Math.round(progress)}%
          </div>
        </div>
      )}

      {/* Error */}
      {err && <p className="text-red-600 mb-4 text-sm">{err}</p>}

      {/* Result */}
      {data && !loading && (
        <div className="space-y-4">
          <div className="text-sm text-gray-700">
            <div>
              <b>URL:</b> {niceUrl}
            </div>
            <div>
              <b>Fetched:</b>{" "}
              {data.fetchedAt ? new Date(data.fetchedAt).toLocaleString() : "—"}
            </div>
            <div>
              <b>HTTP status:</b> {data.httpStatus ?? "—"}
            </div>
            <div>
              <b>Language:</b> {data.meta?.lang ?? "—"}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <section className="border rounded p-3">
              <h3 className="font-medium mb-1">Meta</h3>
              <ul className="text-sm list-disc pl-5">
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
            </section>

            <section className="border rounded p-3">
              <h3 className="font-medium mb-1">Headings</h3>
              <p className="text-sm">
                H1 / H2 / H3: {data.seo?.h1Count ?? 0} /{" "}
                {data.seo?.h2Count ?? 0} / {data.seo?.h3Count ?? 0}
              </p>
            </section>

            <section className="border rounded p-3">
              <h3 className="font-medium mb-1">Links</h3>
              <p className="text-sm">
                Total: {data.links?.total ?? 0} · Internal:{" "}
                {data.links?.internal ?? 0} · External:{" "}
                {data.links?.external ?? 0}
              </p>
            </section>

            <section className="border rounded p-3">
              <h3 className="font-medium mb-1">Images</h3>
              <p className="text-sm">
                Total: {data.images?.total ?? 0} · Missing ALT:{" "}
                {data.images?.missingAlt ?? 0}
              </p>
            </section>

            <section className="border rounded p-3 md:col-span-2">
              <h3 className="font-medium mb-1">Robots / Sitemap</h3>
              <ul className="list-disc pl-5 text-sm">
                <li>
                  <b>robots.txt:</b>{" "}
                  {data.robots?.robotsTxtOk === null
                    ? "n/a"
                    : data.robots?.robotsTxtOk
                    ? "OK"
                    : "Not found"}
                </li>
                <li>
                  <b>sitemap:</b>{" "}
                  {data.robots?.sitemapOk === null
                    ? "n/a"
                    : data.robots?.sitemapOk
                    ? "OK"
                    : "Not found"}
                </li>
              </ul>
            </section>
          </div>

          {/* Vienkāršs score vizuāli */}
          <section className="border rounded p-3">
            <h3 className="font-medium mb-1">Score (auto)</h3>
            <div className="text-sm">
              <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-black"
                  style={{ width: `${safePct(scores.overall)}%` }}
                />
              </div>
              <div className="mt-2">
                Overall: {safePct(scores.overall)} / 100
              </div>

              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-600">Structure</div>
                  <div className="mt-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-gray-800"
                      style={{ width: `${safePct(scores.structure)}%` }}
                    />
                  </div>
                  <div className="text-xs mt-1">
                    {safePct(scores.structure)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Content</div>
                  <div className="mt-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-gray-800"
                      style={{ width: `${safePct(scores.content)}%` }}
                    />
                  </div>
                  <div className="text-xs mt-1">{safePct(scores.content)}%</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
