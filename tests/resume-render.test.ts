import { describe, expect, it } from 'vitest';
import {
  assemble, decodeSpec, encodeSpec, renderResumeMarkdown, renderResumePdf, specSchema,
} from '../server/resumeRender.mjs';
import { configBySlug, pools, profile, resumeBlocks, resumeConfigs } from '../server/resumeContent.mjs';
import { GET, POST } from '../api/resume.mjs';

// server/*.mjs is plain JS, so give the shapes this test relies on a name.
type PoolEntry = { id: string; bullets?: Array<{ id: string }> };            // content pool
type BlockEntry = { id: string; bullets?: Array<{ id: string; variants: Record<string, string> }> }; // list_resume_blocks
type SpecEntry = { id: string; bullets?: string[] };                          // a spec: bullets are ids
type Section = { type: string; title: string; entries?: SpecEntry[]; lines?: string[] };
type Spec = { slug?: string; subject?: string; pages: number; sections: Section[] };
type Item = { kind: string; organization?: string };
type Fit = { fitted: boolean; bodyPt: number; overflow?: string; attempts: Array<{ bodyPt: number; marginIn: number }> };

// The four contact URLs verify_resumes.py requires as live PDF link annotations.
const CONTACT_URIS = [
  'mailto:mitrarahul2002@gmail.com',
  'https://www.linkedin.com/in/rahulmitra-dev',
  'https://github.com/Rah-Rah-Mitra',
  'https://rahul-mitra.com/',
];

const configs = resumeConfigs as Spec[];
const highlights = configBySlug('highlights') as Spec;
const entryIds = (type: 'experience' | 'projects'): SpecEntry[] => (pools[type].entries as unknown as PoolEntry[])
  .map((entry) => ({ id: entry.id, bullets: (entry.bullets ?? []).map((bullet) => bullet.id) }));

describe('résumé renderer', () => {
  it('renders every canonical config at its declared page count', async () => {
    for (const config of configs) {
      const { pages, fit } = await renderResumePdf(config, pools, profile) as { pages: number; fit: Fit };
      expect(pages, `${config.slug} page count`).toBe(config.pages);
      expect(fit.fitted, `${config.slug} fitted`).toBe(true);
      expect(fit.bodyPt, `${config.slug} never below 10pt`).toBeGreaterThanOrEqual(10);
    }
  });

  it('writes the contact line as real link annotations', async () => {
    const { pdf } = await renderResumePdf(highlights, pools, profile) as { pdf: Buffer };
    const bytes = pdf.toString('latin1');
    for (const uri of CONTACT_URIS) expect(bytes, uri).toContain(uri);
  });

  it('keeps the text the résumé verifier requires', () => {
    const markdown = renderResumeMarkdown(highlights, pools, profile) as string;
    for (const needle of ['RAHUL MITRA', 'rahul-mitra.com', 'STMicroelectronics', 'put-away', 'Amazon', 'super-resolution']) {
      expect(markdown).toContain(needle);
    }
    expect(markdown).not.toContain('PROFILE SUMMARY');
  });

  it('sorts entries reverse-chronologically whatever order they are listed in', () => {
    const scrambled: Spec = {
      ...highlights,
      sections: highlights.sections.map((section) => (
        section.type === 'experience' ? { ...section, entries: [...(section.entries ?? [])].reverse() } : section
      )),
    };
    const organizations = (spec: Spec) => (assemble(spec, pools) as Item[])
      .filter((item) => item.kind === 'entry')
      .map((item) => item.organization);
    expect(organizations(scrambled)).toEqual(organizations(highlights));
    expect(organizations(highlights)[0]).toBe('National University of Singapore');
  });

  it('walks the typography ladder before giving up, and never drops content', async () => {
    // Every experience bullet plus every project — far past one page.
    const oversized: Spec = {
      subject: 'Oversized',
      pages: 1,
      sections: [
        { type: 'experience', title: 'EXPERIENCE', entries: entryIds('experience') },
        { type: 'projects', title: 'PROJECTS', entries: entryIds('projects') },
      ],
    };
    const { pages, fit } = await renderResumePdf(oversized, pools, profile) as { pages: number; fit: Fit };
    expect(fit.fitted).toBe(false);
    expect(pages).toBeGreaterThan(1);
    expect(fit.overflow).toMatch(/Remove content/);
    // It tried the whole ladder, in order, and stopped at 10pt.
    expect(fit.attempts.map((attempt) => attempt.marginIn)).toEqual([0.7, 0.7, 0.6, 0.5]);
    expect(Math.min(...fit.attempts.map((attempt) => attempt.bodyPt))).toBe(10);
    // Content survived: nothing the caller selected was dropped to make it fit.
    const markdown = renderResumeMarkdown(oversized, pools, profile) as string;
    expect(markdown).toContain('put-away');
    expect(markdown).toContain('Excel VBA automation workflow');
  });

  it('names the offending id when a selection does not exist', async () => {
    const broken = { pages: 1, sections: [{ type: 'experience', title: 'EXPERIENCE', entries: [{ id: 'nope', bullets: [] }] }] };
    await expect(renderResumePdf(broken, pools, profile)).rejects.toThrow(/unknown experience entry: nope/);
  });
});

