import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pools, resumeConfigs } from '../server/resumeContent.mjs';

// The eight canonical résumés are built by scripts/resume/build_resumes.py and MS
// Word, on Windows, and the DOCX/PDF in public/resume/generated are the artefacts
// that actually reach employers. Nothing in this test suite can rebuild them, so
// the risk is a content edit that silently makes those files stale.
//
// build_resumes.py resolves exactly one way (line 42-44):
//
//     def bullet_text(bullet, slug):
//         text = bullet["text"]
//         return text.get(slug, text["default"])
//
// This file mirrors that rule and pins its output. Anything a future change adds
// to a bullet is safe for the shipped documents if and only if these digests do
// not move: a phrasing stored outside `text`, or a `deep` variant, cannot reach
// Word, while a new key named after a résumé slug silently would.

type PoolBullet = { id: string; text: Record<string, string> };
type PoolEntry = { id: string; bullets?: PoolBullet[] };
type Section = { type: string; entries?: Array<{ id: string; bullets?: string[] }>; lines?: string[] };
type Config = { slug: string; pages: number; sections: Section[]; phrasings?: unknown };

const configs = resumeConfigs as Config[];
const SLUGS = configs.map((config) => config.slug);

/** build_resumes.py's resolution, mirrored. Slug override, else the default. */
const shippedText = (bullet: PoolBullet, slug: string) => bullet.text[slug] ?? bullet.text.default;

const documentDigest = (config: Config) => {
  const lines: string[] = [];
  for (const section of config.sections) {
    if (section.type === 'skills') continue;
    const pool = new Map((pools[section.type as 'experience'].entries as unknown as PoolEntry[]).map((entry) => [entry.id, entry]));
    for (const selection of section.entries ?? []) {
      const byId = new Map((pool.get(selection.id)?.bullets ?? []).map((bullet) => [bullet.id, bullet]));
      for (const id of selection.bullets ?? []) {
        const bullet = byId.get(id);
        expect(bullet, `${config.slug} selects ${selection.id}.${id}`).toBeTruthy();
        lines.push(shippedText(bullet as PoolBullet, config.slug));
      }
    }
  }
  return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
};

describe('the shipped documents are a function of the content pool', () => {
  // Update these ONLY together with a full edition rebuild: build_resumes.py,
  // export-pdf.ps1 (Word COM, Windows), verify_resumes.py, and the visual QA pass
  // in CLAUDE.md. A moved digest with unchanged files in public/resume/generated
  // means those files no longer say what this repo says.
  it('pins every canonical résumé to the words Word would render', () => {
    expect(Object.fromEntries(configs.map((config) => [config.slug, documentDigest(config)]))).toEqual({
      'software-engineer': '2ba1ae08db2b1de7',
      'solution-architect': '3eece3f9d71bc723',
      'ai-engineer': 'c53efa12f43ba41b',
      'operations-research-engineer': 'be75a5ae726ceb35',
      'cyber-security': '4428fa7571183786',
      'civic-tech-solution-architect': '6819b108ac9cf595',
      highlights: '1f35f69edec213c9',
      general: '288a38662814c84c',
    });
  });

  // The per-slug keys are the one mechanism that targets a shipped document, so
  // the inventory is pinned rather than the mere count: a new one is a change to
  // a résumé an employer has, and it should be impossible to add by accident.
  it('pins which bullets carry a per-résumé override', () => {
    const overrides: string[] = [];
    for (const type of ['education', 'experience', 'projects', 'leadership'] as const) {
      for (const entry of pools[type].entries as unknown as PoolEntry[]) {
        for (const bullet of entry.bullets ?? []) {
          for (const key of Object.keys(bullet.text)) {
            if (SLUGS.includes(key)) overrides.push(`${entry.id}.${bullet.id}:${key}`);
          }
        }
      }
    }
    expect(overrides.sort()).toEqual([
      'abbott-intern.apc:cyber-security',
      'abbott-intern.apc:highlights',
      'abbott-intern.apc:solution-architect',
      'abbott-intern.digital-twin:operations-research-engineer',
      'nus.coursework:ai-engineer',
      'nus.coursework:cyber-security',
      'nus.coursework:general',
      'nus.coursework:highlights',
      'nus.coursework:operations-research-engineer',
      'ywh.programs:highlights',
    ]);
  });

  // The property that lets phrasings ship without touching Word: they live outside
  // `text`, and no canonical config selects one. Selecting one from a config would
  // change word/document.xml and reopen the full edition rebuild, so the right way
  // to adopt a winning phrasing is to promote it into text.default at the next
  // edition bump, not to select it here.
  it('keeps every canonical résumé free of phrasing selections', () => {
    for (const config of configs) expect(config.phrasings, config.slug).toBeUndefined();
  });

  it('keeps alternative wordings out of the map the Python builder reads', () => {
    const leaked: string[] = [];
    for (const type of ['education', 'experience', 'projects', 'leadership'] as const) {
      for (const entry of pools[type].entries as unknown as PoolEntry[]) {
        for (const bullet of entry.bullets ?? []) {
          const ids = Object.keys((bullet as { phrasings?: Record<string, unknown> }).phrasings ?? {});
          for (const id of ids) {
            if (id in bullet.text) leaked.push(`${entry.id}.${bullet.id}:${id}`);
          }
        }
      }
    }
    expect(leaked).toEqual([]);
  });

  it('reserves the depth keys, so no résumé slug can ever be named "deep"', () => {
    expect(SLUGS).not.toContain('deep');
    expect(SLUGS).not.toContain('default');
  });
});
