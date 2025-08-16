// src/components/GradeBadge.tsx
import React from "react";
import { letterFromScore } from "../lib/grading";

export function GradeBadge({ score }: { score: number }) {
  const letter = letterFromScore(score);
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-sm text-slate-500">Your Website’s Grade</div>
      <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full bg-[#006D77] transition-all"
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <div className="text-lg font-semibold">{score} / 100</div>
        <div className="text-sm px-2 py-0.5 rounded bg-slate-100 border">
          Grade: <b>{letter}</b>
        </div>
      </div>
    </div>
  );
}
