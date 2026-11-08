import { describe, expect, it } from 'vitest';
import {
  REFERENCE_LAYOUT, TIER_BUDGETS, measureBulletLines, renderResume, renderResumePdf, resolveBullet, selectedBullets,
  specSchema, tierFallbacks,
} from '../server/resumeRender.mjs';
import { profile } from '../server/resumeContent.mjs';

// The length-tier engine (portfolio-mcp-upgrades.md, Nov 2026), pinned on pools
// built for it so the rules hold whatever the content says. The real pools'
// tier texts are pinned in resume-tier-content.test.ts.

type Bullet = { id: string; text: Record<string, string>; rank?: number; phrasings?: Record<string, unknown> };

const bullet = (text: Record<string, string>, extra: Partial<Bullet> = {}): Bullet => ({ id: 'b', text, ...extra });

describe('tier resolution', () => {
  const all = bullet({ full: 'F', standard: 'S', short: 'X', deep: 'D' });

  it('prints each stored tier as asked', () => {
    for (const [tier, text] of [['short', 'X'], ['standard', 'S'], ['full', 'F'], ['deep', 'D']]) {
      expect(resolveBullet(all, {}, tier, 'e.b')).toEqual({ text, tierUsed: tier });
    }
  });

  it('falls back towards full, never to another length class', () => {
    expect(resolveBullet(bullet({ full: 'F', standard: 'S' }), {}, 'short', 'e.b')).toEqual({ text: 'S', tierUsed: 'standard' });
    expect(resolveBullet(bullet({ full: 'F' }), {}, 'short', 'e.b')).toEqual({ text: 'F', tierUsed: 'full' });
    expect(resolveBullet(bullet({ full: 'F', short: 'X' }), {}, 'standard', 'e.b')).toEqual({ text: 'F', tierUsed: 'full' });
    expect(resolveBullet(bullet({ full: 'F' }), {}, 'deep', 'e.b')).toEqual({ text: 'F', tierUsed: 'full' });
  });

  it('lets a per-résumé override answer at the full step, as the Python builder does', () => {
    const targeted = bullet({ full: 'F', 'cyber-security': 'C' });
    expect(resolveBullet(targeted, { slug: 'cyber-security' }, 'standard', 'e.b').text).toBe('C');
    expect(resolveBullet(bullet({ full: 'F', standard: 'S', 'cyber-security': 'C' }), { slug: 'cyber-security' }, 'standard', 'e.b').text).toBe('S');
  });

  it('gives a chosen phrasing its own tier texts', () => {
    const phrased = bullet({ full: 'F' }, { phrasings: { alt: { text: 'P', note: 'n', tier: 'standard', tiers: { short: 'PS' } } } });
    const spec = { phrasings: { 'e.b': 'alt' } };
    expect(resolveBullet(phrased, spec, 'short', 'e.b')).toEqual({ text: 'PS', tierUsed: 'short' });
    expect(resolveBullet(phrased, spec, 'standard', 'e.b')).toEqual({ text: 'P', tierUsed: 'standard' });
    expect(resolveBullet(phrased, spec, 'full', 'e.b')).toEqual({ text: 'P', tierUsed: 'standard' });
  });
});

