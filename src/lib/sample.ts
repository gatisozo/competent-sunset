import type {
  FullReport,
  Impact,
  Suggestion,
  ContentAuditItem,
} from "./analyze";

/** Helpers */
const hi: Impact = "high";
const med: Impact = "medium";
const low: Impact = "low";

function mshot(u: string) {
  const abs = u.startsWith("http") ? u : `https://${u}`;
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(abs)}?w=1200`;
}

/** Reusable suggestion snippets */
const heroSuggestions: Suggestion[] = [
  {
    title: "Hero value unclear",
    impact: hi,
    recommendation:
      "State the core benefit in the first line and keep CTAs above the fold.",
  },
  {
    title: "Weak CTA contrast",
    impact: med,
    recommendation:
      "Increase color contrast and add hover/focus styles to the primary button.",
  },
  {
    title: "Slow hero image",
    impact: low,
    recommendation:
      "Serve responsive images (srcset) and consider preloading the hero asset.",
  },
];

const nextSectionSuggestions: Suggestion[] = [
  {
    title: "Value prop is vague",
    impact: med,
    recommendation: "Use concrete outcomes and remove filler text.",
  },
  {
    title: "Missing trust indicators",
    impact: med,
    recommendation: "Add testimonials or client logos for social proof.",
  },
];

const findings: Suggestion[] = [
  ...heroSuggestions,
  ...nextSectionSuggestions.slice(0, 1),
];

const contentAudit: ContentAuditItem[] = [
  {
    section: "hero",
    present: true,
    quality: "poor",
    suggestion: "Tighten headline; add strong CTA.",
  },
  {
    section: "value prop",
    present: true,
    quality: "ok",
    suggestion: "Clarify copy with measurable outcomes.",
  },
  {
    section: "social proof",
    present: false,
    suggestion: "Add 2–3 testimonials or client logos.",
  },
  {
    section: "features",
    present: true,
    quality: "ok",
    suggestion: "Group features into 3–5 bullets with benefits.",
  },
  {
    section: "pricing",
    present: false,
    suggestion: "Add pricing info or a clear 'Talk to sales' alternative.",
  },
  {
    section: "faq",
    present: true,
    quality: "ok",
    suggestion: "Use accordion for readability and link to policies.",
  },
  { section: "contact", present: true, quality: "good" },
  { section: "footer", present: true, quality: "good" },
];

export function sampleFull(url: string): FullReport {
  const shot = mshot(url);

  return {
    page: { url, title: "Sample Landing Page" },
    assets: { screenshot_url: shot },
    score: 74,
    sections_detected: {
      hero: true,
      value_prop: true,
      social_proof: false,
      features: true,
      pricing: false,
      faq: true,
      contact: true,
      footer: true,
    },
    hero: { suggestions: heroSuggestions },
    next_section: { name: "value prop", suggestions: nextSectionSuggestions },
    findings,
    quick_wins: [
      "Compress hero image",
      "Move CTA above the fold",
      "Add social proof",
    ],
    content_audit: contentAudit,
    prioritized_backlog: [
      {
        title: "Revise hero section copy",
        impact: hi,
        effort_days: 2,
        eta_days: 5,
        lift_percent: 20,
      },
      {
        title: "Integrate testimonials",
        impact: med,
        effort_days: 3,
        eta_days: 7,
        lift_percent: 10,
      },
      {
        title: "Improve navigation flow",
        impact: med,
        effort_days: 2,
        eta_days: 4,
        lift_percent: 5,
      },
    ],
    screenshots: {
      hero: shot,
      sections: {
        hero: shot,
      },
    },
  };
}
