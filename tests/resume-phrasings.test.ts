import { describe, expect, it } from 'vitest';
import { attestPhrasing } from '../server/resumeCheck.mjs';
import { assemble, measureBulletLines, resolveBulletText, specSchema } from '../server/resumeRender.mjs';
import { checkSpec, decoratedBlocks, resumeConfigs } from '../server/portfolioMcp.mjs';
import { pools } from '../server/resumeContent.mjs';
import ownershipTable from '../scripts/resume/content/ownership.json';

// server/resumeCheck.mjs is plain JS, so its JSDoc types the option as null.
const ownership = ownershipTable as never;

type Phrasing = { text: string; note?: string; basis?: string };
type PoolBullet = { id: string; text: Record<string, string>; phrasings?: Record<string, Phrasing> };
type PoolEntry = { id: string; blocked?: string; bullets?: PoolBullet[] };
type Finding = { rule: string; category: string; remedy?: { kind: string; candidates?: Array<{ ref: string; phrasing?: string }> } };
type Report = { counts: { errors: number; warnings: number }; findings: Finding[] };
type Spec = { slug: string; sections: unknown[]; phrasings?: Record<string, string> };

const SECTIONS = ['education', 'experience', 'projects', 'leadership'] as const;

/** Every committed phrasing, with the bullet it belongs to. */
const committed = () => {
  const rows: Array<{ ref: string; id: string; phrasing: Phrasing; bullet: PoolBullet }> = [];
  for (const type of SECTIONS) {
    for (const entry of pools[type].entries as unknown as PoolEntry[]) {
      for (const bullet of entry.bullets ?? []) {
        for (const [id, phrasing] of Object.entries(bullet.phrasings ?? {})) {
          rows.push({ ref: `${entry.id}.${bullet.id}`, id, phrasing, bullet });
        }
      }
    }
  }
  return rows;
};

// specSchema lets a caller pin bodyPt 10-12 and marginIn 0.5-1.0, so the four-rung
// auto-fit ladder is a sample of what a phrasing can be rendered at, not the whole
// of it. A wording that fits at 10pt can overflow at 12.
const GRID: Array<{ bodyPt: number; marginIn: number }> = [];
for (let bodyPt = 10; bodyPt <= 12; bodyPt += 0.5) {
  for (let margin = 0.5; margin <= 1.0001; margin += 0.1) {
    GRID.push({ bodyPt, marginIn: Math.round(margin * 10) / 10 });
  }
}

const lineGridFor = (phrasing: Phrasing, bullet: PoolBullet) => {
  const base = bullet.text[phrasing.basis ?? 'default'];
  return GRID.map((point) => ({
    ...point,
    phrasing: measureBulletLines([phrasing.text], point)[0],
    default: measureBulletLines([base], point)[0],
  })) as never;
};

describe('the attestation guard', () => {
  const rows = committed();

  it('has phrasings to check', () => {
    expect(rows.length).toBeGreaterThan(10);
  });

  // The gate. A phrasing can only enter the pools through a commit, so this is
  // where it is caught: a hand-edited JSON that skipped the review script still
  // fails here.
  it.each(rows.map((row) => [`${row.ref}@${row.id}`, row] as const))('%s is attested', (_label, row) => {
    expect(attestPhrasing(row.phrasing, row.bullet, {
      lineGrid: lineGridFor(row.phrasing, row.bullet),
      ownership,
    })).toEqual([]);
  });

  it('rejects an invented fact', () => {
    const bullet = { text: { default: 'Built a pipeline with Gemini 2.0 Flash.' } };
    const problems = attestPhrasing({ text: 'Shipped a pipeline with Gemini 2.0 Flash and PyTorch.', note: 'x' }, bullet, { ownership });
    expect(problems.map((item) => item.code)).toContain('G1-unattested');
    expect(problems[0].detail).toContain('pytorch');
  });

  it('rejects a phrasing that drops evidence the default carried', () => {
    // The "3D" in the MediaPipe bullet is the whole 3D-landmark claim, and it is a
    // suppressed span rather than a metric, so only G3 sees it go.
    const bullet = (pools.projects.entries as unknown as PoolEntry[])
      .find((entry) => entry.id === 'waaah')?.bullets?.[0] as PoolBullet;
    const dropped = { text: bullet.text.default.replace('3D ', ''), note: 'x' };
    expect(attestPhrasing(dropped, bullet, { ownership }).map((item) => item.code)).toContain('G3-entities');
  });

  it('rejects a phrasing that quietly changes what is claimed', () => {
    const bullet = { text: { default: 'Built an AI research engine scoring brand ethics.' } };
    const problems = attestPhrasing({ text: 'Assessed an AI research engine scoring brand ethics.', note: 'x' }, bullet, { ownership });
    expect(problems.map((item) => item.code)).toContain('G7-ownership');
  });

  it('requires an unknown opening verb to be ranked deliberately', () => {
    const bullet = { text: { default: 'Built a thing.' } };
    expect(attestPhrasing({ text: 'Frobnicated a thing.', note: 'x' }, bullet, { ownership })
      .map((item) => item.code)).toContain('G7-unranked');
  });

  it('rejects a phrasing that buys nothing', () => {
    const bullet = { text: { default: 'Built a thing for people.' } };
    expect(attestPhrasing({ text: 'Built a thing for people.', note: 'x' }, bullet, { ownership })
      .map((item) => item.code)).toContain('G6-redundant');
  });

  it('ranks every opening verb the pool uses', () => {
    // An unranked lemma is an error, so the table has to keep up with the pool.
    for (const row of rows) {
      expect(attestPhrasing(row.phrasing, row.bullet, { ownership }).map((item) => item.code))
        .not.toContain('G7-unranked');
    }
  });
});

