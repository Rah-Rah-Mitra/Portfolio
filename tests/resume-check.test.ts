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
type Occurrence = { ref: string; surface?: string; lines?: number;
  instead?: string; names?: number; insteadNames?: number; hasMetric?: boolean };
type Finding = {
  rule: string; severity: 'error' | 'warn' | 'note'; category: string;
  where: Record<string, unknown>; occurrences: Occurrence[]; more?: number;
  remedy?: { kind: string; note?: string; candidates?: Array<{ ref: string }> };
};
type Report = {
  version: number;
  summary?: string;
  metrics: { bullets: number; distinctLeadLemmas: number; metricCoverage: number;
    topOpener: { openers: string[]; count: number } | null; maxBulletLines: number | null;
    typography?: { bodyPt: number; marginIn: number } };
  gate: string;
  counts: { errors: number; warnings: number; notes: number; omitted: number };
  findings: Finding[];
};
type PoolBullet = { id: string; text: Record<string, string> };
type PoolEntry = { id: string; blocked?: string; bullets?: PoolBullet[] };
type Spec = { slug: string; pages: number; bodyPt?: number; marginIn?: number };

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

  it('skips the deliberate label lines, and only those', () => {
    expect(isLabelLine(text('nus.coursework'))).toBe(true);
    expect(isLabelLine(text('nus.coursework-full'))).toBe(true);
    expect(isLabelLine(text('pa.churp'))).toBe(false);
    // A real bullet whose colon happens to land inside the character window.
    // The word count is what keeps it out; without it this dropped silently
    // from the quantified denominator and the lead-verb tally.
    expect(isLabelLine(text('amazon-vision.isp'))).toBe(false);
  });
});

