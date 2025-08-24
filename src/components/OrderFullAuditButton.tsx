// src/components/OrderFullAuditButton.tsx
import React from "react";

function normalizeUrl(input: string): string {
  let s = (input || "").trim();
  if (!s) return s;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    u.hash = "";
    return u.toString();
  } catch {
    return s;
  }
}

function getLastAnalyzedUrlLocal(): string | null {
  try {
    if (typeof sessionStorage !== "undefined") {
      // mēģinām vairākus iespējamos atslēgvārdus
      const keys = [
        "holbox:lastAnalyzedUrl",
        "lastAnalyzedUrl",
        "holbox:last-url",
      ];
      for (const k of keys) {
        const v = sessionStorage.getItem(k);
        if (v && v.trim()) return v;
      }
    }
  } catch {}
  return null;
}

type Props = {
  /** Ja vēlies, iedod pašreiz ievadīto URL no inputa kā rezerves variantu */
  fallbackUrl?: string;
  /** Saglabā savas klases/stilus */
  className?: string;
  children?: React.ReactNode;
};

export default function OrderFullAuditButton({
  fallbackUrl,
  className,
  children,
}: Props) {
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();

    const stored = getLastAnalyzedUrlLocal();
    const candidate = stored || fallbackUrl || "";
    const u = candidate ? normalizeUrl(candidate) : "";

    const href = `/full?autostart=1${u ? `&url=${encodeURIComponent(u)}` : ""}`;
    window.location.href = href;
  };

  return (
    <button onClick={onClick} className={className}>
      {children ?? "Order Full Audit"}
    </button>
  );
}
