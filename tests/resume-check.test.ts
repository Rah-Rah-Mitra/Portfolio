import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHECK_VERSION, LEXICON, checkPool, checkResume, framesIn, hedgesIn,
  isLabelLine, isOngoing, isWinAnsi, leadLemma, metricsIn,
} from '../server/resumeCheck.mjs';
import { checkSpec, decoratedBlocks } from '../server/portfolioMcp.mjs';
import { pools, resumeConfigs } from '../server/resumeContent.mjs';
import { poolEntries } from '../scripts/resume/lint_pool.mjs';

// server/*.mjs is plain JS, so name the shapes this test relies on.
type Occurrence = { ref: string; surface?: string; lines?: number };
type Finding = {
  rule: string; severity: 'error' | 'warn' | 'note'; category: string;
  where: Record<string, unknown>; occurrences: Occurrence[]; more?: number;
  remedy?: { kind: string; note?: string; candidates?: Array<{ ref: string }> };
};
type Report = {
  version: number;
  metrics: { bullets: number; distinctLeadLemmas: number; metricCoverage: number;
    topOpener: { openers: string[]; count: number } | null; maxBulletLines: number | null;
    typography?: { bodyPt: number; marginIn: number } };
  gate: string;
  counts: { errors: number; warnings: number; notes: number; omitted: number };
  findings: Finding[];
};
type PoolBullet = { id: string; text: Record<string, string> };
type PoolEntry = { id: string; blocked?: string; bullets?: PoolBullet[] };
type Spec = { slug: string; pages: number };

const bullet = (ref: string, text: string, extra: Record<string, unknown> = {}) => ({
  ref, entryId: ref.split('.')[0], bulletId: ref.split('.')[1], sectionType: 'experience',
  variant: 'standard', text, ...extra,
});

const text = (ref: string) => {
  const [entryId, bulletId] = ref.split('.');
  for (const type of ['education', 'experience', 'projects', 'leadership'] as const) {
    const entry = (pools[type].entries as unknown as PoolEntry[]).find((item) => item.id === entryId);
    const found = entry?.bullets?.find((item) => item.id === bulletId);
    if (found) return found.text.default;
  }
  throw new Error(`no such bullet: ${ref}`);
};

