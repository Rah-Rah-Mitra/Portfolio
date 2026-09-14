// resumeRender.mjs: on-demand résumé renderer (api/resume.mjs and the
// build_resume MCP tool).
//
// This is a JS port of scripts/resume/{nus,harvard}_style.py + the assembly
// loop in build_resumes.py. The Python + MS Word pipeline stays the source of
// truth for the eight canonical résumés; this renderer exists because neither
// Python nor Word runs on Vercel, so custom builds need their own engine.
//
// What a STYLE decides — geometry, type, and what a section, entry, skills line
// and bullet look like — lives in resumeStyles.mjs. What it does not decide —
// page flow, the fit ladder, the spec codec — lives here. Two styles today:
// `nus` (default) and `harvard`.
//
// The line-box maths is calibrated against Word rather than guessed: line
// advance is lineRatio x the nominal point size, the baseline sits ascentRatio
// below the line-box top, and Word takes the MAX of a paragraph's space-after
// and the next one's space-before rather than summing them.
//
// Times-* and Helvetica-* are PDF Standard-14 fonts, metrically compatible with
// Times New Roman and Arial, so there is no font file to ship. The bullet,
// middle dot, en dash and non-breaking space are all in WinAnsi, which is the
// encoding pdfkit uses for these fonts.
//
// Imports only packages and JSON. Vercel compiles api/ per file as native ESM
// with no bundling.
import PDFDocument from 'pdfkit';
import { assemble, resolveBulletText, resolveRole } from './resumeAssemble.mjs';
import { DEFAULT_STYLE, STYLES, block, measure, styleFor, wrapRuns } from './resumeStyles.mjs';

// Spec resolution lives in resumeAssemble.mjs so the checker and the builder
// window can reach it without loading pdfkit. Re-exported here because this is
// the path every existing caller imports it from.
export { assemble, resolveBulletText, resolveRole };
export { DEFAULT_STYLE, STYLES, styleFor };

/** Body size of the default style, for callers that want the plain default. */
export const BODY_PT = STYLES[DEFAULT_STYLE].bodyPt;

// Assign every block a page and a y, keeping keep-with-next groups intact so an
// entry header never orphans at a page break.
const flow = (blocks, marginLR, style) => {
  const { pageH: PAGE_H, marginTop: MARGIN_TOP, marginBottom: MARGIN_BOTTOM, lineRatio: LINE_RATIO } = style;
  const top = PAGE_H - MARGIN_TOP;
  const bottom = MARGIN_BOTTOM;
  const placed = [];
  let page = 0;
  let cursor = top;
  let previousAfter = 0;

  let index = 0;
  while (index < blocks.length) {
    // Collect the atomic group: this block plus everything chained to it by
    // keepWithNext (header -> entry line 1 -> entry line 2 -> first bullet).
    let end = index;
    while (blocks[end].keepWithNext && end + 1 < blocks.length) end += 1;
    const group = blocks.slice(index, end + 1);

    let height = 0;
    group.forEach((item, position) => {
      const gap = position === 0 ? Math.max(previousAfter, item.spaceBefore) : Math.max(group[position - 1].spaceAfter, item.spaceBefore);
      height += gap + item.lines.length * item.size * LINE_RATIO;
    });

    if (cursor - height < bottom && cursor < top) {
      page += 1;
      cursor = top;
      previousAfter = 0;
    }

    group.forEach((item, position) => {
      const gap = position === 0 ? Math.max(previousAfter, item.spaceBefore) : Math.max(group[position - 1].spaceAfter, item.spaceBefore);
      cursor -= gap;
      const boxTop = cursor;
      placed.push({ ...item, page, boxTop, marginLR });
      cursor -= item.lines.length * item.size * LINE_RATIO;
    });
    previousAfter = group[group.length - 1].spaceAfter;
    index = end + 1;
  }
  return { placed, pages: page + 1 };
};

