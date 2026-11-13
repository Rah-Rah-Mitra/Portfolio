// resumeStyles.mjs: the two résumé styles, plus the measuring primitives they
// share. This is the JS side of scripts/resume/{nus,harvard}_style.py — the
// Python + MS Word pipeline stays the source of truth for the eight canonical
// résumés, and these have to agree with it or a custom build looks like a
// different document.
//
// resumeRender.mjs owns everything a style does NOT decide: page flow, the fit
// ladder, the spec codec. A style owns geometry, type, and what a section,
// entry, skills line and bullet look like in both PDF and DOCX.
//
// Imports only pdfkit's measuring surface through the `doc` handed in, so the
// checker and the builder window can reach the constants without a PDF engine.
// resumeAssemble.mjs imports nothing, so it costs them nothing either.
import { bulletLine } from './resumeAssemble.mjs';

// ── shared primitives ─────────────────────────────────────────────────────
// Type is set as Word sets it: unkerned. Neither builder writes w:kern, so Word
// lays a résumé out with each glyph's own advance, while pdfkit kerns its
// Standard-14 fonts by default, both in what it measures and in what it draws.
// Kerned, a measured line came out a fraction of a point short of Word's, so the
// builder kept a word Word wrapped ("comparing 3" with 0.4pt to spare) and its
// line ends drifted from the DOCX it ships beside; drawn kerned, a comma tucked
// under a T ("BERT,") where Word's sits clear of it. useFont switches pdfkit's
// kerning off for each font a document selects (pdfkit builds a font object per
// document, so nothing outside that document changes): what the builder
// measures is then what it draws, and both are Word's. With the hyphen breaks in
// wrapRuns this matches every line end of Word's export of the eight canonical
// résumés (467 lines, 2026-11-13; scripts/resume/word_parity.mjs re-checks it).
export const useFont = (doc, font, size) => {
  doc.font(font).fontSize(size);
  const afm = doc._font?.font;
  if (afm && typeof afm.getKernPair === 'function' && !afm.unkerned) {
    afm.getKernPair = () => 0;
    afm.unkerned = true;
  }
  return doc;
};

export const measure = (doc, text, font, size, tracking = 0) => {
  useFont(doc, font, size);
  return doc.widthOfString(text, tracking ? { characterSpacing: tracking } : undefined);
};

// Word breaks a line after a hyphen that joins two letters or digits ("sign-" /
// "ups", "5-" / "stage"); without that break opportunity the builder pushed the
// whole compound down and its lines disagreed with Word's.
const HYPHEN_BREAK = /(?<=[A-Za-z0-9]-)(?=[A-Za-z0-9])/;