describe('checker module boundary', () => {
  // The checker has to stay reachable from the browser and from a serverless
  // function without dragging pdfkit (12 MB) along. This is the guard, not style.
  it('imports nothing', () => {
    const source = readFileSync('server/resumeCheck.mjs', 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toContain('require(');
  });

  it('freezes its lexicon', () => {
    expect(Object.isFrozen(LEXICON)).toBe(true);
    expect(Object.isFrozen(LEXICON.hedges)).toBe(true);
    expect(CHECK_VERSION).toBe(1);
  });
});

describe('lead verb lemmas', () => {
  it('collapses the tense and co- forms a reader sees as one opener', () => {
    expect(leadLemma('Built')).toBe(leadLemma('Build'));
    expect(leadLemma('Co-built')).toBe('build');
    expect(leadLemma('Led')).toBe('lead');
    expect(leadLemma('Engineered')).toBe('engineer');
    expect(leadLemma('Engineering')).toBe('engineer');
    expect(leadLemma('Reverse-engineer')).toBe('reverse-engineer');
  });

  it('keeps the manufactured stem internal and reports only words on the page', () => {
    // The stripper does make non-words ("Pursuing" gives "pursu"), which is fine
    // for a grouping key and unacceptable in agent-facing text. No finding may
    // carry a lemma; they carry the opening words as written.
    expect(leadLemma('Pursuing')).toBe('pursu');
    const bullets = ['a.one', 'a.two', 'a.three'].map((ref, index) => bullet(ref, `Pursuing a thing ${index}`));
    const report = checkResume(bullets) as Report;
    expect(JSON.stringify(report)).not.toContain('pursu"');
    const repeat = report.findings.find((item) => item.category === 'lead-verb-repeat');
    expect(repeat?.where.openers).toEqual(['Pursuing']);
  });

  it('groups the tense variants a reader sees as one opener', () => {
    const report = checkResume([
      bullet('a.one', 'Built a thing'), bullet('a.two', 'Build a thing'), bullet('a.three', 'Co-built a thing'),
    ]) as Report;
    const repeat = report.findings.find((item) => item.category === 'lead-verb-repeat');
    expect(repeat?.where.count).toBe(3);
    expect(repeat?.where.openers).toEqual(['Build', 'Built', 'Co-built']);
  });

  it('skips the three deliberate label lines', () => {
    expect(isLabelLine(text('nus.coursework'))).toBe(true);
    expect(isLabelLine(text('additional.nvidia'))).toBe(true);
    expect(isLabelLine(text('additional.llm-cyber'))).toBe(true);
    expect(isLabelLine(text('pa.churp'))).toBe(false);
  });
});

describe('metric classifier', () => {
  // Table-driven over every digit-bearing bullet in the real corpus. A naive
  // digit match calls 16 of them quantified; only these carry a measurement.
  const METRIC = ['nus.award', 'abbott-contract.harness', 'abbott-intern.pipeline',
    'pa.sparks', 'ywh.programs', 'brinhack.main', 'maritime.main', 'waaah.main'];
  const NOT_METRIC = ['nus.coursework', 'pa.infra', 'ywh.network', 'portfolio.main',
    'agewelllah.main', 'additional.nvidia', 'additional.llm-cyber', 'steminc.combined'];

  it.each(METRIC)('counts %s as quantified', (ref) => {
    expect(metricsIn(text(ref)).metrics.length).toBeGreaterThan(0);
  });

  it.each(NOT_METRIC)('does not count %s, whose digits name a product or a year', (ref) => {
    expect(metricsIn(text(ref)).metrics).toEqual([]);
  });

  it('names the digits it rejected, so nobody answers a low count by inventing one', () => {
    expect(metricsIn(text('agewelllah.main')).suppressed.map((item) => item.surface)).toContain('GPT-4');
    expect(metricsIn(text('pa.infra')).suppressed.map((item) => item.surface)).toContain('Route 53');
    expect(metricsIn(text('steminc.combined')).suppressed.map((item) => item.surface)).toContain('7th');
  });

  it('keeps a magnitude that a product-number guard would otherwise eat', () => {
    // "ASPIRE 2A" must be masked without taking "109M-parameter" with it.
    const found = metricsIn(text('maritime.main'));
    expect(found.metrics.map((item) => item.surface)).toContain('109M');
    expect(found.suppressed.map((item) => item.surface)).toContain('ASPIRE 2A');
    expect(metricsIn('Assessed A 400+ teams across four plants').metrics.map((item) => item.surface))
      .toEqual(['400+', 'four plants']);
  });

  it('reports spans that slice back to the text they claim', () => {
    for (const ref of METRIC) {
      const value = text(ref);
      for (const span of metricsIn(value).metrics) expect(value.slice(span.start, span.end)).toBe(span.surface);
    }
  });

  it('trims the punctuation that would otherwise ride along', () => {
    expect(metricsIn('Led a class of 24, then moved on').metrics[0].surface).toBe('class of 24');
  });
});

describe('hedges and frames', () => {
  it('does not fire inside a hyphenated compound', () => {
    expect(hedgesIn('Assessed programs for responsible-disclosure handling')).toEqual([]);
    expect(hedgesIn('Was responsible for the rollout').map((item) => item.surface)).toEqual(['responsible for']);
  });

  it('finds the two frames this corpus actually repeats', () => {
    const opener = framesIn('Built an end-to-end platform, spanning admin and public frontends');
    expect(opener.map((item) => item.kind)).toEqual(['opener', 'trailing-participle']);
    expect(opener[0].surface).toBe('built an');
    expect(framesIn('Led the fund bid').map((item) => item.kind)).toEqual([]);
  });
});

describe('ongoing dates', () => {
  it.each([
    ['Aug 2026 – Present', true],
    ['May 2024 – Present', true],
    ['Aug 2023 – Jul 2027', true],
    ['Jan 2026 – Jun 2026', false],
    ['Sep 2025 – Sep 2026', false],
    ['Mar 2026', false],
    ['2023 – 2024', false],
  ])('reads %s as ongoing=%s', (label, expected) => {
    expect(isOngoing(label, '2026-09')).toBe(expected);
  });
});

describe('checkResume', () => {
  it('is deterministic and independent of input order', () => {
    const bullets = [
      bullet('a.one', 'Built an alpha system, spanning two teams'),
      bullet('b.two', 'Built a beta service, packaging the result'),
      bullet('c.three', 'Built a gamma tool, validating the output'),
    ];
    const first = JSON.stringify(checkResume(bullets));
    expect(JSON.stringify(checkResume(bullets))).toBe(first);
    // Findings are keyed and sorted, so a reversed selection reports the same rules.
    const reversed = checkResume([...bullets].reverse()) as Report;
    expect(reversed.findings.map((item) => `${item.rule}:${item.category}`).sort())
      .toEqual((JSON.parse(first) as Report).findings.map((item) => `${item.rule}:${item.category}`).sort());
  });

  it('emits no string it did not read from its input', () => {
    const bullets = [bullet('x.one', 'Helped build a thing'), bullet('x.two', 'Helped ship a thing')];
    const report = checkResume(bullets) as Report;
    const inputs = bullets.map((item) => item.text.toLowerCase()).join(' ');
    const vocabulary = new Set([...LEXICON.hedges, ...LEXICON.metricKinds, ...Object.values(LEXICON.irregularLead)]);
    for (const item of report.findings) {
      for (const hit of item.occurrences) {
        expect(hit.ref).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+$/);
        if (hit.surface) expect(inputs.includes(hit.surface.toLowerCase()) || vocabulary.has(hit.surface.toLowerCase())).toBe(true);
      }
    }
  });

  it('says so plainly when the menu holds no swap', () => {
    const bullets = ['p.one', 'p.two', 'p.three'].map((ref, index) => bullet(ref, `Built a project ${index}`, { sectionType: 'projects' }));
    const report = checkResume(bullets) as Report;
    const repeat = report.findings.find((item) => item.category === 'lead-verb-repeat');
    expect(repeat?.where.openers).toEqual(['Built']);
    expect(repeat?.remedy?.kind).toBe('none');
    expect(repeat?.remedy?.note).toMatch(/no swap inside this section/);
  });

  it('offers a swap only from the section that fired, ranked by evidence', () => {
    const bullets = ['e.one', 'e.two', 'e.three'].map((ref, index) => bullet(ref, `Built a service ${index}`));
    const report = checkResume(bullets, {
      candidates: [
        { ref: 'e.spare', entryId: 'e', sectionType: 'experience', text: 'Led a 20+ test rollout' },
        { ref: 'e.plain', entryId: 'e', sectionType: 'experience', text: 'Designed a schema' },
        { ref: 'other.x', entryId: 'other', sectionType: 'projects', text: 'Shipped a tool' },
      ] as never,
    }) as Report;
    const repeat = report.findings.find((item) => item.category === 'lead-verb-repeat');
    expect(repeat?.remedy?.candidates?.map((item) => item.ref)).toEqual(['e.spare', 'e.plain']);
  });

  it('fails the gate only on a structural defect', () => {
    const clean = checkResume([bullet('a.one', 'Led a fund bid')]) as Report;
    expect(clean.gate).toBe('pass');
    expect(clean.counts.errors).toBe(0);
    const duplicated = checkResume([bullet('a.one', 'Led a bid'), bullet('a.one', 'Led a bid')]) as Report;
    expect(duplicated.gate).toBe('fail');
    expect(duplicated.findings.some((item) => item.category === 'duplicate-block')).toBe(true);
    const crowded = checkResume([...Array(5).keys()].map((index) => bullet(`a.b${index}`, `Led bid ${index}`))) as Report;
    expect(crowded.findings.some((item) => item.category === 'too-many-bullets')).toBe(true);
  });

  it('counts the ids it did not list rather than dropping them quietly', () => {
    const bullets = [...Array(20).keys()].map((index) => bullet(`e${index}.one`, `Shipped thing ${index}`));
    const note = (checkResume(bullets) as Report).findings.find((item) => item.category === 'unquantified');
    expect(note?.occurrences).toHaveLength(12);
    expect(note?.more).toBe(8);
    // The cap never hides the true size of what was found.
    expect(note?.where).toMatchObject({ quantified: 0, of: 20 });
  });

  it('rejects a glyph the PDF fonts cannot encode', () => {
    // WinAnsi is Latin-1 plus a scattered set in 0x80-0x9F, so a codepoint
    // ceiling would wave through Latin Extended-A, Greek and Cyrillic.
    for (const glyph of ['a', 'é', '–', '—', '€', '™', '·']) expect(isWinAnsi(glyph), glyph).toBe(true);
    for (const glyph of ['ā', 'Ω', 'д', '中', '🙂']) expect(isWinAnsi(glyph), glyph).toBe(false);
    const report = checkResume([bullet('a.one', 'Led a Ω project')]) as Report;
    expect(report.gate).toBe('fail');
    expect(report.findings.find((item) => item.category === 'unrenderable-glyph')?.occurrences[0].surface).toBe('Ω');
    // The one non-ASCII character the corpus does contain must stay legal.
    expect((checkResume([bullet('a.one', text('ywh.network'))]) as Report).counts.errors).toBe(0);
  });

  it('survives the empty and single-bullet cases without NaN', () => {
    const empty = checkResume([]) as Report;
    expect(empty.metrics).toEqual(expect.objectContaining({ bullets: 0, leadConcentration: 0, metricCoverage: 0 }));
    expect(JSON.stringify(empty)).not.toContain('null,"count"');
    const one = checkResume([bullet('a.one', 'Built a thing')]) as Report;
    expect(one.findings.filter((item) => item.category === 'lead-verb-repeat')).toEqual([]);
  });

  it('flags an over-long bullet only when a line count is supplied', () => {
    const long = bullet('a.one', 'Built a thing', { lines: 5 });
    expect((checkResume([long]) as Report).findings.some((item) => item.category === 'line-budget')).toBe(true);
    expect((checkResume([bullet('a.one', 'Built a thing')]) as Report).findings.some((item) => item.category === 'line-budget')).toBe(false);
  });
});

