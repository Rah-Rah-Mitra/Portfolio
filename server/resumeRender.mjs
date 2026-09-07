// resumeRender.mjs — Harvard-style résumé renderer for on-demand builds
// (api/resume.mjs and the build_resume MCP tool).
//
// This is a JS port of scripts/resume/harvard_style.py + the assembly loop in
// build_resumes.py. The Python + MS Word pipeline stays the source of truth for
// the eight canonical résumés; this renderer exists because neither Python nor
// Word runs on Vercel, so custom builds need their own engine.
//
// Layout constants were calibrated by extracting glyph positions from the
// Word-built rahul-mitra-highlights-2026-09.pdf, not guessed: line advance is
// 1.152x the nominal point size, the baseline sits 0.93x below the line-box
// top, and Word takes the MAX of a paragraph's space-after and the next one's
// space-before rather than summing them.
//
// Times-Roman/Bold/Italic are PDF Standard-14 fonts: metrically compatible with
// Times New Roman, and no font file to ship. The bullet, middle dot and en dash
// are all in WinAnsi, which is the encoding pdfkit uses for these fonts.
//
// Imports only packages and JSON — Vercel compiles api/ per file as native ESM
// with no bundling.
import PDFDocument from 'pdfkit';

// — page geometry (harvard_style.py:19-23) —
const PAGE_W = 595.276;           // A4
const PAGE_H = 841.890;
const MARGIN_TOP = 39.6;          // 0.55in
const MARGIN_BOTTOM = 36;         // 0.5in
const MARGIN_LR = 50.4;           // 0.7in default

// — type (harvard_style.py:13-16) —
const NAME_PT = 16;
const CONTACT_PT = 9.5;
export const BODY_PT = 10.5;
const REGULAR = 'Times-Roman';
const BOLD = 'Times-Bold';
const ITALIC = 'Times-Italic';

// — calibrated from the Word output —
const LINE_RATIO = 1.152;         // baseline-to-baseline / nominal size
const ASCENT_RATIO = 0.93;        // line-box top to baseline / nominal size
const HEADER_TRACKING = 1;        // w:spacing w:val="20" = 1pt
const RULE_WIDTH = 0.75;          // w:sz="6" = eighths of a point
const RULE_GAP = 1;               // w:space="1"
const BULLET_INDENT = 12.96;      // 0.18in hanging indent
const BULLET = '• ';
const SEP = ' · ';

// The trim ladder from .agents/skills/resume-editing/SKILL.md, typography half
// only. Content is never dropped automatically — the caller chose it.
const FIT_LADDER = [
  { bodyPt: null, marginIn: null },
  { bodyPt: 10, marginIn: null },
  { bodyPt: 10, marginIn: 0.6 },
  { bodyPt: 10, marginIn: 0.5 },
];

const measure = (doc, text, font, size, tracking = 0) => {
  doc.font(font).fontSize(size);
  return doc.widthOfString(text, tracking ? { characterSpacing: tracking } : undefined);
};

// Greedy word wrap. We do our own so line boxes are ours to place, which is
// what makes the page count exact rather than discovered after the fact.
const wrapRuns = (doc, runs, firstWidth, restWidth) => {
  const lines = [];
  let line = [];
  let used = 0;
  let width = firstWidth;
  const push = () => {
    if (line.length) lines.push(line);
    line = [];
    used = 0;
    width = restWidth;
  };
  for (const run of runs) {
    const words = run.text.split(/(\s+)/).filter((part) => part !== '');
    for (const word of words) {
      const w = measure(doc, word, run.font, run.size);
      if (used + w > width && used > 0 && word.trim() !== '') {
        push();
      }
      if (used === 0 && word.trim() === '') continue; // no leading space on a wrapped line
      line.push({ ...run, text: word, width: w });
      used += w;
    }
  }
  push();
  return lines;
};

// A block is one Word paragraph: its wrapped lines plus its spacing rules.
const block = (lines, { size, spaceBefore = 0, spaceAfter = 0, keepWithNext = false, rule = false, indent = 0, hanging = 0, align = 'left', rightRun = null }) => ({
  lines, size, spaceBefore, spaceAfter, keepWithNext, rule, indent, hanging, align, rightRun,
});