const draw = (doc, placed, pages, marginLR, style) => {
  const { pageW: PAGE_W, pageH: PAGE_H, marginTop: MARGIN_TOP, marginBottom: MARGIN_BOTTOM,
    lineRatio: LINE_RATIO, ascentRatio: ASCENT_RATIO } = style;
  const contentWidth = PAGE_W - marginLR * 2;
  let current = 0;
  for (const item of placed) {
    while (current < item.page) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: marginLR, right: marginLR } });
      current += 1;
    }
    item.lines.forEach((line, lineIndex) => {
      const lineTop = item.boxTop - lineIndex * item.size * LINE_RATIO;
      const baseline = lineTop - item.size * ASCENT_RATIO;
      const lineWidth = line.reduce((total, run) => total + run.width, 0);
      let x = marginLR + item.indent + (lineIndex > 0 ? item.hanging : 0);
      if (item.align === 'center') x = marginLR + (contentWidth - lineWidth) / 2;
      if (item.align === 'right') x = marginLR + contentWidth - lineWidth;

      // pdfkit anchors a run at the font ascender, so place by explicit
      // baseline instead and keep our own line-box maths authoritative.
      const y = PAGE_H - baseline;
      for (const run of line) {
        doc.font(run.font).fontSize(run.size).fillColor('#000000');
        doc.text(run.text, x, y, { lineBreak: false, baseline: 'alphabetic', ...(run.tracking ? { characterSpacing: run.tracking } : {}) });
        // Links are black and unmarked in both styles, but they must still be
        // real annotations; verify_resumes.py checks for them.
        if (run.link) doc.link(x, y - run.size * ASCENT_RATIO, run.width, run.size * LINE_RATIO, run.link);
        x += run.width;
      }

      // Right-flush column at the content edge (the Word right tab stop).
      if (lineIndex === 0 && item.rightRun) {
        const width = measure(doc, item.rightRun.text, item.rightRun.font, item.rightRun.size);
        doc.font(item.rightRun.font).fontSize(item.rightRun.size).fillColor('#000000');
        doc.text(item.rightRun.text, marginLR + contentWidth - width, y, { lineBreak: false, baseline: 'alphabetic' });
      }
    });

    if (item.rule) {
      const ruleY = PAGE_H - (item.boxTop - item.lines.length * item.size * LINE_RATIO) + 1;
      style.drawRule(doc, marginLR, ruleY, contentWidth);
    }
  }
};

/**
 * Wrapped line count for each bullet at a given typography, using the renderer's
 * own wrapper rather than a character-count approximation. The checker is
 * import-free by design, so it takes these counts as input instead of measuring
 * for itself; this keeps the geometry in the one file calibrated against Word.
 *
 * A fresh document is cheap to construct and renderResumePdf cannot be reused:
 * it never returns its document and calls .end() on the attempts that lose.
 */
export const measureBulletLines = (texts, { bodyPt, marginIn, style: styleName } = {}) => {
  if (!texts.length) return [];
  const style = styleFor(styleName);
  const size = bodyPt ?? style.bodyPt;
  const marginLR = (marginIn ?? style.marginLR / 72) * 72;
  const contentWidth = style.pageW - marginLR * 2;
  const doc = new PDFDocument({ size: [style.pageW, style.pageH], autoFirstPage: false });
  const counts = texts.map((text) => style.bulletWrap(doc, text, size, contentWidth).length);
  doc.end();
  return counts;
};

const renderOnce = (spec, pools, profile, bodyPt, marginLR, style) => {
  const doc = new PDFDocument({
    size: [style.pageW, style.pageH],
    margins: { top: style.marginTop, bottom: style.marginBottom, left: marginLR, right: marginLR },
    autoFirstPage: true,
    info: {
      Title: `${titleCase(profile.name)} - ${spec.subject ?? 'Resume'}`,
      Author: titleCase(profile.name),
      Subject: spec.subject ?? 'Resume',
      Keywords: `rahul-mitra.com, ${spec.subject ?? 'Resume'}`,
    },
  });
  const contentWidth = style.pageW - marginLR * 2;
  const items = assemble(spec, pools);
  const blocks = style.buildBlocks({ doc, items, profile, bodyPt, contentWidth });
  const { placed, pages } = flow(blocks, marginLR, style);
  return { doc, placed, pages, marginLR, bodyPt };
};

const titleCase = (name) => name.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());

const toBuffer = (doc) => new Promise((resolve, reject) => {
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  doc.end();
});

/**
 * Render a résumé spec to PDF.
 *
 * Auto-fit walks that style's own typography ladder (nus: body 10.5 down to
 * 8.5pt at its fixed 0.5in margins; harvard: body 10.5 -> 10, then margins 0.7
 * -> 0.6 -> 0.5) and stops at the first setting that fits maxPages. It never
 * drops content; if nothing fits, `fit.overflow` describes by how much so the
 * caller can decide what to remove.
 */
