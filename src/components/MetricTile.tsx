// src/components/MetricTile.tsx
import React, { useEffect, useRef, useState } from "react";

export function MetricTile({ label, value }: { label: string; value: number }) {
  const [n, setN] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 1000;
    const from = 0;
    const to = value;

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(from + (to - from) * p));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);

  return (
    <div className="rounded-2xl border bg-white p-5 text-center">
      <div className="text-3xl md:text-4xl font-semibold">
        {n.toLocaleString()}
      </div>
      <div className="mt-1 text-sm text-slate-600">{label}</div>
    </div>
  );
}