/**
 * Resolve a spec against the content pools into a flat, ordered item list.
 * This is the single place the assembly rules from build_resumes.py:46-74 live —
 * sort policy, bullet selection order, and one-line vs two-line entries — so the
 * PDF, DOCX and Markdown outputs can never drift apart.
 */
export const assemble = (spec, pools) => {
  const skillLines = new Map(pools.skills.lines.map((line) => [line.id, line]));
  const items = [];
  for (const section of spec.sections) {
    items.push({ kind: 'section', title: section.title.toUpperCase() });
    if (section.type === 'skills') {
      for (const id of section.lines) {
        const line = skillLines.get(id);
        if (!line) throw new Error(`unknown skills line: ${id}`);
        items.push({ kind: 'skill', label: line.label, items: line.items });
      }
      continue;
    }
    const pool = new Map(pools[section.type].entries.map((entry) => [entry.id, entry]));
    const key = section.type === 'projects' ? 'sort' : 'start';
    const chosen = section.entries.map((selection) => {
      const entry = pool.get(selection.id);
      if (!entry) throw new Error(`unknown ${section.type} entry: ${selection.id}`);
      return { entry, bullets: selection.bullets ?? [], variant: selection.variant };
    }).sort((a, b) => b.entry[key].localeCompare(a.entry[key]));

    for (const { entry, bullets, variant } of chosen) {
      items.push({
        kind: 'entry',
        organization: entry.organization,
        location: entry.location ?? '',
        role: entry.role ?? null,
        dateLabel: entry.dateLabel,
      });
      const byId = new Map((entry.bullets ?? []).map((bullet) => [bullet.id, bullet]));
      for (const id of bullets) {
        const bullet = byId.get(id);
        if (!bullet) throw new Error(`unknown bullet ${id} on ${entry.id}`);
        items.push({ kind: 'bullet', text: resolveBulletText(bullet, spec, variant) });
      }
    }
  }
  return items;
};

const buildBlocks = (doc, spec, pools, profile, bodyPt, contentWidth) => {
  const blocks = [];
  const items = assemble(spec, pools);

  // name — centered, bold
  blocks.push(block(
    [[{ text: profile.name, font: BOLD, size: NAME_PT, width: measure(doc, profile.name, BOLD, NAME_PT) }]],
    { size: NAME_PT, spaceAfter: 2, align: 'center' },
  ));

  // contact — centered, 5 items, 4 of them live links
  const contactRuns = [];
  profile.contact.forEach((item, index) => {
    if (index) contactRuns.push({ text: SEP, font: REGULAR, size: CONTACT_PT });
    contactRuns.push({ text: item.text, font: REGULAR, size: CONTACT_PT, link: item.url });
  });
  const contactLine = contactRuns.map((run) => ({ ...run, width: measure(doc, run.text, run.font, run.size) }));
  blocks.push(block([contactLine], { size: CONTACT_PT, spaceAfter: 4, align: 'center' }));

  items.forEach((item, index) => {
    if (item.kind === 'section') {
      blocks.push(block(
        [[{ text: item.title, font: BOLD, size: bodyPt, tracking: HEADER_TRACKING, width: measure(doc, item.title, BOLD, bodyPt, HEADER_TRACKING) }]],
        // A bordered paragraph also reserves the rule's gap and stroke below the
        // text, which is why Word's gap here is 3.75pt rather than the nominal 2.
        { size: bodyPt, spaceBefore: index === 0 ? 3 : 6, spaceAfter: 2 + RULE_GAP + RULE_WIDTH, keepWithNext: true, rule: true },
      ));
      return;
    }
    if (item.kind === 'skill') {
      const runs = [
        { text: `${item.label}: `, font: BOLD, size: bodyPt },
        { text: item.items, font: REGULAR, size: bodyPt },
      ];
      blocks.push(block(wrapRuns(doc, runs, contentWidth, contentWidth), { size: bodyPt, spaceAfter: 1 }));
      return;
    }
    if (item.kind === 'entry') {
      // Line one: bold organisation, right-flush location — or the date when
      // there is no role, which is how projects render as a single line.
      const rightOne = item.role ? item.location : item.dateLabel;
      blocks.push(block(
        [[{ text: item.organization, font: BOLD, size: bodyPt, width: measure(doc, item.organization, BOLD, bodyPt) }]],
        { size: bodyPt, keepWithNext: true, rightRun: rightOne ? { text: rightOne, font: REGULAR, size: bodyPt } : null },
      ));
      if (item.role) {
        blocks.push(block(
          [[{ text: item.role, font: ITALIC, size: bodyPt, width: measure(doc, item.role, ITALIC, bodyPt) }]],
          { size: bodyPt, spaceAfter: 1, keepWithNext: true, rightRun: { text: item.dateLabel, font: REGULAR, size: bodyPt } },
        ));
      }
      return;
    }
    const runs = [{ text: BULLET + item.text, font: REGULAR, size: bodyPt }];
    blocks.push(block(
      wrapRuns(doc, runs, contentWidth, contentWidth - BULLET_INDENT),
      { size: bodyPt, spaceAfter: 1, hanging: BULLET_INDENT },
    ));
  });
  return blocks;
};

