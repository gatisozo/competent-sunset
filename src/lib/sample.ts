import type { FullReport } from "./analyze";

export const sampleFullReport: FullReport = {
  score: 74,
  summary:
    "Solid baseline, but hero clarity and CTA contrast limit conversions.",
  key_findings: [
    {
      title: "Hero message unclear on mobile",
      impact: "low",
      recommendation: "Shorten headline and keep CTA in first viewport.",
    },
    {
      title: "Primary CTA has low contrast",
      impact: "low",
      recommendation: "Increase color contrast and add hover/focus styles.",
    },
  ],
  quick_wins: [
    "Compress hero image",
    "Move CTA above fold",
    "Add social proof",
  ],
  risks: [],
  sections_detected: {
    hero: true,
    value_prop: true,
    social_proof: false,
    pricing: false,
    features: true,
    faq: true,
    contact: true,
    footer: true,
  },
  findings: [
    {
      title: "Hero value unclear on mobile — hero",
      impact: "low",
      recommendation: "Shorten headline and keep CTA in the first viewport.",
    },
    {
      title: "Primary CTA low contrast — hero",
      impact: "low",
      recommendation: "Increase color contrast and add hover/focus styles.",
    },
    {
      title: "LCP image oversized — performance",
      impact: "medium",
      recommendation:
        "Serve responsive images (srcset) and preload hero asset.",
    },
  ],
  prioritized_backlog: [
    { title: "Fix hero value + CTA", impact: 3, effort: 1, eta_days: 1 },
    { title: "Responsive hero image", impact: 3, effort: 2, eta_days: 2 },
    { title: "Add trust badges", impact: 2, effort: 1, eta_days: 1 },
  ],
  content_audit: [
    {
      section: "hero",
      status: "weak",
      rationale:
        "Headline not benefit-driven; CTA not visible on first viewport on smaller screens.",
      suggestions: [
        "Rewrite headline to reflect primary outcome.",
        "Ensure CTA is visible without scrolling on mobile.",
      ],
    },
  ],
  page: { url: "https://example.com", title: "Example – Landing" },
  assets: {
    screenshot_url:
      "https://dummyimage.com/1200x700/edf2f7/111827.png&text=Screenshot",
    suggested_screenshot_url:
      "https://dummyimage.com/1200x700/f7fafc/111827.png&text=Suggested",
  },
};
