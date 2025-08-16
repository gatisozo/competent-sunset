// src/components/BlurPanel.tsx
import React from "react";

export function BlurPanel({
  title,
  onOrder,
  onSample,
}: {
  title: string;
  onOrder: () => void;
  onSample?: () => void;
}) {
  return (
    <div className="relative rounded-2xl border overflow-hidden">
      <div className="absolute inset-0 backdrop-blur-md bg-white/60" />
      <div className="relative p-6 md:p-10 grid place-items-center text-center">
        <div className="text-lg md:text-xl font-semibold">{title}</div>
        <div className="mt-2 text-slate-600 max-w-prose">
          Unlock detailed findings with annotated screenshots and step-by-step
          fixes.
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onOrder}
            className="rounded-xl px-5 py-3 bg-[#FFDDD2] text-slate-900 font-medium hover:opacity-90"
          >
            Order Full Audit — $50
          </button>
          {onSample && (
            <button
              onClick={onSample}
              className="rounded-xl px-5 py-3 border font-medium hover:bg-slate-50"
            >
              See Sample
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