// text[variant] ?? text[slug] ?? text.default — mirrors build_resumes.py:33-35
// with the reserved depth keys layered on top.
export const resolveBulletText = (bullet, spec, entryVariant) => {
  const variant = entryVariant ?? spec.detail;
  const text = bullet.text;
  if (variant && variant !== 'standard' && text[variant]) return text[variant];
  return text[spec.slug] ?? text.default;
};

// Assign every block a page and a y, keeping keep-with-next groups intact so an
// entry header never orphans at a page break.
const flow = (blocks, marginLR) => {
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

const draw = (doc, placed, pages, marginLR) => {
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
      let x = marginLR + (lineIndex > 0 ? item.hanging : 0);
      if (item.align === 'center') x = marginLR + (contentWidth - lineWidth) / 2;

      // pdfkit anchors a run at the font ascender, so place by explicit
      // baseline instead and keep our own line-box maths authoritative.
      const y = PAGE_H - baseline;
      for (const run of line) {
        doc.font(run.font).fontSize(run.size).fillColor('#000000');
        doc.text(run.text, x, y, { lineBreak: false, baseline: 'alphabetic', ...(run.tracking ? { characterSpacing: run.tracking } : {}) });
        // Harvard convention: links are black and unmarked, but they must still
        // be real annotations — verify_resumes.py checks for them.
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
      const ruleY = PAGE_H - (item.boxTop - item.lines.length * item.size * LINE_RATIO) + RULE_GAP;
      doc.moveTo(marginLR, ruleY).lineTo(marginLR + contentWidth, ruleY)
        .lineWidth(RULE_WIDTH).strokeColor('#000000').stroke();
    }
  }
};

const renderOnce = (spec, pools, profile, bodyPt, marginLR) => {
  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: marginLR, right: marginLR },
    autoFirstPage: true,
    info: {
      Title: `${titleCase(profile.name)} - ${spec.subject ?? 'Resume'}`,
      Author: titleCase(profile.name),
      Subject: spec.subject ?? 'Resume',
      Keywords: `rahul-mitra.com, ${spec.subject ?? 'Resume'}`,
    },
  });
  const contentWidth = PAGE_W - marginLR * 2;
  const blocks = buildBlocks(doc, spec, pools, profile, bodyPt, contentWidth);
  const { placed, pages } = flow(blocks, marginLR);
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
 * Auto-fit walks the sanctioned typography ladder (body 10.5 -> 10, then
 * margins 0.7 -> 0.6 -> 0.5) and stops at the first setting that fits
 * maxPages. It never drops content; if nothing fits, `fit.overflow` describes
 * by how much so the caller can decide what to remove.
 */