describe('selecting bullets', () => {
  const entry = {
    id: 'e',
    bullets: [{ id: 'a', rank: 3 }, { id: 'b', rank: 1 }, { id: 'c' }, { id: 'd', rank: 2 }].map((row) => ({ ...row, text: { full: row.id } })),
  };

  it('takes the best-ranked with top, in rank order, unranked last', () => {
    expect(selectedBullets({ id: 'e', top: 3 }, entry)).toEqual([{ id: 'b' }, { id: 'd' }, { id: 'a' }]);
    expect(selectedBullets({ id: 'e', top: 4 }, entry).map((row: { id: string }) => row.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('keeps an explicit list in the order written, per-bullet tiers included', () => {
    expect(selectedBullets({ id: 'e', bullets: ['c', { id: 'a', tier: 'short' }] }, entry)).toEqual([{ id: 'c' }, { id: 'a', tier: 'short' }]);
  });

  it('refuses a selection that names both', () => {
    expect(() => selectedBullets({ id: 'e', bullets: ['a'], top: 1 }, entry)).toThrow(/both bullets and top/);
    const parsed = specSchema.safeParse({ sections: [{ type: 'experience', title: 'WORK EXPERIENCE', entries: [{ id: 'e', bullets: ['a'], top: 1 }] }] });
    expect(parsed.success).toBe(false);
  });

  it('accepts the four tiers and nothing else', () => {
    const spec = (detail: string) => specSchema.safeParse({ detail, sections: [{ type: 'experience', title: 'WORK EXPERIENCE', entries: [{ id: 'e', bullets: ['a', { id: 'b', tier: 'short' }] }] }] });
    for (const tier of ['short', 'standard', 'full', 'deep']) expect(spec(tier).success, tier).toBe(true);
    expect(spec('default').success).toBe(false);
    expect(spec('tiny').success).toBe(false);
  });
});

describe('tierFallbacks', () => {
  const long = 'Converted every one of the Advanced Process Control models a site keeps in Excel into gain models solved by linear programs and quadratic programs, returning setpoints, binding constraints and shadow prices in milliseconds for each of the four sites.';
  const item = (text: string, tier: string, tierUsed: string) => ({ kind: 'bullet', ref: 'e.b', tier, tierUsed, text });

  it('measures at one reference layout', () => {
    expect(REFERENCE_LAYOUT).toEqual({ style: 'nus', bodyPt: 10, marginIn: 0.5 });
    expect(TIER_BUDGETS).toEqual({ short: 1, standard: 2 });
    expect(measureBulletLines([long], REFERENCE_LAYOUT)[0]).toBeGreaterThan(2);
  });

  it('names a fallback that leaves a bullet over the asked budget, and only that', () => {
    expect(tierFallbacks([item(long, 'standard', 'full')])).toEqual([{ block: 'e.b', requested: 'standard', used: 'full', lines: expect.any(Number) }]);
    // A full sentence within 2 lines is the standard: nothing is missing.
    expect(tierFallbacks([item('Shipped a gateway.', 'standard', 'full')])).toEqual([]);
    // Deep has no budget; the tier asked for was printed.
    expect(tierFallbacks([item(long, 'deep', 'full'), item(long, 'full', 'full')])).toEqual([]);
  });
});

describe('fitStrategy short-first', () => {
  const sentence = (n: number) => `Rebuilt the planning model number ${n} for every site in the network, returning setpoints, binding constraints, shadow prices and operator what-if reports in milliseconds across all modes.`;
  const pools = {
    skills: { lines: [] },
    profile,
    experience: {
      entries: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].map((id, index) => ({
        id, organization: `Company ${id}`, role: 'Engineer', location: 'Singapore', start: `2026-0${(index % 8) + 1}`, end: `2026-0${(index % 8) + 2}`, dateLabel: 'Jan 2026 – Feb 2026',
        bullets: [0, 1, 2, 3].map((n) => ({ id: `b${n}`, rank: n + 1, text: { full: sentence(index * 4 + n), short: `Rebuilt model ${index * 4 + n} into an optimiser.` } })),
      })),
    },
  };
  const spec = (extra: Record<string, unknown> = {}) => ({
    pages: 1,
    detail: 'full',
    sections: [{ type: 'experience', title: 'WORK EXPERIENCE', entries: pools.experience.entries.map((entry) => ({ id: entry.id, bullets: ['b0', 'b1', 'b2', 'b3'] })) }],
    ...extra,
  });

  it('shortens the weakest bullets before it shrinks the type', async () => {
    const { fit, spec: built } = await renderResumePdf(spec(), pools, profile) as { fit: { bodyPt: number; strategy: string; fitted: boolean; swaps: Array<{ block: string; from: string; to: string }> }; spec: { sections: Array<{ entries: Array<{ bullets: unknown[] }> }> } };
    expect(fit.strategy).toBe('short-first');
    expect(fit.fitted).toBe(true);
    expect(fit.bodyPt).toBe(10.5);                 // no font step was needed
    expect(fit.swaps.length).toBeGreaterThan(0);
    // Weakest first: every rank-4 bullet shrinks before any rank-3 one.
    const firstRank3 = fit.swaps.findIndex((swap) => swap.block.endsWith('.b2'));
    const lastRank4 = fit.swaps.map((swap) => swap.block.endsWith('.b3')).lastIndexOf(true);
    if (firstRank3 !== -1) expect(lastRank4).toBeLessThan(firstRank3);
    for (const swap of fit.swaps) expect(swap).toMatchObject({ from: 'full', to: 'short' });
    // The spec as built carries the tiers, so it rebuilds the same document.
    const tiered = built.sections[0].entries.flatMap((entry) => entry.bullets).filter((row) => typeof row === 'object');
    expect(tiered).toHaveLength(fit.swaps.length);
  });

  it('carries the swaps into the DOCX and Markdown too', async () => {
    const result = await renderResume(spec(), pools, profile) as { markdown: string; fit: { swaps: Array<{ block: string }> } };
    const swapped = result.fit.swaps[0].block.split('.');
    const index = pools.experience.entries.findIndex((entry) => entry.id === swapped[0]) * 4 + Number(swapped[1].slice(1));
    expect(result.markdown).toContain(`Rebuilt model ${index} into an optimiser.`);
    expect(result.markdown).not.toContain(sentence(index));
  });

  it('steps the type only, when asked to keep every tier', async () => {
    const { fit } = await renderResumePdf(spec({ fitStrategy: 'typography' }), pools, profile) as { fit: { bodyPt: number; swaps: unknown[] } };
    expect(fit.swaps).toEqual([]);
    expect(fit.bodyPt).toBeLessThan(10.5);
  });

  it('leaves a two-page spec to typography unless told otherwise', async () => {
    const { fit } = await renderResumePdf(spec({ pages: 2 }), pools, profile) as { fit: { strategy: string } };
    expect(fit.strategy).toBe('typography');
  });
});

describe('the MCP surface', () => {
  it('lists every stored tier with its line cost, or one sentence per bullet at a tier', async () => {
    const { decoratedBlocks } = await import('../server/portfolioMcp.mjs');
    type Row = { id: string; variants?: Record<string, string>; tierLines?: Record<string, number>; text?: string; tier?: string; lines: number };
    const rows = (blocks: { sections: Array<{ entries: Array<{ bullets: Row[] }> }> }) => blocks.sections.flatMap((section) => section.entries.flatMap((entry) => entry.bullets));
    const all = rows(decoratedBlocks() as never);
    for (const row of all) {
      expect(Object.keys(row.tierLines ?? {})).toEqual(Object.keys(row.variants ?? {}).filter((key) => ['short', 'standard', 'full', 'deep'].includes(key)));
      expect(row.lines).toBe(row.tierLines?.full);
    }
    const standard = rows(decoratedBlocks({ tier: 'standard' }) as never);
    expect(standard).toHaveLength(all.length);
    for (const row of standard) {
      expect(row.variants).toBeUndefined();
      expect(typeof row.text).toBe('string');
      expect(['standard', 'full']).toContain(row.tier);
    }
  });

  it('reports tier fallbacks and the spec as built on every build', async () => {
    const { buildResume } = await import('../server/portfolioMcp.mjs');
    const { configBySlug } = await import('../server/resumeContent.mjs');
    const built = await buildResume(configBySlug('highlights')) as { tierFallbacks: unknown[]; spec: { detail: string }; fit: { swaps: unknown[] } };
    expect(Array.isArray(built.tierFallbacks)).toBe(true);
    expect(built.spec.detail).toBe('standard');
    expect(Array.isArray(built.fit.swaps)).toBe(true);
  });
});
