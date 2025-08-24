// src/components/OrderFullAuditButton.tsx
import React from "react";
import { getLastAnalyzedUrl } from "../lib/analyzeClient";

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

type Props = {
  /** Ja vēlies, iedod pašreiz ievadīto URL no inputa kā rezerves variantu */
  fallbackUrl?: string;
  /** Pielāgo savas klases, lai dizains paliek **tieši tāds pats** kā tev bija */
  className?: string;
  children?: React.ReactNode; // piemēram, “Order Full Audit”
};

export default function OrderFullAuditButton({
  fallbackUrl,
  className,
  children,
}: Props) {
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();

    const last = getLastAnalyzedUrl();
    const candidate = last || fallbackUrl || "";
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
