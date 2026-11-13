import { inflateRawSync } from 'node:zlib';
// @ts-expect-error -- pdfkit ships no type declarations; the renderer it serves is plain JS
import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';
import {
  REFERENCE_LAYOUT, TIER_BUDGETS, layoutResume, measureBulletLines, referenceBodyPt, referenceEntry, referenceLines,
  renderResume, renderResumeMarkdown, renderResumePdf,
} from '../server/resumeRender.mjs';
import { headingLayout, measure, useFont, wrapRuns } from '../server/resumeStyles.mjs';
import { configBySlug, pools, profile, resumeConfigs } from '../server/resumeContent.mjs';

// The builder against Microsoft Word (2026-11-13). Word was installed on the
// build machine that day and showed the builder's PDF and the DOCX it ships
// beside it disagreeing: headings drawn over their dates, a one-page link whose
// DOCX ran to two pages, line ends a word apart. scripts/resume/word_parity.mjs
// is the end-to-end check against Word itself (19 documents, 1,460 lines, all
// identical); these pin the rules that made it pass, so a change that undoes one
// fails here without Word installed.

type Spec = { slug?: string; pages: number; bodyPt?: number; marginIn?: number; autoFit?: boolean; sections: unknown[] };
type Fit = { bodyPt: number; fitted: boolean; wrappedHeadings: string[]; attempts: Array<{ bodyPt: number }> };
type Run = { text: string };

const configs = resumeConfigs as Spec[];
const unpinned = ({ bodyPt: _bodyPt, marginIn: _marginIn, ...rest }: Spec) => rest as Spec;
const doc = () => new PDFDocument({ autoFirstPage: false });
const CONTENT_WIDTH = 595.276 - 72; // nus: A4 less its 0.5in margins

// The heading lines the canonical one-pagers print, as Word measures them.
const STMICRO = 'Warehouse AI & Operations Research Engineer (Part-Time), STMicroelectronics (NUS Capstone)';
const ABBOTT_CONTRACT = 'Global Operational AI Systems & Data Engineer (Part-Time), Abbott Laboratories (Contract)';
const ABBOTT_INTERN = 'Data Analytics & Product Management Intern, Abbott Laboratories (Converted to Contract)';