// Greedy word wrap. We do our own so line boxes are ours to place, which is
// what makes the page count exact rather than discovered after the fact.
export const wrapRuns = (doc, runs, firstWidth, restWidth) => {
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
    const words = run.text.split(/(\s+)/).filter((part) => part !== '')
      .flatMap((part) => (part.trim() ? part.split(HYPHEN_BREAK) : [part]));
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
export const block = (lines, { size, spaceBefore = 0, spaceAfter = 0, keepWithNext = false, rule = false, indent = 0, hanging = 0, align = 'left', rightRun = null, heading = null, wrapped = false }) => ({
  lines, size, spaceBefore, spaceAfter, keepWithNext, rule, indent, hanging, align, rightRun, heading, wrapped,
});

const one = (doc, text, font, size, extra = {}) =>
  [[{ text, font, size, width: measure(doc, text, font, size), ...extra }]];

const lineText = (line) => line.map((run) => run.text).join('');

/**
 * An entry heading and its right-flush column (the dates, or harvard's
 * location), laid out the way the DOCX will print it.
 *
 * Word keeps the two on one line only while the text leaves room for the right
 * column; past that it wraps at the tab and splits the date itself ("… (NUS
 * Capstone) Aug" over "2026 – Present"), and the builder used to draw the text
 * straight over the date. Here the text wraps first, to what the right column
 * and a space leave of line 1, so the date keeps line 1 and the rest of the text
 * runs on underneath. `wrapped` says it had to: the fit ladder steps the type
 * down rather than print that while a smaller size holds the heading on one
 * line. A space is the margin because at less, Word prints the date glued to the
 * text ("(NUS Capstone)Aug 2026"), which verify_resumes.py fails.
 *
 * `first` and `rest` are the same split as text, for the DOCX: `first + rest` is
 * the heading exactly (wrapRuns keeps a line's trailing space and drops the next
 * line's leading one). That trailing space stays before the tab, where it fits:
 * the room above already set a space aside, and dropping it ran the words
 * together for anything that reads the DOCX as text ("STMicroelectronics(NUS").
 *
 * @param {any} doc a pdfkit document, for its font metrics
 * @param {{ text: string, font: string, size: number, right?: string | null, rightFont?: string, contentWidth: number }} options
 */
export const headingLayout = (doc, { text, font, size, right = null, rightFont = font, contentWidth }) => {
  const room = right ? contentWidth - measure(doc, right, rightFont, size) - measure(doc, ' ', font, size) : contentWidth;
  const lines = wrapRuns(doc, [{ text, font, size }], room, contentWidth);
  return {
    lines,
    wrapped: Boolean(right) && lines.length > 1,
    first: lineText(lines[0] ?? []),
    rest: lines.slice(1).map(lineText).join(''),
  };
};

/** headingLayout as a block, keep-with-next like every entry line. */
const headingBlock = (doc, { text, font, size, right, rightFont, contentWidth, ...options }) => {
  const layout = headingLayout(doc, { text, font, size, right, rightFont, contentWidth });
  return block(layout.lines, {
    size,
    keepWithNext: true,
    rightRun: right ? { text: right, font: rightFont, size } : null,
    heading: text,
    wrapped: layout.wrapped,
    ...options,
  });
};

/**
 * The DOCX runs of a heading: the text's first line, a tab to the right-flush
 * column, then a line break and the rest when headingLayout had to wrap. The
 * break is explicit so Word prints the split the PDF measured rather than
 * choosing its own, which split the date.
 */
const headingRuns = (docx, layout, right, textRun, rightRun) => {
  if (!right) return [textRun(layout.first + layout.rest)];
  const runs = [textRun(layout.first), rightRun([new docx.Tab(), right])];
  if (layout.rest) runs.push(textRun(layout.rest, { break: 1 }));
  return runs;
};

// ── harvard ───────────────────────────────────────────────────────────────
// Calibrated by extracting glyph positions from the Word-built
// rahul-mitra-highlights-2026-09.pdf, not guessed: line advance is 1.152x the
// nominal point size and the baseline sits 0.93x below the line-box top.
// 1.152 is (hhea.ascender + |descender| + lineGap) / unitsPerEm for Times New
// Roman = 2355/2048 = 1.1499, and 0.93 is (ascender + lineGap)/upem = 0.9336.
const HEADER_TRACKING = 1;        // w:spacing w:val="20" = 1pt

const harvard = {
  id: 'harvard',
  pageW: 595.276,                 // A4
  pageH: 841.890,
  marginTop: 39.6,                // 0.55in
  marginBottom: 36,               // 0.5in
  marginLR: 50.4,                 // 0.7in default
  namePt: 16,
  contactPt: 9.5,
  bodyPt: 10.5,
  minBodyPt: 10,
  regular: 'Times-Roman',
  bold: 'Times-Bold',
  italic: 'Times-Italic',
  docxFont: 'Times New Roman',
  lineRatio: 1.152,
  ascentRatio: 0.93,
  bullet: '• ',
  sep: ' · ',
  bulletIndent: 12.96,            // 0.18in hanging indent
  // The trim ladder from .agents/skills/resume-editing/SKILL.md, typography
  // half only. Content is never dropped automatically; the caller chose it.
  fitLadder: [
    { bodyPt: null, marginIn: null },
    { bodyPt: 10, marginIn: null },
    { bodyPt: 10, marginIn: 0.6 },
    { bodyPt: 10, marginIn: 0.5 },
  ],

  // A single border at w:space 1 sits 1pt below the text box.
  ruleGap: 1,
  drawRule(doc, x, y, width) {
    doc.moveTo(x, y).lineTo(x + width, y).lineWidth(0.75).strokeColor('#000000').stroke();
  },

  buildBlocks({ doc, items, profile, bodyPt, contentWidth }) {
    const blocks = [];
    blocks.push(block(one(doc, profile.name, this.bold, this.namePt), { size: this.namePt, spaceAfter: 2, align: 'center' }));

    const contactRuns = [];
    profile.contact.forEach((item, index) => {
      if (index) contactRuns.push({ text: this.sep, font: this.regular, size: this.contactPt });
      contactRuns.push({ text: item.text, font: this.regular, size: this.contactPt, link: item.url });
    });
    blocks.push(block(
      [contactRuns.map((run) => ({ ...run, width: measure(doc, run.text, run.font, run.size) }))],
      { size: this.contactPt, spaceAfter: profile.availability ? 0 : 4, align: 'center' },
    ));
    // Its own centered line, as harvard_style.py prints it: inline, this
    // style's 9.5pt Times contact line runs past a 0.7in content width.
    if (profile.availability) {
      blocks.push(block(one(doc, profile.availability, this.bold, this.contactPt), { size: this.contactPt, spaceAfter: 4, align: 'center' }));
    }

    items.forEach((item, index) => {
      if (item.kind === 'section') {
        blocks.push(block(
          one(doc, item.title, this.bold, bodyPt, { tracking: HEADER_TRACKING, width: measure(doc, item.title, this.bold, bodyPt, HEADER_TRACKING) }),
          // A bordered paragraph also reserves the rule's gap and stroke below
          // the text, which is why Word's gap here is 3.75pt rather than 2.
          { size: bodyPt, spaceBefore: index === 0 ? 3 : 6, spaceAfter: 2 + 1 + 0.75, keepWithNext: true, rule: true },
        ));
        return;
      }
      if (item.kind === 'skill') {
        const runs = [
          { text: `${item.label}: `, font: this.bold, size: bodyPt },
          { text: item.items, font: this.regular, size: bodyPt },
        ];
        blocks.push(block(wrapRuns(doc, runs, contentWidth, contentWidth), { size: bodyPt, spaceAfter: 1 }));
        return;
      }
      if (item.kind === 'text') {
        blocks.push(block(wrapRuns(doc, [{ text: item.text, font: this.regular, size: bodyPt }], contentWidth, contentWidth), { size: bodyPt, spaceAfter: 1 }));
        return;
      }
      if (item.kind === 'entry' && item.inline) return; // printed inside its bullet
      if (item.kind === 'entry') {
        // Two lines everywhere but projects, where the role reads as a label
        // and the extra line would cost the one-pagers one per project. Which
        // shape a section gets is the style's call, not a function of whether
        // `role` happens to be set — the Python builder makes the same one.
        const twoLine = Boolean(item.role) && item.sectionType !== 'projects';
        const rightOne = twoLine ? item.location : item.dateLabel;
        blocks.push(headingBlock(doc, {
          text: item.organization, font: this.bold, size: bodyPt, right: rightOne || null, rightFont: this.regular, contentWidth,
        }));
        if (twoLine) {
          blocks.push(headingBlock(doc, {
            text: item.role, font: this.italic, size: bodyPt, right: item.dateLabel || null, rightFont: this.regular, contentWidth, spaceAfter: 1,
          }));
        }
        return;
      }
      const runs = [{ text: this.bullet + bulletLine(item), font: this.regular, size: bodyPt }];
      blocks.push(block(
        wrapRuns(doc, runs, contentWidth, contentWidth - this.bulletIndent),
        { size: bodyPt, spaceAfter: 1, hanging: this.bulletIndent },
      ));
    });
    return blocks;
  },

  bulletWrap(doc, text, bodyPt, contentWidth) {
    return wrapRuns(doc, [{ text: this.bullet + text, font: this.regular, size: bodyPt }],
      contentWidth, contentWidth - this.bulletIndent);
  },

  docxChildren({ docx, doc, items, profile, bodyPt, contentTwips }) {
    const { AlignmentType, BorderStyle, ExternalHyperlink, Paragraph, TabStopType, TextRun } = docx;
    const TWIP = 20;
    const contentWidth = contentTwips / TWIP;
    const size = Math.round(bodyPt * 2);
    const single = { line: 240, lineRule: 'auto' };
    const font = this.docxFont;
    const run = (text, extra = {}) => new TextRun({ text, size, font, ...extra });
    const children = [];

    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { ...single, before: 0, after: 2 * TWIP },
      children: [new TextRun({ text: profile.name, bold: true, size: this.namePt * 2, font })],
    }));

    const contact = [];
    profile.contact.forEach((item, index) => {
      if (index) contact.push(new TextRun({ text: this.sep, size: this.contactPt * 2, font }));
      const inner = new TextRun({ text: item.text, size: this.contactPt * 2, font, color: '000000' });
      contact.push(item.url ? new ExternalHyperlink({ link: item.url, children: [inner] }) : inner);
    });
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...single, before: 0, after: (profile.availability ? 0 : 4) * TWIP }, children: contact }));
    if (profile.availability) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { ...single, before: 0, after: 4 * TWIP },
        children: [new TextRun({ text: profile.availability, bold: true, size: this.contactPt * 2, font })],
      }));
    }

    items.forEach((item, index) => {
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
      if (item.kind === 'text') {
        children.push(new Paragraph({ spacing: { ...single, before: 0, after: 1 * TWIP }, children: [run(item.text)] }));
        return;
      }
      if (item.kind === 'entry' && item.inline) return;
      if (item.kind === 'entry') {
        const twoLine = Boolean(item.role) && item.sectionType !== 'projects';
        const rightOne = twoLine ? item.location : item.dateLabel;
        const rightRun = (parts) => new TextRun({ size, font, children: parts });
        const line = (text, textFont, right, emphasis, after) => new Paragraph({
          spacing: { ...single, before: 0, after },
          keepNext: true,
          tabStops: [{ type: TabStopType.RIGHT, position: contentTwips }],
          children: headingRuns(docx, headingLayout(doc, { text, font: textFont, size: bodyPt, right, rightFont: this.regular, contentWidth }),
            right, (part, extra = {}) => run(part, { ...emphasis, ...extra }), rightRun),
        });
        children.push(line(item.organization, this.bold, rightOne || null, { bold: true }, 0));
        if (twoLine) children.push(line(item.role, this.italic, item.dateLabel || null, { italics: true }, 1 * TWIP));
        return;
      }
      children.push(new Paragraph({
        spacing: { ...single, before: 0, after: 1 * TWIP },
        indent: { left: 259, hanging: 259 },   // 0.18in hanging indent
        children: [run(this.bullet + bulletLine(item))],
      }));
    });
    return children;
  },
};

