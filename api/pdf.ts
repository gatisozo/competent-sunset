// api/pdf.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Resend } from "resend";

type Impact = "high" | "medium" | "low";
type Effort = "low" | "medium" | "high";

type SectionPresence = {
  hero?: boolean;
  value_prop?: boolean;
  social_proof?: boolean;
  features?: boolean;
  pricing?: boolean;
  faq?: boolean;
  contact?: boolean;
  footer?: boolean;
};

type Suggestion = { title: string; recommendation: string; impact: Impact };
type Overlay = { x: number; y: number; w: number; h: number };

type ReportFree = {
  url: string;
  score?: number;
  summary?: string;
  assets?: { screenshot_url?: string | null };
  sections_detected?: SectionPresence;
  hero?: { text?: any; suggestions?: Suggestion[]; overlay?: Overlay | null };
  next_section?: {
    type?: string;
    text?: any;
    suggestions?: Suggestion[];
    overlay?: Overlay | null;
  };
  quick_wins?: string[];
  risks?: string[];
};

type FullFinding = {
  title: string;
  impact: Impact;
  effort?: Effort;
  owner?: string;
  section?: string;
  recommendation: string;
};
type ReportFull = ReportFree & {
  findings?: FullFinding[];
  prioritized_backlog?: {
    title: string;
    impact: number;
    effort: number;
    eta_days?: number;
  }[];
};
type Report = ReportFull;

const resendKey = process.env.RESEND_API_KEY;
const FROM = process.env.FROM_EMAIL || "reports@holbox.ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { report, email } = req.body || {};
    if (!report)
      return res.status(400).json({ error: "Missing 'report' JSON" });

    const pdfBytes = await buildPdf(report as Report);

    if (email && resendKey) {
      const resend = new Resend(resendKey);
      const filename = suggestFilename((report as Report).url);
      await resend.emails.send({
        from: FROM,
        to: email,
        subject: "Your Holbox AI Full Report",
        text: "Thanks for your purchase! Find your PDF attached.",
        attachments: [
          {
            filename,
            content: Buffer.from(pdfBytes),
            contentType: "application/pdf",
          },
        ],
      });
      return res.status(200).json({ ok: true, emailed: true });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${suggestFilename((report as Report).url)}"`
    );
    return res.status(200).send(Buffer.from(pdfBytes));
  } catch (e: any) {
    console.error("PDF_ERROR:", e?.message || e);
    return res
      .status(500)
      .json({ error: e?.message || "PDF generation failed" });
  }
}

function suggestFilename(u?: string) {
  try {
    const host = u ? new URL(u).host : "report";
    return `holbox-full-report_${host}.pdf`;
  } catch {
    return "holbox-full-report.pdf";
  }
}

async function buildPdf(r: Report): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]); // A4
  let y = 800;

  const draw = (text: string, size = 12) => {
    page.drawText(text, { x: 40, y, size, font, color: rgb(0.15, 0.15, 0.2) });
    y -= size + 6;
  };
  const bullet = (text: string) => {
    page.drawText(`• ${text}`, {
      x: 48,
      y,
      size: 12,
      font,
      color: rgb(0.15, 0.15, 0.2),
    });
    y -= 18;
  };
  const newPageIfNeeded = () => {
    if (y < 80) {
      const p = doc.addPage([595.28, 841.89]);
      (page as any) = p;
      y = 800;
    }
  };

  // Header
  draw("Holbox AI — Full CRO Report", 16);
  draw(`URL: ${r.url || "-"}`);
  if (typeof r.score === "number") draw(`Score: ${r.score}/100`);

  // Sections detected
  if (r.sections_detected) {
    y -= 8;
    draw("Sections:");
    for (const [k, v] of Object.entries(r.sections_detected)) {
      bullet(`${k}: ${v ? "present" : "missing"}`);
      newPageIfNeeded();
    }
  }

  // Hero suggestions
  if (r.hero?.suggestions?.length) {
    y -= 4;
    draw("Hero suggestions:", 13);
    for (const s of r.hero.suggestions) {
      bullet(`[${s.impact}] ${s.title}`);
      wrapLines(doc, page, font, `   ${s.recommendation}`, () => {
        y -= 14;
        return y;
      });
      newPageIfNeeded();
    }
  }

  // Next section suggestions
  if (r.next_section?.suggestions?.length) {
    y -= 4;
    draw("Next Section suggestions:", 13);
    for (const s of r.next_section.suggestions) {
      bullet(`[${s.impact}] ${s.title}`);
      wrapLines(doc, page, font, `   ${s.recommendation}`, () => {
        y -= 14;
        return y;
      });
      newPageIfNeeded();
    }
  }

  // Findings
  if (r.findings?.length) {
    y -= 4;
    draw("Findings:", 13);
    for (const f of r.findings) {
      bullet(
        `[${f.impact}${f.effort ? `/${f.effort}` : ""}] ${f.title}${
          f.section ? ` — ${f.section}` : ""
        }`
      );
      wrapLines(doc, page, font, `   ${f.recommendation}`, () => {
        y -= 14;
        return y;
      });
      newPageIfNeeded();
    }
  }

  // Quick wins
  if (r.quick_wins?.length) {
    y -= 4;
    draw("Quick Wins:", 13);
    for (const q of r.quick_wins) {
      bullet(q);
      newPageIfNeeded();
    }
  }

  return await doc.save();
}

function wrapLines(
  doc: PDFDocument,
  page: any,
  font: any,
  text: string,
  step: () => number,
  size = 12
) {
  const maxWidth = 500;
  const words = text.split(/\s+/);
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      page.drawText(line, {
        x: 48,
        y: step(),
        size,
        font,
        color: rgb(0.15, 0.15, 0.2),
      });
      line = w;
    } else {
      line = test;
    }
  }
  if (line)
    page.drawText(line, {
      x: 48,
      y: step(),
      size,
      font,
      color: rgb(0.15, 0.15, 0.2),
    });
}
