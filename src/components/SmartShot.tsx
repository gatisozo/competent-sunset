import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  url: string;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
  crop?: "hero" | "full"; // rezervēts, ja vēlāk gribi kropēt serverī
  width?: number; // vēlamais platums screenshot servisam
};

type Provider = (absUrl: string, width: number) => string;

const wpMshots: Provider = (u, w) =>
  `https://s.wordpress.com/mshots/v1/${encodeURIComponent(u)}?w=${w}`;

const microlink: Provider = (u, _w) =>
  // Microlink image endpoint (vienkāršs, bez API atslēgām)
  `https://image.microlink.io/${encodeURIComponent(u)}`;

const thumio: Provider = (u, w) =>
  `https://image.thum.io/get/width/${w}/noanimate/${encodeURIComponent(u)}`;

/** Normalizē URL uz absolūtu https://… */
function toAbs(input: string) {
  try {
    const u = new URL(input);
    return u.toString();
  } catch {
    return input.startsWith("http") ? input : `https://${input}`;
  }
}

export default function SmartShot({
  url,
  className,
  style,
  alt = "Website screenshot",
  width = 1200,
}: Props) {
  const abs = useMemo(() => toAbs(url), [url]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [finalSrc, setFinalSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const triesRef = useRef(0);

  // Provideru secība; vari mainīt, ja kāds sniedzējs biežāk kļūdās tavā reģionā
  const providers: Provider[] = useMemo(
    () => [wpMshots, microlink, thumio, (u) => u],
    []
  );

  useEffect(() => {
    setIdx(0);
    setLoading(true);
    setErr(null);
    setFinalSrc(null);
    triesRef.current = 0;
  }, [abs]);

  const src = useMemo(
    () => providers[idx](abs, width),
    [providers, idx, abs, width]
  );

  function handleError() {
    triesRef.current += 1;
    if (idx < providers.length - 1) {
      setIdx((i) => i + 1);
    } else {
      setErr("Could not load screenshot (site may not resolve/DNS).");
      setLoading(false);
    }
  }

  function handleLoad() {
    setFinalSrc(src);
    setLoading(false);
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-white ${
        className || ""
      }`}
      style={style}
      aria-busy={loading}
    >
      {/* Spinner / stāvoklis */}
      {loading && (
        <div className="absolute inset-0 grid place-items-center text-slate-500 text-sm">
          <div className="animate-pulse">Loading preview…</div>
        </div>
      )}

      {!loading && err && (
        <div className="absolute inset-0 grid place-items-center text-slate-600 text-sm p-4 text-center">
          <div>
            <div className="font-medium mb-1">No screenshot available</div>
            <div className="opacity-80">{err}</div>
          </div>
        </div>
      )}

      {/* Pat ja kļūda, turpinām mēģināt nākamo provideru */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img
        src={src}
        alt={alt}
        onError={handleError}
        onLoad={handleLoad}
        style={{
          display: finalSrc === src ? "block" : "block",
          width: "100%",
          height: "auto",
        }}
      />
    </div>
  );
}