export const renderResumePdf = async (spec, pools, profile) => {
  const style = styleFor(spec.style);
  const maxPages = spec.pages ?? 1;
  const autoFit = spec.autoFit !== false;
  const steps = autoFit
    ? style.fitLadder
    : [{ bodyPt: null, marginIn: null }];

  let last = null;
  const attempts = [];
  for (const step of steps) {
    const bodyPt = step.bodyPt ?? spec.bodyPt ?? style.bodyPt;
    const marginLR = (step.marginIn ?? spec.marginIn) != null ? (step.marginIn ?? spec.marginIn) * 72 : style.marginLR;
    const attempt = renderOnce(spec, pools, profile, bodyPt, marginLR, style);
    attempts.push({ bodyPt, marginIn: marginLR / 72, pages: attempt.pages });
    if (attempt.pages <= maxPages) {
      draw(attempt.doc, attempt.placed, attempt.pages, marginLR, style);
      return {
        pdf: await toBuffer(attempt.doc),
        pages: attempt.pages,
        fit: { style: style.id, bodyPt, marginIn: marginLR / 72, maxPages, fitted: true, attempts },
      };
    }
    if (last) last.doc.end();
    last = attempt;
  }

  draw(last.doc, last.placed, last.pages, last.marginLR, style);
  return {
    pdf: await toBuffer(last.doc),
    pages: last.pages,
    fit: {
      style: style.id,
      bodyPt: last.bodyPt,
      marginIn: last.marginLR / 72,
      maxPages,
      fitted: false,
      attempts,
      overflow: `Does not fit ${maxPages} page(s) even at ${last.bodyPt}pt with ${last.marginLR / 72}in margins; it runs to ${last.pages}. Remove content and rebuild: a project entry costs about 3 lines, a bullet about 2.`,
    },
  };
};

// ── DOCX ──────────────────────────────────────────────────────────────────
// Word cannot be driven here, so the DOCX inherits the typography the PDF pass
// settled on. Its page count is therefore expected rather than measured; the
// PDF is the one with a guaranteed fit.
const A4_W_TWIP = 11906;
const A4_H_TWIP = 16838;

export const renderResumeDocx = async (spec, pools, profile, { bodyPt, marginIn, style: styleName } = {}) => {
  const docx = await import('docx');
  const { Document, Packer } = docx;
  const style = styleFor(styleName ?? spec.style);
  const size = Math.round((bodyPt ?? style.bodyPt) * 2);          // half-points
  const marginTwips = Math.round((marginIn ?? style.marginLR / 72) * 1440);
  const children = style.docxChildren({
    docx,
    items: assemble(spec, pools),
    profile,
    bodyPt: bodyPt ?? style.bodyPt,
    contentTwips: A4_W_TWIP - marginTwips * 2,
  });

  const subject = spec.subject ?? 'Resume';
  const single = { line: 240, lineRule: 'auto' };
  const document = new Document({
    creator: titleCase(profile.name),
    title: `${titleCase(profile.name)} - ${subject}`,
    subject,
    keywords: `rahul-mitra.com, ${subject}`,
    styles: { default: { document: { run: { font: style.docxFont, size }, paragraph: { spacing: { ...single, before: 0, after: 0 } } } } },
    sections: [{
      properties: {
        page: {
          size: { width: A4_W_TWIP, height: A4_H_TWIP },
          margin: {
            top: Math.round(style.marginTop * 20),
            bottom: Math.round(style.marginBottom * 20),
            left: marginTwips,
            right: marginTwips,
          },
        },
      },
      children,
    }],
  });
  return Packer.toBuffer(document);
};

// ── Markdown ──────────────────────────────────────────────────────────────
// Style-independent on purpose: Markdown has no typography to carry, and the
// résumé vocabulary jobSearch.mjs scores a posting against is computed from
// this output — so switching styles must not move a match score.
export const renderResumeMarkdown = (spec, pools, profile) => {
  const out = [`# ${profile.name}`, profile.contact.map((item) => (item.url ? `[${item.text}](${item.url})` : item.text)).join(' · ')];
  for (const item of assemble(spec, pools)) {
    if (item.kind === 'section') out.push('', `## ${item.title}`);
    else if (item.kind === 'skill') out.push(`- **${item.label}:** ${item.items}`);
    else if (item.kind === 'entry') {
      out.push('', item.role
        ? `**${item.organization}**, ${item.location} · *${item.role}* (${item.dateLabel})`
        : `**${item.organization}** (${item.dateLabel})`);
    } else out.push(`- ${item.text}`);
  }
  return out.join('\n');
};

/** Render every format from one spec. The PDF pass decides the typography. */
export const renderResume = async (spec, pools, profile) => {
  const { pdf, pages, fit } = await renderResumePdf(spec, pools, profile);
  const docx = await renderResumeDocx(spec, pools, profile, { bodyPt: fit.bodyPt, marginIn: fit.marginIn, style: fit.style });
  return { pdf, docx, markdown: renderResumeMarkdown(spec, pools, profile), pages, fit };
};

// ── Spec encoding + validation ────────────────────────────────────────────
// A spec is exactly a résumé config (scripts/resume/content/resumes/<slug>.json)
// plus the optional depth/fit keys. It travels in the URL as deflated JSON so a
// built résumé is fully reproducible from its link, with no server-side storage.
import { deflateSync, inflateSync } from 'node:zlib';
import { z } from 'zod';

