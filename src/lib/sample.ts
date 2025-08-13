import type { FullReport } from "./analyze";

export const sampleFullReport: FullReport = {
  url: "https://demo.holbox.ai",
  score: 82,
  assets: {
    screenshot_url:
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1400&auto=format&fit=crop",
  },
  sections_detected: {
    hero: true,
    value_prop: true,
    social_proof: true,
    features: true,
    pricing: false,
    faq: true,
    contact: true,
    footer: true,
  },
  hero: {
    suggestions: [
      {
        impact: "high",
        title: "Clarify outcome in headline",
        recommendation:
          "Lead with a measurable result (e.g., “+15–30% sign-ups in 30 days”).",
      },
      {
        impact: "medium",
        title: "Increase CTA contrast",
        recommendation:
          "Raise text/background contrast to ≥4.5:1 and add hover/focus states.",
      },
      {
        impact: "medium",
        title: "Add trust badges below CTA",
        recommendation:
          "Show 3–5 client logos or a short testimonial near the hero.",
      },
    ],
    overlay: { x: 0, y: 0, w: 1366, h: 740 },
  },
  next_section: {
    type: "features",
    suggestions: [
      {
        impact: "high",
        title: "Outcome-oriented bullets",
        recommendation:
          "Rewrite bullets to promise a specific improvement (e.g., “Reduce bounce by 10–20%”).",
      },
      {
        impact: "low",
        title: "Micro-CTA under each card",
        recommendation:
          "Link to the relevant part of the full report for deeper context.",
      },
    ],
    overlay: { x: 0, y: 740, w: 1366, h: 700 },
  },
  quick_wins: [
    "Preload hero image",
    "Shorten hero copy",
    "Move trust near the fold",
  ],
  findings: [
    {
      impact: "high",
      effort: "low",
      owner: "design",
      section: "hero",
      title: "Hero value unclear on mobile",
      recommendation:
        "Shorten headline to ≤60 chars and ensure CTA is visible in first viewport.",
    },
    {
      impact: "medium",
      effort: "low",
      owner: "design",
      section: "cta",
      title: "Primary CTA contrast low",
      recommendation:
        "Update button color and increase font weight for better prominence.",
    },
    {
      impact: "high",
      effort: "medium",
      owner: "dev",
      section: "performance",
      title: "LCP image oversized",
      recommendation:
        "Serve responsive sizes (srcset) and preload the hero asset.",
    },
    {
      impact: "medium",
      effort: "low",
      owner: "marketing",
      section: "social_proof",
      title: "Logos too far down",
      recommendation: "Move 3–5 notable logos just below the hero content.",
    },
    {
      impact: "low",
      effort: "low",
      owner: "design",
      section: "forms",
      title: "Unlabeled form fields",
      recommendation:
        "Use explicit labels (not placeholders) and show inline validation.",
    },
    {
      impact: "medium",
      effort: "medium",
      owner: "dev",
      section: "tech_seo",
      title: "Missing meta description",
      recommendation:
        "Add a clear, outcome-oriented meta description (≤160 chars).",
    },
    {
      impact: "low",
      effort: "low",
      owner: "design",
      section: "footer",
      title: "Weak footer links",
      recommendation:
        "Add links to privacy, terms, and contact with clear naming.",
    },
    {
      impact: "medium",
      effort: "low",
      owner: "marketing",
      section: "faq",
      title: "FAQ lacks objections",
      recommendation:
        "Add answers for price, data security, and time-to-value.",
    },
  ],
  prioritized_backlog: [
    { title: "Hero value & CTA", impact: 3, effort: 1, eta_days: 1 },
    { title: "Responsive hero image", impact: 3, effort: 2, eta_days: 2 },
    { title: "Add trust logos", impact: 2, effort: 1, eta_days: 1 },
  ],
};