describe('phrasing selection', () => {
  const bullet = { id: 'main', text: { default: 'Built a thing.', deep: 'Built a thing, at length.' },
    phrasings: { 'turn-first': { text: 'Turned a thing.' } } };

  it('lets a phrasing win over depth, because it is the more specific instruction', () => {
    const spec = { detail: 'deep', phrasings: { 'x.main': 'turn-first' } };
    expect(resolveBulletText(bullet, spec, undefined, 'x.main')).toBe('Turned a thing.');
    expect(resolveBulletText(bullet, { detail: 'deep' }, undefined, 'x.main')).toBe('Built a thing, at length.');
  });

  it('throws on an unknown phrasing instead of rendering a different sentence', () => {
    expect(() => resolveBulletText(bullet, { phrasings: { 'x.main': 'nope' } }, undefined, 'x.main'))
      .toThrow(/unknown phrasing "nope".*choose one of turn-first/);
    expect(() => resolveBulletText({ id: 'm', text: { default: 'a' } }, { phrasings: { 'y.m': 'nope' } }, undefined, 'y.m'))
      .toThrow(/only one wording/);
  });

  it('throws when a spec names a phrasing for a bullet it does not select', () => {
    const spec = {
      sections: [{ type: 'projects', title: 'PROJECTS', entries: [{ id: 'waaah', bullets: ['main'] }] }],
      phrasings: { 'arcane.main': 'tooling-first' },
    };
    expect(() => assemble(spec, pools)).toThrow(/does not select/);
  });

  it('records the choice on the assembled item', () => {
    const spec = {
      sections: [{ type: 'projects', title: 'PROJECTS', entries: [{ id: 'waaah', bullets: ['main'] }] }],
      phrasings: { 'waaah.main': 'landmarks-first' },
    };
    const item = (assemble(spec, pools) as Array<{ kind: string; phrasing?: string; text: string }>)
      .find((row) => row.kind === 'bullet');
    expect(item?.phrasing).toBe('landmarks-first');
    expect(item?.text.startsWith('Turned')).toBe(true);
  });

  it('never accepts prose from a caller', () => {
    const base = { sections: [{ type: 'skills', title: 'SKILLS', lines: ['se-skills'] }] };
    expect(specSchema.safeParse({ ...base, phrasings: { 'waaah.main': 'landmarks-first' } }).success).toBe(true);
    expect(specSchema.safeParse({ ...base, phrasings: { 'waaah.main': { text: 'I wrote this' } } }).success).toBe(false);
    expect(specSchema.safeParse({ ...base, phrasings: { 'not a ref': 'landmarks-first' } }).success).toBe(false);
  });
});

describe('the checker offers a rephrase where it used to offer nothing', () => {
  it('names a fix for the repeated project openers', () => {
    const config = (resumeConfigs as unknown as Spec[]).find((item) => item.slug === 'software-engineer');
    const report = checkSpec(config, { bodyPt: 10, marginIn: 0.7 } as never) as Report;
    const projects = report.findings.find((item) => item.category === 'lead-verb-repeat'
      && item.remedy?.candidates?.some((row) => row.ref === 'waaah.main'));
    expect(projects?.remedy?.kind).toBe('rephrase');
    expect(projects?.remedy?.candidates?.map((row) => `${row.ref}@${row.phrasing}`))
      .toContain('waaah.main@landmarks-first');
  });

  it('clears the findings when the offered wordings are taken', () => {
    // The acceptance test for the whole feature: every fix the checker names is
    // one an agent may apply, and applying them removes the finding.
    const config = (resumeConfigs as unknown as Spec[]).find((item) => item.slug === 'general') as Spec;
    const fit = { bodyPt: 10, marginIn: 0.7 };
    const before = checkSpec(config, fit as never) as Report;
    const chosen: Record<string, string> = {};
    for (let round = 0; round < 6; round += 1) {
      const report = checkSpec({ ...config, phrasings: chosen }, fit as never) as Report;
      const offered = report.findings.flatMap((item) => (item.remedy?.kind === 'rephrase' ? item.remedy.candidates ?? [] : []));
      const fresh = offered.filter((row) => !chosen[row.ref]);
      if (!fresh.length) break;
      for (const row of fresh) chosen[row.ref] ??= row.phrasing as string;
    }
    const after = checkSpec({ ...config, phrasings: chosen }, fit as never) as Report;
    expect(before.counts.warnings).toBe(8);
    expect(after.counts.warnings).toBe(0);
    expect(after.counts.errors).toBe(0);
  });

  it('puts the alternatives on the menu, so an agent can avoid the repeat first', () => {
    const blocks = decoratedBlocks() as { sections: Array<{ type: string; entries: Array<{ id: string; bullets: Array<{ id: string; lead: string; phrasings?: Record<string, { lead: string; lines: number }> }> }> }> };
    const waaah = blocks.sections.find((item) => item.type === 'projects')?.entries.find((item) => item.id === 'waaah');
    expect(waaah?.bullets[0].lead).toBe('Built');
    expect(waaah?.bullets[0].phrasings?.['landmarks-first'].lead).toBe('Turned');
    expect(waaah?.bullets[0].phrasings?.['landmarks-first'].lines).toBeGreaterThan(0);
  });
});