/** One file out of a DOCX (a zip), by its central directory. */
const unzip = (zip: Buffer, name: string) => {
  let end = zip.length - 22;
  while (zip.readUInt32LE(end) !== 0x06054b50) end -= 1;
  let at = zip.readUInt32LE(end + 16);
  for (let entry = 0; entry < zip.readUInt16LE(end + 10); entry += 1) {
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const entryName = zip.toString('utf8', at + 46, at + 46 + nameLength);
    if (entryName === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return (zip.readUInt16LE(at + 10) === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  throw new Error(`${name} not in the archive`);
};

describe('measuring like Word', () => {
  it('measures and draws without kerning, as Word sets these documents', () => {
    // "AV" is a kerned pair in Helvetica: by default pdfkit sets it tighter than
    // Word does. A document whose fonts went through useFont measures (and so
    // draws) each glyph at its own advance. If a pdfkit upgrade moves the
    // internals useFont reaches into, the first assertion fails here.
    const ours = doc();
    const pdfkits = doc();
    const glyphs = 3 * (measure(ours, 'A', 'Helvetica', 10) + measure(ours, 'V', 'Helvetica', 10));
    expect(measure(ours, 'AVAVAV', 'Helvetica', 10)).toBeCloseTo(glyphs, 6);
    pdfkits.font('Helvetica').fontSize(10);
    expect(pdfkits.widthOfString('AVAVAV')).toBeLessThan(glyphs);
    // And only that document: a fresh one still kerns until it selects a font through useFont.
    expect(useFont(doc(), 'Helvetica', 10).widthOfString('AVAVAV')).toBeCloseTo(glyphs, 6);
    ours.end();
    pdfkits.end();
  });

  it('breaks a line after a hyphen between letters or digits, never before one', () => {
    const d = doc();
    const text = 'keeping balloting fair for 150 sign-ups at release';
    const upTo = measure(d, 'keeping balloting fair for 150 sign-', 'Helvetica', 10);
    const lines = (wrapRuns(d, [{ text, font: 'Helvetica', size: 10 }], upTo + 1, 500) as Run[][])
      .map((line) => line.map((run) => run.text).join(''));
    expect(lines).toEqual(['keeping balloting fair for 150 sign-', 'ups at release']);
    d.end();
  });
});

describe('entry headings never run into their dates', () => {
  it('wraps a heading before its date when the date would not fit beside it', () => {
    const d = doc();
    const layout = headingLayout(d, { text: STMICRO, font: 'Helvetica-Bold', size: 10.5, right: 'Aug 2026 – Present', contentWidth: CONTENT_WIDTH });
    expect(layout.wrapped).toBe(true);
    // The first line leaves the date its own width plus a space.
    expect(measure(d, layout.first, 'Helvetica-Bold', 10.5) + measure(d, ' Aug 2026 – Present', 'Helvetica-Bold', 10.5)).toBeLessThanOrEqual(CONTENT_WIDTH);
    expect(layout.first + layout.rest).toBe(STMICRO);
    d.end();
  });

  it('holds each long heading on one line exactly where Word does', () => {
    const d = doc();
    const wraps = (text: string, date: string, size: number) => headingLayout(d, { text, font: 'Helvetica-Bold', size, right: date, contentWidth: CONTENT_WIDTH }).wrapped;
    // Word: STMicro's date glued to its text at 9.5pt, both Abbott headings split at 10pt.
    expect([9, 9.5].map((pt) => wraps(STMICRO, 'Aug 2026 – Present', pt))).toEqual([false, true]);
    expect([9.5, 10].map((pt) => wraps(ABBOTT_CONTRACT, 'Jun 2026 – Present', pt))).toEqual([false, true]);
    expect([9.5, 10].map((pt) => wraps(ABBOTT_INTERN, 'Jan 2026 – Jun 2026', pt))).toEqual([false, true]);
    d.end();
  });

  it('auto-fits every canonical résumé to a size where every heading holds its date', async () => {
    for (const config of configs) {
      const { fit } = await renderResumePdf(unpinned(config), pools, profile) as { fit: Fit };
      expect(fit.fitted, config.slug).toBe(true);
      expect(fit.wrappedHeadings, config.slug).toEqual([]);
      // All of them print STMicro, which needs 9pt: no larger rung can be taken.
      expect(fit.bodyPt, config.slug).toBeLessThanOrEqual(9);
    }
  });

  it('wraps cleanly at a size the spec fixes, in the PDF layout and in the DOCX alike', async () => {
    const spec = { ...configBySlug('ai-engineer'), bodyPt: 10.5, autoFit: false } as Spec;
    const result = await renderResume(spec, pools, profile) as { docx: Buffer; fit: Fit; spec: Spec };
    expect(result.fit.wrappedHeadings).toEqual([STMICRO, ABBOTT_CONTRACT, ABBOTT_INTERN]);
    const layout = layoutResume(result.spec, pools, profile, result.fit) as { paragraphs: Array<{ lines: number; text: string }> };
    const stmicro = layout.paragraphs.find((row) => row.text.startsWith('Warehouse AI'));
    expect(stmicro?.lines).toBe(2);
    // The DOCX carries the PDF's split: line 1, a real tab, the date, a break, the rest.
    const xml = unzip(result.docx, 'word/document.xml');
    const paragraph = xml.split('<w:p>').find((part) => part.includes('Warehouse AI')) ?? '';
    expect(paragraph).toMatch(/Warehouse AI[^<]*<\/w:t>.*<w:tab\/>.*Aug 2026 – Present.*<w:br\/>.*\(NUS Capstone\)/s);
    expect(xml).not.toContain('\t');
  });

  it('only steps down from a size the spec asks for', async () => {
    const { fit } = await renderResumePdf({ ...configBySlug('general'), pages: 1, bodyPt: 9 } as Spec, pools, profile) as { fit: Fit };
    expect(Math.max(...fit.attempts.map((attempt) => attempt.bodyPt))).toBe(9);
  });
});

describe('tier budgets at the size an entry can print at', () => {
  const entry = (sectionType: string, id: string) => referenceEntry(pools, sectionType, id);

  it('budgets STMicro at 9pt and the Abbott entries at 9.5pt, where their headings fit', () => {
    expect(referenceBodyPt(entry('experience', 'stmicro-or'))).toBe(9);
    expect(referenceBodyPt(entry('experience', 'abbott-contract'))).toBe(9.5);
    expect(referenceBodyPt(entry('experience', 'abbott-intern'))).toBe(9.5);
    expect(referenceBodyPt(entry('experience', 'pa'))).toBe(REFERENCE_LAYOUT.bodyPt);
    expect(referenceBodyPt(entry('education', 'nus'))).toBe(REFERENCE_LAYOUT.bodyPt);
  });

  it("keeps STMicro's short to one line at the size every build prints it at", () => {
    const short = (pools.experience.entries as unknown as Array<{ id: string; bullets: Array<{ id: string; text: Record<string, string> }> }>)
      .find((row) => row.id === 'stmicro-or')!.bullets.find((bullet) => bullet.id === 'layout-agnostic')!.text.short;
    // At a flat 10pt Word wraps its last word ("plan."), but no auto-fitted
    // build that prints it can be at 10pt: its own heading holds it to 9.
    expect(measureBulletLines([short], REFERENCE_LAYOUT)).toEqual([2]);
    expect(referenceLines([short], [entry('experience', 'stmicro-or')])).toEqual([TIER_BUDGETS.short]);
  });
});

describe('Markdown', () => {
  it('prints no empty location', () => {
    for (const config of configs) expect(renderResumeMarkdown(config, pools, profile), config.slug).not.toMatch(/\*\*,\s+·|,\s+·/);
  });
});