export const renderResumePdf = async (spec, pools, profile) => {
  const maxPages = spec.pages ?? 1;
  const autoFit = spec.autoFit !== false;
  const steps = autoFit
    ? FIT_LADDER
    : [{ bodyPt: null, marginIn: null }];

  let last = null;
  const attempts = [];
  for (const step of steps) {
    const bodyPt = step.bodyPt ?? spec.bodyPt ?? BODY_PT;
    const marginLR = (step.marginIn ?? spec.marginIn) != null ? (step.marginIn ?? spec.marginIn) * 72 : MARGIN_LR;
    const attempt = renderOnce(spec, pools, profile, bodyPt, marginLR);
    attempts.push({ bodyPt, marginIn: marginLR / 72, pages: attempt.pages });
    if (attempt.pages <= maxPages) {
      draw(attempt.doc, attempt.placed, attempt.pages, marginLR);
      return {
        pdf: await toBuffer(attempt.doc),
        pages: attempt.pages,
        fit: { bodyPt, marginIn: marginLR / 72, maxPages, fitted: true, attempts },
      };
    }
    if (last) last.doc.end();
    last = attempt;
  }

  draw(last.doc, last.placed, last.pages, last.marginLR);
  return {
    pdf: await toBuffer(last.doc),
    pages: last.pages,
    fit: {
      bodyPt: last.bodyPt,
      marginIn: last.marginLR / 72,
      maxPages,
      fitted: false,
      attempts,
      overflow: `Does not fit ${maxPages} page(s) even at ${last.bodyPt}pt with 0.5in margins — it runs to ${last.pages}. Remove content and rebuild: a project entry costs about 3 lines, a bullet about 2.`,
    },
  };
};

// ── DOCX ──────────────────────────────────────────────────────────────────
// Word cannot be driven here, so the DOCX inherits the typography the PDF pass
// settled on. Its page count is therefore expected rather than measured; the
// PDF is the one with a guaranteed fit.
const TWIP = 20;            // twips per point
const A4_W_TWIP = 11906;
const A4_H_TWIP = 16838;
const DOCX_FONT = 'Times New Roman';

export const renderResumeDocx = async (spec, pools, profile, { bodyPt = BODY_PT, marginIn = MARGIN_LR / 72 } = {}) => {
  const { AlignmentType, BorderStyle, Document, ExternalHyperlink, Packer, Paragraph, Tab, TabStopType, TextRun } = await import('docx');
  const marginTwips = Math.round(marginIn * 1440);
  const contentTwips = A4_W_TWIP - marginTwips * 2;
  const size = Math.round(bodyPt * 2);          // half-points
  const single = { line: 240, lineRule: 'auto' };
  const run = (text, extra = {}) => new TextRun({ text, size, font: DOCX_FONT, ...extra });
  const children = [];

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { ...single, before: 0, after: 2 * TWIP },
    children: [new TextRun({ text: profile.name, bold: true, size: NAME_PT * 2, font: DOCX_FONT })],
  }));

  const contact = [];
  profile.contact.forEach((item, index) => {
    if (index) contact.push(new TextRun({ text: SEP, size: CONTACT_PT * 2, font: DOCX_FONT }));
    const inner = new TextRun({ text: item.text, size: CONTACT_PT * 2, font: DOCX_FONT, color: '000000' });
    contact.push(item.url ? new ExternalHyperlink({ link: item.url, children: [inner] }) : inner);
  });
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...single, before: 0, after: 4 * TWIP }, children: contact }));

  assemble(spec, pools).forEach((item, index) => {
    if (item.kind === 'section') {
      children.push(new Paragraph({
        spacing: { ...single, before: (index === 0 ? 3 : 6) * TWIP, after: 2 * TWIP },
        keepNext: true,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: '000000' } },
        children: [run(item.title, { bold: true, characterSpacing: 20 })],
      }));
      return;
    }
    if (item.kind === 'skill') {
      children.push(new Paragraph({
        spacing: { ...single, before: 0, after: 1 * TWIP },
        children: [run(`${item.label}: `, { bold: true }), run(item.items)],
      }));
      return;
    }
    if (item.kind === 'entry') {
      const rightOne = item.role ? item.location : item.dateLabel;
      children.push(new Paragraph({
        spacing: { ...single, before: 0, after: 0 },
        keepNext: true,
        tabStops: [{ type: TabStopType.RIGHT, position: contentTwips }],
        children: [run(item.organization, { bold: true }), new TextRun({ size, font: DOCX_FONT, children: [new Tab(), rightOne] })],
      }));
      if (item.role) {
        children.push(new Paragraph({
          spacing: { ...single, before: 0, after: 1 * TWIP },
          keepNext: true,
          tabStops: [{ type: TabStopType.RIGHT, position: contentTwips }],
          children: [run(item.role, { italics: true }), new TextRun({ size, font: DOCX_FONT, children: [new Tab(), item.dateLabel] })],
        }));
      }
      return;
    }
    children.push(new Paragraph({
      spacing: { ...single, before: 0, after: 1 * TWIP },
      indent: { left: 259, hanging: 259 },   // 0.18in hanging indent
      children: [run(BULLET + item.text)],
    }));
  });

  const subject = spec.subject ?? 'Resume';
  const document = new Document({
    creator: titleCase(profile.name),
    title: `${titleCase(profile.name)} - ${subject}`,
    subject,
    keywords: `rahul-mitra.com, ${subject}`,
    styles: { default: { document: { run: { font: DOCX_FONT, size }, paragraph: { spacing: { ...single, before: 0, after: 0 } } } } },
    sections: [{
      properties: { page: { size: { width: A4_W_TWIP, height: A4_H_TWIP }, margin: { top: 792, bottom: 720, left: marginTwips, right: marginTwips } } },
      children,
    }],
  });
  return Packer.toBuffer(document);
};