// "short" was accepted here and advertised in the guide, but no bullet in the
// content pools has ever carried a short key, so resolveBulletText fell through
// to the default and an agent asking for it got identical output with no warning
// and then an overflow report. Narrowed to what exists: asking for a variant that
// is not there should be a loud rejection, not a silent no-op.
const id = z.string().min(1).max(60);

// A section heading is prose, and unlike everything else on a spec it is PRINTED:
// full width, in the document, on a file served from rahul-mitra.com under
// Rahul's name. As a free 80-character string it was eight sections' worth of
// whatever a caller wanted to say, through the open build_resume tool and
// through the unauthenticated api/resume endpoint — the one text channel this
// whole design exists to close. So headings are selected too, from exactly the
// set the eight canonical résumés use. Per type rather than one shared list
// because `general` calls its projects section "PROJECTS AND COMPETITIONS" and
// nothing else may.
const entries = z.array(z.object({
  id,
  bullets: z.array(id).max(10).optional(),
  variant: z.enum(['standard', 'deep']).optional(),
  roleVariant: id.optional(),
})).max(24);
const entrySection = (type, titles) => z.object({
  type: z.literal(type),
  title: z.enum(titles),
  entries,
});
const skillsSection = z.object({
  type: z.literal('skills'),
  title: z.enum(['SKILLS AND CERTIFICATIONS']),
  lines: z.array(id).max(16),
});

export const specSchema = z.object({
  // The eight canonical slugs, not a free string. `slug` selects the per-slug
  // bullet overrides, so a free string was an undocumented content lever: an
  // agent could set slug "cyber-security" on a custom spec and silently pull in
  // overrides, or set a slug that exists nowhere and silently get nothing. Both
  // should be answered out loud.
  slug: z.enum(['software-engineer', 'solution-architect', 'ai-engineer',
    'operations-research-engineer', 'cyber-security', 'civic-tech-solution-architect',
    'highlights', 'general']).optional(),
  // Never printed on the page, but it IS the document title in the PDF and DOCX
  // metadata — what a browser tab and Word's properties pane show for a file
  // served under Rahul's name. jobSearch.mjs already froze this field to a
  // constant on the tailored path ("the one place a posting's prose could have
  // got onto a document"); the open paths get the same rule rather than a
  // different one. The eight canonical subjects are here so a spec fetched from
  // get_resume round-trips unchanged, plus the labels this repo's own two
  // builders use. The cost is that a build can no longer be titled after the
  // company it is aimed at, which is the same cost the tailored path already paid.
  subject: z.enum([
    'Resume', 'Custom Resume', 'Tailored résumé',
    'Software Engineer Resume', 'Solution Architect Resume', 'AI Engineer Resume',
    'Operations Research Engineer Resume', 'Cyber Security Resume',
    'Civic Tech Solution Architect Resume', 'Highlights Resume (One Page)',
    'General Master CV',
  ]).optional(),
  pages: z.number().int().min(1).max(3).optional(),
  // 8.5 is the `nus` floor — the size its own source document uses, and what
  // makes the two-page master CV fit. `harvard` still stops at 10: the real
  // floor is the style's fit ladder, and this bound only has to admit both.
  bodyPt: z.number().min(8.5).max(12).optional(),
  marginIn: z.number().min(0.5).max(1).optional(),
  detail: z.enum(['standard', 'deep']).optional(),
  autoFit: z.boolean().optional(),
  // Closed, like every other printed choice on a spec: a style decides the
  // geometry of a document served under Rahul's name, and there are two.
  style: z.enum(['nus', 'harvard']).optional(),
  // Alternative wordings, keyed on the same "entryId.bulletId" ref every finding
  // is reported against, so a rephrase remedy is directly writable as given.
  // Values are phrasing ids from list_resume_blocks; this never carries text.
  phrasings: z.record(
    z.string().regex(/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/),
    z.string().regex(/^[a-z][a-z0-9-]{1,28}$/),
  ).optional(),
  sections: z.array(z.discriminatedUnion('type', [
    entrySection('education', ['EDUCATION']),
    entrySection('experience', ['WORK EXPERIENCE', 'EXPERIENCE']),
    entrySection('projects', ['PROJECTS', 'PROJECTS AND COMPETITIONS']),
    entrySection('leadership', ['LEADERSHIP AND ACTIVITIES']),
    skillsSection,
  ])).min(1).max(8),
});

export const encodeSpec = (spec) => deflateSync(Buffer.from(JSON.stringify(spec), 'utf8')).toString('base64url');

export const decodeSpec = (encoded) => {
  if (typeof encoded !== 'string' || encoded.length > 8000) throw new Error('spec is missing or too large');
  return JSON.parse(inflateSync(Buffer.from(encoded, 'base64url')).toString('utf8'));
};
