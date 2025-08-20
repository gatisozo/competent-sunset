// src/lib/sample.ts
// Parauga dati, kas atbilst tipiem no ./analyze

import type {
  FullReport,
  Suggestion,
  ContentAuditItem,
  BacklogItem,
} from "./analyze";

export const sampleFindings: Suggestion[] = [
  {
    title: "Hero Section Needs Improvement",
    impact: "high",
    recommendation:
      "Use one strong H1, clear value proposition, and a primary CTA above the fold.",
  },
  {
    title: "Insufficient Social Proof",
    impact: "medium",
    recommendation:
      "Add testimonials, case-studies, or client logos to build trust.",
  },
  {
    title: "Meta Description Not Optimal",
    impact: "low",
    recommendation:
      "Re-write to ~150 characters with the main benefit and brand.",
  },
];

export const sampleContentAudit: ContentAuditItem[] = [
  {
    section: "Hero",
    present: true,
    quality: "poor",
    suggestion: "Add a single clear H1 and a primary CTA.",
  },
  {
    section: "Value Prop",
    present: true,
    quality: "good",
    suggestion: "Keep meta description ~150 chars.",
  },
  {
    section: "Social Proof",
    present: false,
    quality: "poor",
    suggestion: "Add testimonials or client logos.",
  },
  {
    section: "Pricing",
    present: false,
    quality: "poor",
    suggestion: "Show pricing or provide a pricing CTA.",
  },
  { section: "Features", present: true, quality: "good" },
  {
    section: "Faq",
    present: false,
    quality: "poor",
    suggestion: "Add a FAQ section (8–10 questions).",
  },
  { section: "Contact", present: true, quality: "good" },
  { section: "Footer", present: true, quality: "good" },
  {
    section: "Images",
    present: true,
    quality: "poor",
    suggestion: "Add ALT text to non-decorative images.",
  },
];

export const sampleQuickWins: string[] = [
  "Add a single clear H1 + primary CTA above the fold. (≈ +12%)",
  "Fix meta description to ~150 chars with benefits. (≈ +4%)",
  "Add ALT text to images (≈ +3% leads).",
  "Add 5–10 internal links to key pages. (≈ +3%)",
  "Add OpenGraph/Twitter meta for better sharing. (≈ +1–2%)",
];

export const sampleBacklog: BacklogItem[] = [
  {
    title: "Revamp the Hero Section",
    impact: 3,
    effort_days: 2,
    eta_days: 10,
    lift_percent: 20,
    notes: "Strong value prop, single H1, prominent CTA and benefit bullets.",
  },
  {
    title: "Implement a Testimonial Slider",
    impact: 2,
    effort_days: 3,
    eta_days: 7,
    lift_percent: 10,
    notes: "Collect 6–10 quotes with names/roles; add logo row if available.",
  },
  {
    title: "Re-write Meta Description",
    impact: 1,
    effort_days: 1,
    eta_days: 2,
    lift_percent: 4,
    notes: "Aim for 145–160 chars with benefit + brand.",
  },
];

export const sampleFullReport: FullReport = {
  page: { url: "https://example.com", title: "Example — Just another site" },
  assets: {
    screenshot_url:
      "https://s.wordpress.com/mshots/v1/https%3A%2F%2Fexample.com?w=1200",
  },
  screenshots: {
    hero: "https://s.wordpress.com/mshots/v1/https%3A%2F%2Fexample.com?w=1200",
  },
  sections_detected: {
    hero: true,
    value_prop: true,
    social_proof: false,
    pricing: false,
    features: true,
    faq: false,
    contact: true,
    footer: true,
  },
  findings: sampleFindings,
  content_audit: sampleContentAudit,
  quick_wins: sampleQuickWins,
  prioritized_backlog: sampleBacklog,
  meta: {
    title: "Example — Just another site",
    description: "This is an example site used for demo purposes.",
    lang: "en",
    viewport: "width=device-width, initial-scale=1",
    canonical: "https://example.com/",
  },
  seo: {
    h1Count: 1,
    h2Count: 4,
    h3Count: 6,
    canonicalPresent: true,
    metaDescriptionPresent: true,
  },
  images: { total: 12, missingAlt: 3 },
  links: { total: 45, internal: 30, external: 15 },
  social: {
    og: { "og:title": "Example" },
    twitter: { "twitter:card": "summary_large_image" },
  },
  robots: {
    robotsTxtUrl: "https://example.com/robots.txt",
    robotsTxtOk: true,
    sitemapOk: true,
  },
  text_snippets:
    "Welcome to Example. Our product helps you do X. Pricing, Features, Contact...",
  score: 78,
};
