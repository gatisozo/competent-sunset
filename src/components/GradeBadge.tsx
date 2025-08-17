import React from "react";

/** Lokāla vērtējuma funkcija */
function letterFromScore(score = 0) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

const gradeColors: Record<string, string> = {
  A: "bg-emerald-500 text-white ring-emerald-400",
  B: "bg-lime-500 text-white ring-lime-400",
  C: "bg-amber-500 text-white ring-amber-400",
  D: "bg-orange-500 text-white ring-orange-400",
  F: "bg-rose-600 text-white ring-rose-500",
};

export default function GradeBadge({
  score,
  size = "lg",
  label = "Grade",
}: {
  score?: number;
  size?: "md" | "lg" | "xl";
  label?: string;
}) {
  const s = typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;
  const letter = letterFromScore(s);
  const style = gradeColors[letter] || gradeColors["F"];

  const dims =
    size === "xl"
      ? "h-24 w-24 text-5xl"
      : size === "lg"
      ? "h-20 w-20 text-4xl"
      : "h-16 w-16 text-3xl";

  return (
    <div className="flex items-center gap-4">
      <div
        className={`grid place-items-center rounded-2xl ring-4 ${style} ${dims} shadow-md`}
        aria-label={`${label}: ${letter}`}
        title={`${label}: ${letter} (${s}/100)`}
      >
        <span className="font-bold leading-none">{letter}</span>
      </div>
      <div className="text-slate-700">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="text-xl font-semibold">{s} / 100</div>
      </div>
    </div>
  );
}
