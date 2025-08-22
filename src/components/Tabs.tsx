// src/components/Tabs.tsx
import React from "react";

export type Tab = { id: string; label: string };

export function Tabs({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={`w-full ${className}`}>
      <div className="flex flex-wrap gap-2 border-b">
        {tabs.map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`px-3 md:px-4 py-2 rounded-t-lg text-sm md:text-base border ${
                active
                  ? "bg-white border-slate-300 text-slate-900"
                  : "bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
