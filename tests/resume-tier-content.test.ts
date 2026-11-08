import { describe, expect, it } from 'vitest';
import { unattestedTokens } from '../server/resumeCheck.mjs';
import { ENTRY_SECTION_TYPES, TIER_BUDGETS, assemble, referenceLines, tierFallbacks } from '../server/resumeRender.mjs';
import { checkSpec } from '../server/portfolioMcp.mjs';
import { pools, resumeConfigs } from '../server/resumeContent.mjs';

// The real pools' length tiers (Nov 2026): the commit-time guard every stored
// tier text has to pass, and portfolio-mcp-upgrades.md's acceptance checks on
// the eight canonical résumés. A short or standard can only enter the pools
// through a commit, so this is where an over-budget or embellished one is caught.

type Phrasing = { text: string; tier?: string; tiers?: Record<string, string> };
type Bullet = { id: string; text: Record<string, string>; rank?: number; requires?: string[]; phrasings?: Record<string, Phrasing> };
type Entry = { id: string; blocked?: string; bullets?: Bullet[] };
type Spec = { slug: string; pages: number; detail?: string; sections: unknown[] };

const entries = () => ENTRY_SECTION_TYPES.flatMap((type: string) => (pools[type as 'experience'].entries as unknown as Entry[]));
const tierTexts = () => entries().flatMap((entry) => (entry.bullets ?? []).flatMap((bullet) => [
  ...(['short', 'standard'] as const).filter((tier) => bullet.text[tier]).map((tier) => ({ entry, bullet, tier, text: bullet.text[tier], ref: `${entry.id}.${bullet.id}@${tier}` })),
  ...Object.entries(bullet.phrasings ?? {}).flatMap(([id, phrasing]) => [
    ...(phrasing.tier && phrasing.tier in TIER_BUDGETS ? [{ entry, bullet, tier: phrasing.tier, text: phrasing.text, ref: `${entry.id}.${bullet.id}#${id}` }] : []),
    ...Object.entries(phrasing.tiers ?? {}).map(([tier, text]) => ({ entry, bullet, tier, text, ref: `${entry.id}.${bullet.id}#${id}@${tier}` })),
  ]),
]));

describe('the tier guard', () => {
  const rows = tierTexts();

  it('has tier texts to guard', () => {
    // 9 standard and 7 short from master-cv-improvements.md (8 Nov 2026).
    expect(rows.filter((row) => row.tier === 'standard')).toHaveLength(9);
    expect(rows.filter((row) => row.tier === 'short')).toHaveLength(7);
  });

  it('holds every stored short to 1 line and standard to 2, at the reference layout', () => {
    const lines = referenceLines(rows.map((row) => row.text));
    const over = rows.filter((row, index) => lines[index] > TIER_BUDGETS[row.tier as 'short']).map((row) => row.ref);
    expect(over).toEqual([]);
  });

  it('adds no claim its entry does not already make', () => {
    for (const row of rows) {
      const attested = (row.entry.bullets ?? []).flatMap((bullet) => [bullet.text.full, bullet.text.deep].filter(Boolean));
      expect(unattestedTokens(row.text, attested), row.ref).toEqual([]);
    }
  });

  it('keeps a shorter tier shorter', () => {
    for (const row of rows) expect(row.text.length, row.ref).toBeLessThan(row.bullet.text.full.length);
  });

  it('ranks each entry once per bullet, and requires only bullets of the same entry', () => {
    for (const entry of entries()) {
      const ranks = (entry.bullets ?? []).map((bullet) => bullet.rank).filter((rank) => rank != null);
      expect(new Set(ranks).size, entry.id).toBe(ranks.length);
      const ids = new Set((entry.bullets ?? []).map((bullet) => bullet.id));
      for (const bullet of entry.bullets ?? []) for (const id of bullet.requires ?? []) expect(ids.has(id), `${entry.id}.${bullet.id} requires ${id}`).toBe(true);
    }
  });
});

describe('the canonical résumés (acceptance checks)', () => {
  const configs = resumeConfigs as unknown as Spec[];
  const roles = configs.filter((config) => config.slug !== 'general');

  it('prints general at full and every role résumé at standard', () => {
    expect(configs.find((config) => config.slug === 'general')?.detail).toBe('full');
    for (const config of roles) expect(config.detail, config.slug).toBe('standard');
  });

  it('reports no tier-over-budget and no orphaned bullet on any of them (check 3)', () => {
    for (const config of configs) {
      const categories = (checkSpec(config) as { findings: Array<{ category: string }> }).findings.map((item) => item.category);
      expect(categories, config.slug).not.toContain('tier-over-budget');
      expect(categories, config.slug).not.toContain('orphaned-bullet');
    }
  });

  it('carries an outcome on every highlights entry that has one to give (check 4)', () => {
    const categories = (checkSpec(configs.find((config) => config.slug === 'highlights') as Spec) as { findings: Array<{ category: string }> }).findings.map((item) => item.category);
    expect(categories).not.toContain('no-outcome-entry');
  });

  it('names exactly the standard wordings still missing (check 5)', () => {
    // Three bullets run past 2 lines at the reference layout with no standard
    // wording yet; each role résumé that selects one says so. Rahul to supply.
    const fallbacks = Object.fromEntries(roles.map((config) => [config.slug,
      tierFallbacks(assemble(config, pools)).map((row: { block: string }) => row.block).sort()]));
    expect(fallbacks).toEqual({
      'software-engineer': ['ntuc.main', 'swarmline.coordination', 'swarmline.main'],
      'solution-architect': ['ntuc.main', 'swarmline.coordination', 'swarmline.main'],
      'ai-engineer': ['ntuc.main', 'swarmline.coordination'],
      'operations-research-engineer': ['ntuc.main', 'swarmline.coordination', 'swarmline.main'],
      'cyber-security': ['ntuc.main', 'swarmline.main'],
      'civic-tech-solution-architect': ['ntuc.main'],
      highlights: ['ntuc.main', 'swarmline.main'],
    });
  });

  it('retired amazon-vision.isp from the pool and every résumé', () => {
    const vision = entries().find((entry) => entry.id === 'amazon-vision');
    expect(vision?.bullets?.map((bullet) => bullet.id)).not.toContain('isp');
    for (const config of configs) expect(JSON.stringify(config.sections), config.slug).not.toContain('"isp"');
  });
});