// ── nus ───────────────────────────────────────────────────────────────────
// The NUS Centre for Future-ready Graduates format (see
// public/resume/template/NUS Resume - Y3-Y4.docx), as realised in Rahul's
// master CV. Every number was measured out of that DOCX; see nus_style.py for
// the full reading, which this file has to agree with.
//
// lineRatio is the same 1.152 as Times, which is not a copy-paste: Arial's
// hhea is (1854 + 434 + 67)/2048 = 1.1499, the identical figure. ascentRatio
// differs — (1854 + 67)/2048 = 0.938 against Times' 0.934.
const BULLET_LEFT = 39;           // w:ind w:left="780" twips = 0.5417in = 39pt

// One bold line per entry, in the name order the Nov 2026 master CV prints:
// Role, Organization everywhere except national service, where the service
// leads ("Republic of Singapore Navy, Naval Chef & Base Support Assistant").
// Leadership used to flip too; the CV's co-curricular entries no longer do.
// nus_style.py:add_entry is the same rule.
const nusEntryHead = (item) => (item.sectionType === 'national-service'
  ? `${item.organization}, ${item.role}`
  : `${item.role}, ${item.organization}`);

/** The nus line that carries an entry's dates: education and role-less entries print the organization alone. */
export const nusDatedHeading = (item) => (item.sectionType === 'education' || !item.role ? item.organization : nusEntryHead(item));

