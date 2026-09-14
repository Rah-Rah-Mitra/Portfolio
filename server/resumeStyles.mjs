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

// ── shared primitives ─────────────────────────────────────────────────────
export const measure = (doc, text, font, size, tracking = 0) => {
  doc.font(font).fontSize(size);
  return doc.widthOfString(text, tracking ? { characterSpacing: tracking } : undefined);
};

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
export const block = (lines, { size, spaceBefore = 0, spaceAfter = 0, keepWithNext = false, rule = false, indent = 0, hanging = 0, align = 'left', rightRun = null }) => ({
  lines, size, spaceBefore, spaceAfter, keepWithNext, rule, indent, hanging, align, rightRun,
});

const one = (doc, text, font, size, extra = {}) =>
  [[{ text, font, size, width: measure(doc, text, font, size), ...extra }]];

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
      { size: this.contactPt, spaceAfter: 4, align: 'center' },
    ));

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
      if (item.kind === 'entry') {
        // Two lines everywhere but projects, where the role reads as a label
        // and the extra line would cost the one-pagers one per project. Which
        // shape a section gets is the style's call, not a function of whether
        // `role` happens to be set — the Python builder makes the same one.
        const twoLine = Boolean(item.role) && item.sectionType !== 'projects';
        const rightOne = twoLine ? item.location : item.dateLabel;
        blocks.push(block(
          one(doc, item.organization, this.bold, bodyPt),
          { size: bodyPt, keepWithNext: true, rightRun: rightOne ? { text: rightOne, font: this.regular, size: bodyPt } : null },
        ));
        if (twoLine) {
          blocks.push(block(
            one(doc, item.role, this.italic, bodyPt),
            { size: bodyPt, spaceAfter: 1, keepWithNext: true, rightRun: { text: item.dateLabel, font: this.regular, size: bodyPt } },
          ));
        }
        return;
      }
      const runs = [{ text: this.bullet + item.text, font: this.regular, size: bodyPt }];
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

  docxChildren({ docx, items, profile, bodyPt, contentTwips }) {
    const { AlignmentType, BorderStyle, ExternalHyperlink, Paragraph, Tab, TabStopType, TextRun } = docx;
    const TWIP = 20;
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
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...single, before: 0, after: 4 * TWIP }, children: contact }));

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
      if (item.kind === 'entry') {
        const twoLine = Boolean(item.role) && item.sectionType !== 'projects';
        const rightOne = twoLine ? item.location : item.dateLabel;
        children.push(new Paragraph({
          spacing: { ...single, before: 0, after: 0 },
          keepNext: true,
          tabStops: [{ type: TabStopType.RIGHT, position: contentTwips }],
          children: [run(item.organization, { bold: true }), new TextRun({ size, font, children: [new Tab(), rightOne] })],
        }));
        if (twoLine) {
          children.push(new Paragraph({
            spacing: { ...single, before: 0, after: 1 * TWIP },
            keepNext: true,
            tabStops: [{ type: TabStopType.RIGHT, position: contentTwips }],
            children: [run(item.role, { italics: true }), new TextRun({ size, font, children: [new Tab(), item.dateLabel] })],
          }));
        }
        return;
      }
      children.push(new Paragraph({
        spacing: { ...single, before: 0, after: 1 * TWIP },
        indent: { left: 259, hanging: 259 },   // 0.18in hanging indent
        children: [run(this.bullet + item.text)],
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

const nus = {
  id: 'nus',
  pageW: 595.276,                 // A4, not the source document's US Letter
  pageH: 841.890,
  marginTop: 48,                  // 0.667in
  marginBottom: 48,
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

  // thinThickSmallGap at w:sz 18, as Word draws it: a 0.72pt hairline, a
  // 0.72pt gap, then a 2.16pt rule, the band starting 2.04pt below the
  // baseline. `y` arrives at the bottom of the text box, which is 2.04pt below
  // the 9.5pt baseline, so the band starts there.
  drawRule(doc, x, y, width) {
    doc.rect(x, y, width, 2.16).fillColor('#000000').fill();
    doc.rect(x, y + 2.88, width, 0.72).fillColor('#000000').fill();
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
    const spacer = (keepWithNext = false) => block([[]], { size: bodyPt, keepWithNext });
    const { indent, hanging } = this.bulletIndents(doc, bodyPt);

    blocks.push(block(one(doc, profile.name.toUpperCase(), this.bold, this.namePt), { size: this.namePt, align: 'right' }));
    const contactRuns = [];
    profile.contact.forEach((item, index) => {
      if (index) contactRuns.push({ text: this.sep, font: this.regular, size: this.contactPt });
      contactRuns.push({ text: item.text, font: this.regular, size: this.contactPt, link: item.url });
    });
    blocks.push(block(
      [contactRuns.map((run) => ({ ...run, width: measure(doc, run.text, run.font, run.size) }))],
      { size: this.contactPt, align: 'right' },
    ));

    let firstInSection = false;
    for (const item of items) {
      if (item.kind === 'section') {
        blocks.push(spacer(true));
        // 3.75pt of spaceAfter is the rule itself. A bordered paragraph in
        // Word is taller than its text by the whole border band, and
        // thinThickSmallGap draws three things for one w:sz — measured off the
        // Word output as 0.72pt hairline, 0.72pt gap, 2.16pt rule, sitting
        // 2.04pt below the baseline. w:sz 18 alone would have said 2.25.
        blocks.push(block(one(doc, item.title, this.bold, this.headerPt), { size: this.headerPt, spaceAfter: 3.75, keepWithNext: true, rule: true }));
        firstInSection = true;
        continue;
      }
      if (item.kind === 'skill') {
        blocks.push(block(
          wrapRuns(doc, [{ text: `${item.label}: ${item.items}`, font: this.regular, size: bodyPt }], contentWidth, contentWidth),
          { size: bodyPt },
        ));
        continue;
      }
      if (item.kind === 'entry') {
        if (!firstInSection) blocks.push(spacer(true));
        firstInSection = false;
        const line = (text, right) => block(
          one(doc, text, this.bold, bodyPt),
          { size: bodyPt, keepWithNext: true, rightRun: right ? { text: right, font: this.bold, size: bodyPt } : null },
        );
        if (item.sectionType === 'education') {
          blocks.push(line(item.organization, item.dateLabel));
          if (item.role) blocks.push(line(item.role, null));
        } else if (!item.role) {
          blocks.push(line(item.organization, item.dateLabel));
        } else {
          // Leadership flips the order — an employer leads a job, an
          // organisation leads a volunteer post. That is in the source.
          blocks.push(line(item.sectionType === 'leadership'
            ? `${item.organization}, ${item.role}`
            : `${item.role}, ${item.organization}`, item.dateLabel));
        }
        continue;
      }
      blocks.push(block(
        wrapRuns(doc, [{ text: this.bullet + item.text, font: this.regular, size: bodyPt }],
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

  docxChildren({ docx, items, profile, bodyPt, contentTwips }) {
    const { AlignmentType, BorderStyle, ExternalHyperlink, Paragraph, Tab, TabStopType, TextRun } = docx;
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
      if (item.kind === 'skill') {
        children.push(new Paragraph({ ...plain, children: [run(`${item.label}: ${item.items}`)] }));
        continue;
      }
      if (item.kind === 'entry') {
        if (!firstInSection) children.push(spacer());
        firstInSection = false;
        const line = (text, right) => new Paragraph({
          ...plain,
          keepNext: true,
          tabStops: [{ type: TabStopType.RIGHT, position: contentTwips }],
          children: right
            ? [run(text, { bold: true }), run(`\t${right}`, { bold: true })]
            : [run(text, { bold: true })],
        });
        if (item.sectionType === 'education') {
          children.push(line(item.organization, item.dateLabel));
          if (item.role) children.push(line(item.role, null));
        } else if (!item.role) {
          children.push(line(item.organization, item.dateLabel));
        } else {
          children.push(line(item.sectionType === 'leadership'
            ? `${item.organization}, ${item.role}`
            : `${item.role}, ${item.organization}`, item.dateLabel));
        }
        continue;
      }
      children.push(new Paragraph({
        ...plain,
        indent: { left: 780, hanging: hangingTwips },
        children: [run(this.bullet + item.text)],
      }));
    }
    return children;
  },
};

export const STYLES = { nus, harvard };
export const DEFAULT_STYLE = 'nus';
export const styleFor = (name) => STYLES[name] ?? STYLES[DEFAULT_STYLE];