describe('résumé spec', () => {
  it('round-trips through a URL-sized string', () => {
    const encoded = encodeSpec(highlights) as string;
    expect(encoded.length).toBeLessThan(2000);
    expect(decodeSpec(encoded)).toEqual(highlights);
  });

  it('accepts every canonical config and refuses type below 10pt', () => {
    for (const config of configs) expect(specSchema.safeParse(config).success, config.slug).toBe(true);
    expect(specSchema.safeParse({ ...highlights, bodyPt: 8 }).success).toBe(false);
  });

  it('offers only selectable ids as building blocks', () => {
    const blocks = resumeBlocks() as {
      sections: Array<{ type: string; entries: BlockEntry[] }>;
      skillLines: Array<{ id: string }>;
      startingPoints: Array<{ slug: string }>;
    };
    expect(blocks.startingPoints).toHaveLength(8);
    expect(blocks.skillLines.length).toBeGreaterThan(15);
    const experience = blocks.sections.find((section) => section.type === 'experience');
    expect(experience?.entries.map((entry) => entry.id)).toContain('stmicro-or');
    // Depth variants travel with the bullet so an agent can pick a register.
    const apc = blocks.sections.flatMap((section) => section.entries)
      .flatMap((entry) => entry.bullets ?? []).find((bullet) => bullet.id === 'apc');
    expect(Object.keys(apc?.variants ?? {})).toContain('default');
  });
});

describe('api/resume', () => {
  const url = (params: string) => `http://localhost/api/resume?${params}`;

  it('serves a PDF from an encoded spec', async () => {
    const response = await GET(new Request(url(`spec=${encodeSpec(highlights)}`)));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('x-resume-pages')).toBe('1');
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('serves DOCX and Markdown from the same spec', async () => {
    const encoded = encodeSpec(highlights);
    const docx = await GET(new Request(url(`format=docx&spec=${encoded}`)));
    expect(docx.headers.get('content-type')).toContain('wordprocessingml');
    expect(Buffer.from(await docx.arrayBuffer()).subarray(0, 2).toString()).toBe('PK');
    const markdown = await GET(new Request(url(`format=md&spec=${encoded}`)));
    expect(await markdown.text()).toContain('# RAHUL MITRA');
  });

  it('accepts a spec by POST for long selections', async () => {
    const response = await POST(new Request(url('format=md'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spec: highlights }),
    }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('STMicroelectronics');
  });

  it('rejects a malformed spec, an unknown format, and an invalid selection', async () => {
    expect((await GET(new Request(url('spec=notbase64')))).status).toBe(400);
    expect((await GET(new Request(url(`format=exe&spec=${encodeSpec(highlights)}`)))).status).toBe(400);
    const badSpec = { ...highlights, sections: [{ type: 'skills', title: 'SKILLS', lines: ['nope'] }] };
    const badId = await GET(new Request(url(`spec=${encodeSpec(badSpec)}`)));
    expect(badId.status).toBe(400);
    expect((await badId.json()).error).toMatch(/unknown skills line: nope/);
  });
});