// ── Markdown ──────────────────────────────────────────────────────────────
export const renderResumeMarkdown = (spec, pools, profile) => {
  const out = [`# ${profile.name}`, profile.contact.map((item) => (item.url ? `[${item.text}](${item.url})` : item.text)).join(SEP)];
  for (const item of assemble(spec, pools)) {
    if (item.kind === 'section') out.push('', `## ${item.title}`);
    else if (item.kind === 'skill') out.push(`- **${item.label}:** ${item.items}`);
    else if (item.kind === 'entry') {
      out.push('', item.role
        ? `**${item.organization}**, ${item.location} — *${item.role}* (${item.dateLabel})`
        : `**${item.organization}** (${item.dateLabel})`);
    } else out.push(`- ${item.text}`);
  }
  return out.join('\n');
};

/** Render every format from one spec. The PDF pass decides the typography. */
export const renderResume = async (spec, pools, profile) => {
  const { pdf, pages, fit } = await renderResumePdf(spec, pools, profile);
  const docx = await renderResumeDocx(spec, pools, profile, { bodyPt: fit.bodyPt, marginIn: fit.marginIn });
  return { pdf, docx, markdown: renderResumeMarkdown(spec, pools, profile), pages, fit };
};

// ── Spec encoding + validation ────────────────────────────────────────────
// A spec is exactly a résumé config (scripts/resume/content/resumes/<slug>.json)
// plus the optional depth/fit keys. It travels in the URL as deflated JSON so a
// built résumé is fully reproducible from its link, with no server-side storage.
import { deflateSync, inflateSync } from 'node:zlib';
import { z } from 'zod';

const id = z.string().min(1).max(60);
const entrySection = z.object({
  type: z.enum(['education', 'experience', 'projects', 'leadership']),
  title: z.string().min(1).max(80),
  entries: z.array(z.object({
    id,
    bullets: z.array(id).max(10).optional(),
    variant: z.enum(['standard', 'deep', 'short']).optional(),
  })).max(24),
});
const skillsSection = z.object({
  type: z.literal('skills'),
  title: z.string().min(1).max(80),
  lines: z.array(id).max(16),
});

export const specSchema = z.object({
  slug: z.string().max(60).optional(),
  subject: z.string().max(120).optional(),
  pages: z.number().int().min(1).max(3).optional(),
  bodyPt: z.number().min(10).max(12).optional(),   // never below 10pt
  marginIn: z.number().min(0.5).max(1).optional(),
  detail: z.enum(['standard', 'deep', 'short']).optional(),
  autoFit: z.boolean().optional(),
  sections: z.array(z.union([entrySection, skillsSection])).min(1).max(8),
});

export const encodeSpec = (spec) => deflateSync(Buffer.from(JSON.stringify(spec), 'utf8')).toString('base64url');

export const decodeSpec = (encoded) => {
  if (typeof encoded !== 'string' || encoded.length > 8000) throw new Error('spec is missing or too large');
  return JSON.parse(inflateSync(Buffer.from(encoded, 'base64url')).toString('utf8'));
};
