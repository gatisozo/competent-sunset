// src/components/SmartShot.tsx
import React, { useEffect, useState } from "react";

function buildShot(url: string) {
  const env = (import.meta as any).env || {};
  const tmpl = env.VITE_SCREENSHOT_URL_TMPL || (env as any).SCREENSHOT_URL_TMPL;
  if (tmpl) {
    return tmpl.replace("{URL}", encodeURIComponent(url));
  }
  // Microlink fallback
  // cache-buster via cb= timestamp
  return `https://image.microlink.io/${encodeURIComponent(
    url
  )}?cb=${Date.now()}`;
}

export function SmartShot({
  url,
  className = "",
}: {
  url: string;
  className?: string;
}) {
  const [src, setSrc] = useState(buildShot(url));
  const [tries, setTries] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSrc(buildShot(url));
    setTries(0);
    setLoading(true);
  }, [url]);

  return (
    <div
      className={`relative rounded-xl border bg-white overflow-hidden ${className}`}
    >
      {loading && (
        <div className="absolute inset-0 grid place-items-center text-slate-500 text-sm">
          Capturing screenshot…
        </div>
      )}
      <img
        src={src}
        alt="Page screenshot"
        className={`w-full h-auto block ${
          loading ? "opacity-0" : "opacity-100"
        } transition-opacity`}
        onLoad={() => setLoading(false)}
        onError={() => {
          if (tries < 3) {
            setTries(tries + 1);
            setSrc(buildShot(url) + `&retry=${tries + 1}`);
          } else {
            setLoading(false);
          }
        }}
      />
    </div>
  );
}
