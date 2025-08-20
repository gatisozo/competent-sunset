// src/components/StatusBar.tsx
import { useEffect, useMemo, useState } from "react";

type Step = { label: string; at: number };

const DEFAULT_STEPS: Step[] = [
  { label: "Starting", at: 5 },
  { label: "Fetching", at: 25 },
  { label: "Parsing", at: 60 },
  { label: "Scoring", at: 85 },
  { label: "Done", at: 100 },
];

export function StatusBar({ active }: { active: boolean }) {
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState("Starting");

  // Plūdena animācija līdz 90% gaidīšanas laikā; uz 100% — kad active=false
  useEffect(() => {
    if (!active) {
      setPct(100);
      setLabel("Done");
      return;
    }
    let mounted = true;
    let p = 0;
    const id = setInterval(() => {
      if (!mounted) return;
      p = Math.min(p + Math.random() * 6 + 1, 90); // lēnām līdz ~90
      setPct(p);
    }, 300);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [active]);

  // Etiķetes pēc robežām
  useEffect(() => {
    const steps = DEFAULT_STEPS;
    const current = steps
      .slice()
      .reverse()
      .find((s) => pct >= s.at);
    if (current) setLabel(current.label);
  }, [pct]);

  const barStyle = useMemo(
    () => ({ width: `${pct}%`, transition: "width 200ms linear" }),
    [pct]
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1 text-xs text-gray-600">
        <span>Status: {label}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-2 bg-black rounded-full" style={barStyle} />
      </div>
    </div>
  );
}
