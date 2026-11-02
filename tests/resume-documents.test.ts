import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pools, resumeConfigs } from '../server/resumeContent.mjs';
import { ENTRY_SECTION_TYPES } from '../server/resumeAssemble.mjs';

// The eight canonical résumés are built by scripts/resume/build_resumes.py and MS
// Word, on Windows (without Windows, by the corrected LibreOffice export in
// scripts/resume/export_pdf_libreoffice.py), and the DOCX/PDF in
// public/resume/generated are the artefacts that actually reach employers.
// Nothing in this test suite can rebuild them, so the risk is a content edit
// that silently makes those files stale.
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
type SkillLine = { id: string; label: string; items: string };
type Section = { type: string; entries?: Array<{ id: string; bullets?: string[] }>; lines?: string[] };
type Config = { slug: string; pages: number; sections: Section[]; phrasings?: unknown };

const configs = resumeConfigs as Config[];
const SLUGS = configs.map((config) => config.slug);

/** build_resumes.py's resolution, mirrored. Slug override, else the default. */
const shippedText = (bullet: PoolBullet, slug: string) => bullet.text[slug] ?? bullet.text.default;

const documentDigest = (config: Config) => {
  const lines: string[] = [];
  for (const section of config.sections) {
    if (section.type === 'summary') {
      // add_text prints profile.json's paragraph, so the summary is shipped words.
      lines.push((pools.profile as { summary: string }).summary);
      continue;
    }
    if (section.type === 'skills') {
      // add_skill_line prints "label: items". Skipped until Sep 2026, when every
      // skills line in the pool changed and not one pin moved.
      const byId = new Map((pools.skills.lines as unknown as SkillLine[]).map((line) => [line.id, line]));
      for (const id of section.lines ?? []) {
        const line = byId.get(id);
        expect(line, `${config.slug} selects skills line ${id}`).toBeTruthy();
        lines.push(`${line?.label}: ${line?.items}`);
      }
      continue;
    }
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
  // export-pdf.ps1 (Word COM, Windows; export_pdf_libreoffice.py without it),
  // verify_resumes.py, and the visual QA pass in CLAUDE.md. A moved digest with
  // unchanged files in public/resume/generated means those files no longer say
  // what this repo says.
  it('pins every canonical résumé to the words Word would render', () => {
    expect(Object.fromEntries(configs.map((config) => [config.slug, documentDigest(config)]))).toEqual({
      // All eight moved again in Oct 2026, rebuilt through Word: Rahul's master CV
      // corrected Swarmline (team lead, 1,300+ applicants, two bullets) and put
      // coursework and ywh.network back on general; Swarmline joined six more
      // résumés down the trim ladder; the RL certificate took its certificate's
      // title, which touches every certs line but certs-cyber; and BRINHACK became
      // BrainHack. Every DOCX was checked to hold exactly the text these hash.
      // All eight moved again for edition 2026-12, rebuilt through Word: the
      // Amazon role ended (Oct 2026) and took Rahul's own wording (title, five
      // bullets on general, sr-reproduction on ai-engineer), STMicroelectronics'
      // header moved the System Design Project onto the company, and the
      // hl-ai-data line (general, highlights) dropped its five assistant tools.
      // Two moved on 2026-10-23, rebuilt through Word in place: Rahul asked for
      // abbott-contract.setpoint (general, operations-research-engineer) to say
      // "globally distributed plants" instead of "4 plants". The same rebuild
      // retitled the role "Global Operational AI Systems & Data Engineer
      // (Contract)" on all eight, which this digest does not hash.
      // All eight moved for the Nov 2026 master CV, rebuilt in place as edition
      // 2026-12 (build_resumes.py, then export_pdf_libreoffice.py: this machine
      // had no Word): STMicro's three new bullets for putaway, Abbott's impact
      // bullets, Amazon's brief, the merged PA infra and survey lines, NTUC's
      // home visits, the Navy's corrected 6-month figure and BrainHack's top 25%,
      // plus general's summary, which add_text prints and this now hashes. Every
      // DOCX was checked paragraph by paragraph against assemble(). The six that
      // carry certs-core or certs-or moved again the same day, when Rahul took the
      // Packt and Intellezy courses off those lines as the CV had.
      // general moved on 2026-11-02, rebuilt in place (LibreOffice again): the
      // master CV dropped "(Jan to May 2027, 2 days/week)" from A*STAR's bullet
      // once its heading carried the dates. The same rebuild grouped the Abbott
      // roles on the six role résumés that had printed People's Association
      // between them, and set 0.5in top and bottom margins on all eight; neither
      // moves a digest, which hashes words in selection order, not layout.
      'software-engineer': 'bfd95189a334c0ce',
      'solution-architect': '6a1b13e05fd6c591',
      'ai-engineer': '52e2008e76f7bfd3',
      'operations-research-engineer': '8e9b7f0fff2036f1',
      'cyber-security': 'd2bb31654c280637',
      'civic-tech-solution-architect': 'd6d9730620df57b7',
      highlights: 'f0c891e33a08acc0',
      general: 'd3087676bdc82ec8',
    });
  });

  // The per-slug keys are the one mechanism that targets a shipped document, so
  // the inventory is pinned rather than the mere count: a new one is a change to
  // a résumé an employer has, and it should be impossible to add by accident.
  it('pins which bullets carry a per-résumé override', () => {
    const overrides: string[] = [];
    for (const type of ENTRY_SECTION_TYPES as Array<'experience'>) {
      for (const entry of pools[type].entries as unknown as PoolEntry[]) {
        for (const bullet of entry.bullets ?? []) {
          for (const key of Object.keys(bullet.text)) {
            if (SLUGS.includes(key)) overrides.push(`${entry.id}.${bullet.id}:${key}`);
          }
        }
      }
    }
    // Six overrides retired in the 2026-11 pass, and each for the same reason:
    // the new default already says what the override said. apc's cyber-security
    // and highlights wordings became the default; digital-twin's OR wording is
    // now the default's own "compared 3 approaches"; coursework's general and
    // highlights rows matched the new default; and ywh.programs:highlights was
    // the two bullets welded together, which rendered at four lines.
    expect(overrides.sort()).toEqual([
      'abbott-intern.apc:solution-architect',
      'nus.coursework:ai-engineer',
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
    for (const type of ENTRY_SECTION_TYPES as Array<'experience'>) {
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

// Rules from the Nov 2026 master CV sync (portfolio-mcp-update-spec.md), held for
// every block rather than checked once: the MCP and VMock must not diverge.
describe('the master CV house rules hold across the pool', () => {
  type RuleEntry = { id: string; organization: string; role?: string | Record<string, string>; bullets?: PoolBullet[] };
  const entries = ENTRY_SECTION_TYPES.flatMap((type) => (pools[type as 'experience'].entries as unknown as RuleEntry[])
    .map((entry) => ({ ...entry, type })));

  it('keeps job titles to the 60 characters VMock allows, in Title Case', () => {
    // Education's role is a degree, not a job title, and VMock's limit is the
    // job-title field's.
    const titles = entries.filter((entry) => entry.type !== 'education')
      .flatMap((entry) => (typeof entry.role === 'object' ? Object.values(entry.role) : [entry.role ?? '']));
    expect(titles.filter((title) => title.length > 60)).toEqual([]);
    expect(titles.filter((title) => /part-time/i.test(title) && !title.includes('Part-Time'))).toEqual([]);
  });

  it('carries none of the wording the master CV retired', () => {
    const defaults = entries.flatMap((entry) => (entry.bullets ?? []).map((bullet) => `${entry.id}.${bullet.id}: ${bullet.text.default}`));
    expect(defaults.filter((text) => /Singapore warehouse|against 2\.1/.test(text))).toEqual([]);
    // "Amazon" alone reads as employment; the research entry is BlendED x Amazon Robotics.
    expect(entries.filter((entry) => entry.organization.trim() === 'Amazon').map((entry) => entry.id)).toEqual([]);
  });

  it('heads every canonical section the way the master CV does', () => {
    // The schema still accepts the retired "LEADERSHIP AND ACTIVITIES" and
    // "PROJECTS AND COMPETITIONS" so older links parse; no shipped résumé uses them.
    const HEADINGS: Record<string, string> = {
      summary: 'SUMMARY',
      education: 'EDUCATION',
      experience: 'WORK EXPERIENCE',
      research: 'RESEARCH EXPERIENCE',
      projects: 'PROJECTS',
      leadership: 'CO-CURRICULAR ACTIVITIES AND VOLUNTEER EXPERIENCES',
      'national-service': 'NATIONAL SERVICE',
      skills: 'SKILLS AND CERTIFICATIONS',
    };
    const off = configs.flatMap((config) => (config.sections as Array<Section & { title: string }>)
      .filter((section) => section.title !== HEADINGS[section.type])
      .map((section) => `${config.slug}: ${section.type} "${section.title}"`));
    expect(off).toEqual([]);
  });

  it('writes no em dash into résumé content', () => {
    const everything = JSON.stringify([pools.profile, pools.skills, ...entries]);
    expect(everything.includes('\u2014')).toBe(false);
  });
});