describe('the real corpus', () => {
  // These numbers are the point of the checker: they are what Rahul asked about.
  // A content edit that moves them should show up here rather than silently.
  it('reports the block pool the checker was built to describe', () => {
    const report = checkPool(poolEntries()) as Report;
    expect(report.metrics.bullets).toBe(41);
    expect(report.metrics.topOpener).toEqual({ openers: ['Build', 'Built'], count: 13 });
    expect(report.metrics.metricCoverage).toBe(0.24);
    // The headline finding: seven of eleven project bullets open with "Built".
    const projects = report.findings.find((item) => item.category === 'pool-lead-concentration'
      && item.where.sectionType === 'projects');
    expect(projects?.where).toMatchObject({ openers: ['Built'], count: 7, of: 10 });
    // Tense fires on exactly one entry, the bug-bounty role that is still open.
    const tense = report.findings.filter((item) => item.category === 'tense-vs-dates');
    expect(tense).toHaveLength(1);
    expect(tense[0].where.entryId).toBe('ywh');
    expect(report.counts.errors).toBe(0);
  });

  it.each(resumeConfigs as Spec[])('checks $slug at the typography it ships at', (config) => {
    const wide = config.slug === 'ai-engineer' || config.slug === 'civic-tech-solution-architect';
    const fit = { bodyPt: wide ? 10.5 : 10, marginIn: config.slug === 'highlights' ? 0.5 : 0.7 };
    const report = checkSpec(config, fit as never) as Report;
    expect(report.gate).toBe('pass');
    expect(report.counts.errors).toBe(0);
    // Nothing shipped runs past the line budget; the rule exists for deep builds.
    expect(report.findings.some((item) => item.category === 'line-budget')).toBe(false);
    expect(report.metrics.maxBulletLines).toBeLessThanOrEqual(3);
  });

  it('pins the digest of every canonical résumé', () => {
    const digest = Object.fromEntries((resumeConfigs as Spec[]).map((config) => {
      const report = checkSpec(config) as Report;
      return [config.slug, {
        bullets: report.metrics.bullets,
        top: report.metrics.topOpener?.count,
        codes: report.findings.map((item) => item.category).sort().join(','),
      }];
    }));
    expect(digest).toEqual({
      'software-engineer': { bullets: 15, top: 7, codes: 'adjacent-repeat,adjacent-repeat,frame-repeat,lead-verb-repeat,lead-verb-repeat,unquantified' },
      'solution-architect': { bullets: 15, top: 6, codes: 'adjacent-repeat,adjacent-repeat,frame-repeat,lead-verb-repeat,unquantified' },
      'ai-engineer': { bullets: 14, top: 6, codes: 'adjacent-repeat,hedge,lead-verb-repeat,unquantified' },
      'operations-research-engineer': { bullets: 14, top: 5, codes: 'adjacent-repeat,hedge,lead-verb-repeat,unquantified' },
      'cyber-security': { bullets: 14, top: 4, codes: 'adjacent-repeat,adjacent-repeat,unquantified' },
      'civic-tech-solution-architect': { bullets: 15, top: 6, codes: 'adjacent-repeat,adjacent-repeat,frame-repeat,hedge,lead-verb-repeat,unquantified' },
      highlights: { bullets: 13, top: 5, codes: 'adjacent-repeat,frame-repeat,lead-verb-repeat,unquantified' },
      general: { bullets: 31, top: 11, codes: 'adjacent-repeat,adjacent-repeat,adjacent-repeat,frame-repeat,frame-repeat,lead-verb-repeat,lead-verb-repeat,lead-verb-repeat,unquantified' },
    });
  });

  it('does not mutate the content pools', () => {
    const before = structuredClone(pools);
    checkSpec(resumeConfigs[0] as Spec);
    decoratedBlocks();
    expect(pools).toEqual(before);
  });

  it('keeps the render path free of the checker', () => {
    expect(readFileSync('server/resumeRender.mjs', 'utf8')).not.toContain('resumeCheck');
  });
});