const nus = {
  id: 'nus',
  pageW: 595.276,                 // A4, not the source document's US Letter
  pageH: 841.890,
  marginTop: 36,                  // 0.5in, the 2 Nov 2026 master CV (was 0.667in)
  marginBottom: 36,
  marginLR: 36,                   // 0.5in
  namePt: 19.5,
  contactPt: 8.5,
  headerPt: 9.5,
  // The starting size, not the shipped one: the fit ladder walks down from
  // here and every one of the eight canonical résumés lands lower. 8.5 is the
  // floor — the size the source document settled on to hold two pages.
  bodyPt: 10.5,
  minBodyPt: 8.5,
  regular: 'Helvetica',           // metrically identical to Arial
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  docxFont: 'Arial',
  lineRatio: 1.152,
  ascentRatio: 0.938,
  bullet: '• ',
  sep: ' | ',           // NBSPs so the contact line never breaks
  bulletLeft: BULLET_LEFT,
  fitLadder: [
    { bodyPt: null, marginIn: null },
    { bodyPt: 10, marginIn: null },
    { bodyPt: 9.5, marginIn: null },
    { bodyPt: 9, marginIn: null },
    { bodyPt: 8.5, marginIn: null },
  ],

  // thinThickSmallGap at w:sz 18, as Word draws it under the text: a 2.16pt
  // rule, a 0.72pt gap, then a 0.72pt hairline, the band starting 2.04pt below
  // the baseline. `y` arrives at the bottom of the text box, which is 2.04pt
  // below the 9.5pt baseline, so the band starts there: w:space 0, no gap (the
  // 1pt harvard's border asks for was once applied here too, dropping the rule
  // a point below Word's). Word also runs a paragraph border 1.44pt past each
  // margin (x 34.56-560.86 on a 36-559.28 text column).
  ruleGap: 0,
  drawRule(doc, x, y, width) {
    const overhang = 1.44;
    doc.rect(x - overhang, y, width + overhang * 2, 2.16).fillColor('#000000').fill();
    doc.rect(x - overhang, y + 2.88, width + overhang * 2, 0.72).fillColor('#000000').fill();
  },

  // Indents for a literal bullet: the text column is fixed at 780 twips and the
  // glyph hangs to its left by exactly its own width, so wrapped lines land
  // under the text. The source gets that from a numbering tab stop.
  bulletIndents(doc, bodyPt) {
    const hanging = measure(doc, this.bullet, this.regular, bodyPt);
    return { indent: BULLET_LEFT - hanging, hanging };
  },

  buildBlocks({ doc, items, profile, bodyPt, contentWidth }) {
    const blocks = [];
    // A blank line is its own paragraph, NOT kept with the next, exactly like
    // docx_base.blank: at a page break Word leaves it at the foot of the page
    // and starts the next one on the heading. Kept-with-next, the builder carried
    // the blank line over and opened the page a line lower than Word.
    const spacer = () => block([[]], { size: bodyPt });
    const { indent, hanging } = this.bulletIndents(doc, bodyPt);

    blocks.push(block(one(doc, profile.name.toUpperCase(), this.bold, this.namePt), { size: this.namePt, align: 'right' }));
    const contactRuns = [];
    profile.contact.forEach((item, index) => {
      if (index) contactRuns.push({ text: this.sep, font: this.regular, size: this.contactPt });
      contactRuns.push({ text: item.text, font: this.regular, size: this.contactPt, link: item.url });
    });
    // The bold start date closes the same line, as nus_style.py prints it.
    if (profile.availability) {
      contactRuns.push({ text: this.sep, font: this.regular, size: this.contactPt });
      contactRuns.push({ text: profile.availability, font: this.bold, size: this.contactPt });
    }
    blocks.push(block(
      [contactRuns.map((run) => ({ ...run, width: measure(doc, run.text, run.font, run.size) }))],
      { size: this.contactPt, align: 'right' },
    ));

    let firstInSection = false;
    for (const item of items) {
      if (item.kind === 'section') {
        blocks.push(spacer());
        // 3.75pt of spaceAfter is the rule itself. A bordered paragraph in
        // Word is taller than its text by the whole border band, and
        // thinThickSmallGap draws three things for one w:sz — measured off the
        // Word output as 0.72pt hairline, 0.72pt gap, 2.16pt rule, sitting
        // 2.04pt below the baseline. w:sz 18 alone would have said 2.25.
        blocks.push(block(one(doc, item.title, this.bold, this.headerPt), { size: this.headerPt, spaceAfter: 3.75, keepWithNext: true, rule: true }));
        firstInSection = true;
        continue;
      }
      if (item.kind === 'skill' || item.kind === 'text') {
        const text = item.kind === 'skill' ? `${item.label}: ${item.items}` : item.text;
        blocks.push(block(
          wrapRuns(doc, [{ text, font: this.regular, size: bodyPt }], contentWidth, contentWidth),
          { size: bodyPt },
        ));
        continue;
      }
      if (item.kind === 'entry') {
        // An inline entry is printed inside its own bullet, so it has no line
        // and no blank line of its own: the master CV's projects run as a list.
        if (item.inline) continue;
        if (!firstInSection) blocks.push(spacer());
        firstInSection = false;
        const line = (text, right) => headingBlock(doc, {
          text, font: this.bold, size: bodyPt, right: right || null, rightFont: this.bold, contentWidth,
        });
        blocks.push(line(nusDatedHeading(item), item.dateLabel));
        if (item.sectionType === 'education' && item.role) blocks.push(line(item.role, null));
        continue;
      }
      blocks.push(block(
        wrapRuns(doc, [{ text: this.bullet + bulletLine(item), font: this.regular, size: bodyPt }],
          contentWidth - indent, contentWidth - indent - hanging),
        { size: bodyPt, indent, hanging },
      ));
    }
    return blocks;
  },

  bulletWrap(doc, text, bodyPt, contentWidth) {
    const { indent, hanging } = this.bulletIndents(doc, bodyPt);
    return wrapRuns(doc, [{ text: this.bullet + text, font: this.regular, size: bodyPt }],
      contentWidth - indent, contentWidth - indent - hanging);
  },

  docxChildren({ docx, doc, items, profile, bodyPt, contentTwips }) {
    const { AlignmentType, BorderStyle, ExternalHyperlink, Paragraph, TabStopType, TextRun } = docx;
    const contentWidth = contentTwips / 20;
    const size = Math.round(bodyPt * 2);
    const single = { line: 240, lineRule: 'auto' };
    const font = this.docxFont;
    const run = (text, extra = {}) => new TextRun({ text, size, font, ...extra });
    const plain = { spacing: { ...single, before: 0, after: 0 } };
    const spacer = () => new Paragraph({ ...plain, children: [run(' ')] });
    const children = [];

    children.push(new Paragraph({
      ...plain,
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: profile.name.toUpperCase(), bold: true, size: this.namePt * 2, font })],
    }));
    const contact = [];
    profile.contact.forEach((item, index) => {
      if (index) contact.push(new TextRun({ text: this.sep, size: this.contactPt * 2, font }));
      const inner = new TextRun({ text: item.text, size: this.contactPt * 2, font, color: '000000' });
      contact.push(item.url ? new ExternalHyperlink({ link: item.url, children: [inner] }) : inner);
    });
    if (profile.availability) {
      contact.push(new TextRun({ text: this.sep, size: this.contactPt * 2, font }));
      contact.push(new TextRun({ text: profile.availability, bold: true, size: this.contactPt * 2, font }));
    }
    children.push(new Paragraph({ ...plain, alignment: AlignmentType.RIGHT, children: contact }));

    // 0.5417in text column, glyph hanging to its left by its own width. 0.628
    // em is "• " under Arial metrics (bullet 350 + space 278 per 1000).
    const hangingTwips = Math.round(0.628 * bodyPt * 20);
    let firstInSection = false;
    for (const item of items) {
      if (item.kind === 'section') {
        children.push(spacer());
        children.push(new Paragraph({
          ...plain,
          keepNext: true,
          border: { bottom: { style: BorderStyle.THIN_THICK_SMALL_GAP, size: 18, space: 0, color: '000000' } },
          children: [new TextRun({ text: item.title, bold: true, size: this.headerPt * 2, font })],
        }));
        firstInSection = true;
        continue;
      }
      if (item.kind === 'skill' || item.kind === 'text') {
        children.push(new Paragraph({ ...plain, children: [run(item.kind === 'skill' ? `${item.label}: ${item.items}` : item.text)] }));
        continue;
      }
      if (item.kind === 'entry') {
        if (item.inline) continue;
        if (!firstInSection) children.push(spacer());
        firstInSection = false;
        // A real <w:tab/> before the date, as nus_style.py writes it (this used
        // to be a literal tab character inside <w:t>), and the PDF's own split
        // when the heading cannot hold its date on one line.
        const line = (text, right) => new Paragraph({
          ...plain,
          keepNext: true,
          tabStops: [{ type: TabStopType.RIGHT, position: contentTwips }],
          children: headingRuns(docx, headingLayout(doc, { text, font: this.bold, size: bodyPt, right: right || null, contentWidth }),
            right || null, (part, extra = {}) => run(part, { bold: true, ...extra }), (parts) => new TextRun({ size, font, bold: true, children: parts })),
        });
        children.push(line(nusDatedHeading(item), item.dateLabel));
        if (item.sectionType === 'education' && item.role) children.push(line(item.role, null));
        continue;
      }
      children.push(new Paragraph({
        ...plain,
        indent: { left: 780, hanging: hangingTwips },
        children: [run(this.bullet + bulletLine(item))],
      }));
    }
    return children;
  },
};

export const STYLES = { nus, harvard };
export const DEFAULT_STYLE = 'nus';
export const styleFor = (name) => STYLES[name] ?? STYLES[DEFAULT_STYLE];
