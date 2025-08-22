import React from "react";

const items = [
  {
    title: "40+ UX/SEO/CRO checks",
    desc: "We scan layout, message clarity, forms and performance cues.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        <path
          d="M7 7h10M7 12h10M7 17h6"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    ),
  },
  {
    title: "Annotated screenshots",
    desc: "We mark exactly where & why to fix.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        <path
          d="M4 6h4l2-2h4l2 2h4v12H4z"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    ),
  },
  {
    title: "Prioritized To-Do list",
    desc: "Impact vs Effort — hand straight to dev/freelancer.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        <path
          d="M5 7h14M5 12h10M5 17h8"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    ),
  },
  {
    title: "Quick Wins",
    desc: "3–5 easy changes you can do today.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        <path
          d="m5 13 4 4L19 7"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    ),
  },
  {
    title: "Copy suggestions",
    desc: "AI drafts stronger headlines & CTAs you can adapt.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        <path
          d="M5 4h14v6H5zM5 14h8v6H5z"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    ),
  },
  {
    title: "Benchmarks",
    desc: "See position vs similar sites by vertical.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        <path
          d="M4 20V8m6 12V4m6 16v-6m4 6H2"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    ),
  },
];

export default function Features({
  onPrimaryClick,
}: {
  onPrimaryClick?: () => void;
}) {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-14">
      <h3 className="text-2xl md:text-3xl font-semibold">Features</h3>
      <p className="text-slate-600 mt-2">
        Everything you need to evaluate a landing page and keep your team
        accountable.
      </p>

      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((it, i) => (
          <div
            key={i}
            className="rounded-2xl border bg-white p-5 hover:shadow-sm transition"
          >
            <div className="h-10 w-10 rounded-xl bg-[#EAF4F3] text-[#006D77] grid place-items-center">
              <div className="fill-current">{it.icon}</div>
            </div>
            <div className="mt-3 font-medium">{it.title}</div>
            <p className="text-sm text-slate-600 mt-1">{it.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <button
          onClick={onPrimaryClick}
          className="rounded-xl px-5 py-3 bg-[#006D77] text-white font-medium hover:opacity-90"
        >
          Run Free Test
        </button>
      </div>
    </section>
  );
}