describe('metric classifier', () => {
  // Table-driven over every digit-bearing bullet in the real corpus. A naive
  // digit match calls 16 of them quantified; only these carry a measurement.
  const METRIC = ['nus.award', 'abbott-contract.harness', 'abbott-intern.pipeline',
    'pa.sparks', 'ywh.programs', 'brinhack.main', 'maritime.main', 'waaah.main',
    // The 2026-11 wordings write their measurements the way a screener can read
    // them, so the classifier has to read them too: "4 times" not "4x", a count
    // with one adjective before its noun, and a power/throughput rating.
    'amazon-vision.frame-quality', 'hailo.main', 'stmicro-or.putaway', 'pa.singpass'];
  const NOT_METRIC = ['nus.coursework', 'nus.coursework-full', 'pa.infra', 'ywh.network',
    'portfolio.main', 'agewelllah.main', 'steminc.combined'];

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
    expect(repeat?.remedy?.note).toMatch(/none of them has an alternative wording yet/);
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

describe('the report leads with the problem', () => {
  it('names the biggest finding and the fix that costs nothing', () => {
    const rows = ['a.one', 'a.two', 'a.three'].map((ref, index) => bullet(ref, `Built a thing ${index}`));
    const report = checkResume(rows, {
      rephrasings: { 'a.two': [{ id: 'turn-first', text: 'Turned a thing.', lead: 'Turned', lemma: 'turn', frames: [], lines: 1, hasMetric: false }] },
    }) as Report & { summary: string };
    expect(report.summary).toContain('3 of 3 EXPERIENCE bullets open "Built"');
    expect(report.summary).toContain('a.two@turn-first');
    // The standing rule travels with every report, because the cheapest way to
    // clear a style finding is to delete the evidence that triggered it.
    expect(report.summary).toMatch(/Never drop a bullet, a role, or a measurement/);
  });

  it('never tells anyone to drop a role to fix a repeated verb', () => {
    const rows = ['a.one', 'b.two', 'c.three'].map((ref, index) => bullet(ref, `Built a thing ${index}`));
    const repeat = (checkResume(rows) as Report).findings.find((item) => item.category === 'lead-verb-repeat');
    expect(repeat?.remedy?.kind).toBe('none');
    expect(repeat?.remedy?.note).toMatch(/Never drop a role/);
    expect(repeat?.remedy?.note).not.toMatch(/dropping an entry/);
  });

  it('separates two lists under one heading from two headings', () => {
    const label = (ref: string, text: string) => ({ ...bullet(ref, text), sectionType: 'education' });
    // Two course lists on one entry would print two "Relevant coursework:" rows.
    expect((checkResume([
      label('nus.coursework', 'Relevant coursework: Simulation, Statistics.'),
      label('nus.coursework-full', 'Relevant coursework: Simulation, Computer Graphics.'),
    ]) as Report).gate).toBe('fail');
    // Two differently titled additional projects on one entry are deliberate.
    expect((checkResume([
      label('additional.nvidia', 'NVIDIA Disaster Risk Monitoring with Satellite Imagery: geospatial AI.'),
      label('additional.llm-cyber', 'Fine-tuning LLMs for Cybersecurity: coursework.'),
    ]) as Report).gate).toBe('pass');
  });
});

describe('evidence already on the page', () => {
  it('names a richer bullet sitting unused on an entry already selected', () => {
    const terms = ['SimPy', 'CP-SAT', 'Terraform'];
    const rows = [{ ...bullet('e.thin', 'Engineered a 15-stage pipeline with zero execution failures.') }];
    const report = checkResume(rows, {
      skillTerms: terms as never,
      candidates: [{ ref: 'e.rich', entryId: 'e', sectionType: 'experience', text: 'Modeled scheduling with SimPy, CP-SAT, and Terraform.' }] as never,
    }) as Report;
    const found = report.findings.find((item) => item.category === 'unused-evidence');
    expect(found?.severity).toBe('note');
    expect(found?.occurrences[0]).toMatchObject({ ref: 'e.thin', instead: 'e.rich', names: 0, insteadNames: 3 });
    // The thinner bullet is not called worse: it carries the measurement, and the
    // report says so rather than telling anyone to trade evidence for keywords.
    expect(found?.occurrences[0].hasMetric).toBe(true);
    expect(found?.remedy?.note).toMatch(/Not automatically better/);
  });

  it('stays quiet when the alternative is no richer, and when no lexicon is given', () => {
    const rows = [bullet('e.one', 'Engineered a pipeline with SimPy.')];
    const candidates = [{ ref: 'e.two', entryId: 'e', sectionType: 'experience', text: 'Built a thing with CP-SAT.' }] as never;
    expect((checkResume(rows, { skillTerms: ['SimPy', 'CP-SAT'] as never, candidates }) as Report)
      .findings.some((item) => item.category === 'unused-evidence')).toBe(false);
    expect((checkResume(rows, { candidates }) as Report)
      .findings.some((item) => item.category === 'unused-evidence')).toBe(false);
  });
});

// The house-style rules model one ATS screener (VMock), reverse-engineered in
// Sep 2026. The corpus deliberately reports NOTHING from P5 - the 2026-11 pass
// removed every instance - so these are synthetic by necessity. That silence is
// asserted in "the real corpus" below; this block proves the rules can still
// speak.
describe('house style (P5)', () => {
  const poolOf = (text: string, extra: Record<string, unknown> = {}) => checkPool([{
    entryId: 'e', sectionType: 'experience', dateLabel: 'Jan 2020 - Jan 2021',
    bullets: [{ ref: 'e.one', variant: 'default', text }], ...extra,
  }]) as Report;
  const categories = (report: Report) => report.findings.filter((item) => item.rule === 'P5')
    .map((item) => item.category);

  it('names a word the screener dictionary does not hold', () => {
    expect(categories(poolOf('Built an air-gapped platform with a quantized model.')))
      .toContain('banned-spelling');
    expect(categories(poolOf('Built an offline platform with a local model.')))
      .not.toContain('banned-spelling');
  });

  it('names an opening verb that is also a common noun', () => {
    expect(categories(poolOf('Engineer a test harness covering regression tests.')))
      .toContain('non-action-verb');
    expect(categories(poolOf('Automate a test harness covering regression tests.')))
      .not.toContain('non-action-verb');
  });

  it('names a measurement the specifics parser cannot see', () => {
    expect(categories(poolOf('Compressed a six-month cycle into a sub-three-minute report.')))
      .toContain('spelled-out-number');
    expect(categories(poolOf('Compressed a 6-month cycle into a 3-minute report.')))
      .not.toContain('spelled-out-number');
    // A number word inside a product name is not a count.
    expect(categories(poolOf('Built a local-first Blender-to-Three.js asset pipeline.')))
      .not.toContain('spelled-out-number');
  });

  it('names a digit glued to a letter, and leaves product numbers alone', () => {
    expect(categories(poolOf('Improved stages with 4x upscaling at 1.5W on 13TOPS silicon.')))
      .toContain('glued-digit');
    expect(categories(poolOf('Improved stages to upscale frames 4 times at 1.5 W on 13 TOPS silicon.')))
      .not.toContain('glued-digit');
    // 90th, 3D, GPT-4 and 109M all carry a glued digit and none is the defect.
    expect(categories(poolOf('Solved 3D challenges on GPT-4, finishing 90th with a 109M-parameter model.')))
      .not.toContain('glued-digit');
  });

  it('names a second "the" in one bullet', () => {
    expect(categories(poolOf('Provisioned the platform AWS infrastructure across the environment.')))
      .toContain('filler-density');
    expect(categories(poolOf('Provisioned AWS infrastructure across the environment.')))
      .not.toContain('filler-density');
  });

  it('names an internal run of capitals in a job title, and only there', () => {
    const title = (role: string, organization = 'Amazon') => categories(poolOf('Built vision systems.', { role, organization }));
    expect(title('Robotics Vision Engineer (BlendED AI+X)')).toContain('mixed-case-title');
    // Verified green in the editor and flagged by an earlier draft of this rule:
    // plain CamelCase brands, ALL-CAPS acronyms, ampersands and parentheses.
    expect(title('Robotics Vision Engineer')).not.toContain('mixed-case-title');
    expect(title('Platform & Solutions Engineer (Sparks Citizen Developer)')).not.toContain('mixed-case-title');
    expect(title('Operations Research (NUS System Design Project), Contract')).not.toContain('mixed-case-title');
    // The Company field applies no such rule, which is why moving it there fixed it.
    expect(title('Robotics Vision Engineer', 'Amazon (BlendED AI+X)')).not.toContain('mixed-case-title');
  });
});

describe('verb families across one résumé (R8)', () => {
  // R1 counts opening verbs per section. This counts the family anywhere in the
  // sentence, which is what an ATS counts: a participle buried mid-bullet is the
  // same word to it. The two rules disagree on purpose.
  // Four inflections of one verb, only two of them openers. The noun
  // "automation" is deliberately NOT one of them: leadLemma refuses derivational
  // families on purpose, and R8 inherits that.
  const four = ['Automated endpoint discovery.', 'Automate quality gates.',
    'Built a loop, automating delivery.', 'Designed a job and automated its handover.']
    .map((line, index) => bullet(`e.b${index}`, line));

  it('counts inflections and mid-sentence uses, where R1 counts openers only', () => {
    const report = checkResume(four) as Report;
    const found = report.findings.find((item) => item.rule === 'R8');
    expect(found?.category).toBe('verb-family-cap');
    expect(found?.where).toMatchObject({ family: 'automat', count: 4, max: 3 });
    expect(found?.severity).toBe('warn');
    expect(report.findings.some((item) => item.category === 'lead-verb-repeat')).toBe(false);
  });

  it('stays quiet at the ceiling, and never fails a build', () => {
    const report = checkResume(four.slice(0, 3)) as Report;
    expect(report.findings.some((item) => item.rule === 'R8')).toBe(false);
    expect(checkResume(four).counts.errors).toBe(0);
  });
});

describe('the real corpus', () => {
  // These numbers are the point of the checker: they are what Rahul asked about.
  // A content edit that moves them should show up here rather than silently.
  it('reports the block pool the checker was built to describe', () => {
    const report = checkPool(poolEntries()) as Report;
    expect(report.metrics.bullets).toBe(39);
    expect(report.metrics.topOpener).toEqual({ openers: ['Build', 'Built'], count: 3 });
    expect(report.metrics.metricCoverage).toBe(0.51);
    // Was the headline finding: seven of ten project bullets opened "Built", and
    // 24% of the pool carried a measurement. The 2026-11 pass spread the openers
    // and wrote the measurements in digits, so this rule now finds nothing in
    // PROJECTS at all. Asserted as absent rather than deleted: if it comes back,
    // the pool has drifted back to one verb.
    const projects = report.findings.find((item) => item.category === 'pool-lead-concentration'
      && item.where.sectionType === 'projects');
    expect(projects).toBeUndefined();
    // Tense fires on exactly one entry, the bug-bounty role that is still open.
    const tense = report.findings.filter((item) => item.category === 'tense-vs-dates');
    expect(tense).toHaveLength(1);
    expect(tense[0].where.entryId).toBe('ywh');
    expect(report.counts.errors).toBe(0);
  });

  it.each(resumeConfigs as Spec[])('checks $slug at the typography it ships at', (config) => {
    const fit = { bodyPt: config.bodyPt ?? 10.5, marginIn: config.marginIn ?? 0.7 };
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
      'software-engineer': { bullets: 15, top: 2, codes: 'frame-repeat,unquantified,unused-evidence' },
      'solution-architect': { bullets: 15, top: 2, codes: 'frame-repeat,unquantified' },
      'ai-engineer': { bullets: 14, top: 2, codes: 'hedge,unquantified,unused-evidence' },
      'operations-research-engineer': { bullets: 14, top: 1, codes: 'unquantified,unused-evidence' },
      'cyber-security': { bullets: 15, top: 2, codes: 'unquantified,unused-evidence' },
      'civic-tech-solution-architect': { bullets: 15, top: 2, codes: 'frame-repeat,unquantified,unused-evidence' },
      highlights: { bullets: 14, top: 2, codes: 'unquantified,unused-evidence' },
      // R8 counts a verb family anywhere in the sentence, not just as an opener:
      // "Built", "Build", "building" and "hackathon build" are four uses of one
      // family that R1's per-section opener tally cannot see.
      general: { bullets: 30, top: 3, codes: 'unquantified,unused-evidence,verb-family-cap' },
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
