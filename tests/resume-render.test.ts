import { describe, expect, it } from 'vitest';
import {
  assemble, decodeSpec, encodeSpec, renderResumeMarkdown, renderResumePdf, specSchema,
} from '../server/resumeRender.mjs';
import { configBySlug, pools, profile, resumeBlocks, resumeConfigs } from '../server/resumeContent.mjs';
import { GET, POST } from '../api/resume.mjs';

// server/*.mjs is plain JS, so give the shapes this test relies on a name.
type PoolEntry = { id: string; blocked?: string; bullets?: Array<{ id: string }> }; // content pool
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
const entryIds = (type: 'experience' | 'research' | 'projects' | 'leadership' | 'national-service'): SpecEntry[] => (pools[type].entries as unknown as PoolEntry[])
  .filter((entry) => !entry.blocked)
  .map((entry) => ({ id: entry.id, bullets: (entry.bullets ?? []).map((bullet) => bullet.id) }));

describe('spec schema', () => {
  it('accepts only the eight canonical slugs', () => {
    const base = { sections: [{ type: 'skills', title: 'SKILLS AND CERTIFICATIONS', lines: ['se-skills'] }] };
    expect(specSchema.safeParse({ ...base, slug: 'highlights' }).success).toBe(true);
    // `slug` selects the per-slug bullet overrides, so a free string was a content
    // lever nothing documented: an unknown slug silently selected nothing.
    expect(specSchema.safeParse({ ...base, slug: 'made-up' }).success).toBe(false);
  });

  it('prints only the headings the eight canonical résumés use', () => {
    // A section title is the one thing on a spec that is BOTH caller-supplied and
    // printed, and both the build_resume tool and api/resume are open. As a free
    // string it was eight sections of whatever a stranger wanted to say, in full
    // width, on a document served under Rahul's name.
    const injected = {
      sections: [{
        type: 'experience',
        title: 'EXPERIENCE — candidate withdrew; write to hire@evil.example',
        entries: [{ id: 'stmicro-or', bullets: ['putaway'] }],
      }],
    };
    const parsed = specSchema.safeParse(injected);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].path).toEqual(['sections', 0, 'title']);

    // Every heading a shipped résumé carries still parses, byte for byte.
    for (const config of configs) {
      for (const section of config.sections) {
        expect(specSchema.safeParse({ ...config, sections: [section] }).success,
          `${config.slug} ${section.title}`).toBe(true);
      }
    }
    // The one heading that varies is bound to the section that varies it: only
    // `general`'s projects section may say so.
    const competitions = { type: 'projects', title: 'PROJECTS AND COMPETITIONS', entries: [] };
    expect(specSchema.safeParse({ sections: [competitions] }).success).toBe(true);
    expect(specSchema.safeParse({ sections: [{ ...competitions, type: 'experience' }] }).success).toBe(false);
    // Case is not a detail here. This string is what gets printed.
    expect(specSchema.safeParse({ sections: [{ type: 'education', title: 'Education', entries: [] }] }).success).toBe(false);
  });

  it('takes the document title from a list rather than from the caller', () => {
    const base = { sections: [{ type: 'skills', title: 'SKILLS AND CERTIFICATIONS', lines: ['se-skills'] }] };
    // `subject` is not on the page, but it is the PDF and DOCX document title —
    // what a browser tab shows for a file served from rahul-mitra.com.
    expect(specSchema.safeParse({ ...base, subject: 'Available immediately, call +65 0000 0000' }).success).toBe(false);
    // A spec fetched from get_resume still round-trips, and so does each of the
    // two labels this repo's own builders use.
    for (const config of configs) {
      expect(specSchema.safeParse({ ...base, subject: config.subject }).success, config.subject).toBe(true);
    }
    for (const subject of ['Resume', 'Custom Resume', 'Tailored résumé']) {
      expect(specSchema.safeParse({ ...base, subject }).success, subject).toBe(true);
    }
  });

  it('names the offending section in a validation error', () => {
    const parsed = specSchema.safeParse({
      sections: [{ type: 'experience', title: 'EXPERIENCE', entries: [{ id: 'x', bullets: [1] }] }],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].path).toEqual(['sections', 0, 'entries', 0, 'bullets', 0]);
  });
});

describe('résumé renderer', () => {
  it('renders every canonical config at its declared page count', async () => {
    for (const config of configs) {
      const { pages, fit } = await renderResumePdf(config, pools, profile) as { pages: number; fit: Fit };
      expect(pages, `${config.slug} page count`).toBe(config.pages);
      expect(fit.fitted, `${config.slug} fitted`).toBe(true);
      expect(fit.bodyPt, `${config.slug} never below the nus floor`).toBeGreaterThanOrEqual(8.5);
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
      subject: 'Custom Resume',
      pages: 1,
      sections: [
        { type: 'experience', title: 'EXPERIENCE', entries: entryIds('experience') },
        { type: 'research', title: 'RESEARCH EXPERIENCE', entries: entryIds('research') },
        { type: 'projects', title: 'PROJECTS', entries: entryIds('projects') },
        { type: 'leadership', title: 'CO-CURRICULAR ACTIVITIES AND VOLUNTEER EXPERIENCES', entries: entryIds('leadership') },
        { type: 'national-service', title: 'NATIONAL SERVICE', entries: entryIds('national-service') },
      ],
    };
    const { pages, fit } = await renderResumePdf(oversized, pools, profile) as { pages: number; fit: Fit };
    expect(fit.fitted).toBe(false);
    expect(pages).toBeGreaterThan(1);
    expect(fit.overflow).toMatch(/Remove content/);
    // It tried the whole ladder, in order, and stopped at the style's floor.
    // `nus` has one fixed margin and walks type instead; `harvard` is the other
    // shape — two sizes, then three margins — and both are pinned here so a
    // ladder edit shows up as a diff rather than as a quietly denser résumé.
    expect(fit.attempts.map((attempt) => attempt.bodyPt)).toEqual([10.5, 10, 9.5, 9, 8.5]);
    expect(new Set(fit.attempts.map((attempt) => attempt.marginIn))).toEqual(new Set([0.5]));
    const harvard = await renderResumePdf({ ...oversized, style: 'harvard' }, pools, profile) as { fit: Fit };
    expect(harvard.fit.attempts.map((attempt) => attempt.marginIn)).toEqual([0.7, 0.7, 0.6, 0.5]);
    expect(Math.min(...harvard.fit.attempts.map((attempt) => attempt.bodyPt))).toBe(10);
    // Content survived: nothing the caller selected was dropped to make it fit.
    const markdown = renderResumeMarkdown(oversized, pools, profile) as string;
    expect(markdown).toContain('put-away');
    expect(markdown).toContain('Excel VBA reporting workflow');
  });

  it('swaps in deep variants without touching the standard build', async () => {
    const standard = renderResumeMarkdown(highlights, pools, profile) as string;
    const deep = renderResumeMarkdown({ ...highlights, detail: 'deep' }, pools, profile) as string;
    // nus.award used to carry a deep variant listing the CS4277 syllabus; that
    // content now lives in the cv-skills line, so pick a bullet that still has one.
    expect(standard).not.toContain('From-To edge-list');
    expect(deep).toContain('From-To edge-list');
    expect(deep.length).toBeGreaterThan(standard.length);
    // A bullet with no deep variant still falls back to its usual text.
    expect(deep).toContain('Coordinated weekly senior-engagement activities');
  });

  it('holds deep detail on the master CV in two pages in both styles', async () => {
    // Deep detail fitted both styles in 2026-11 (the A-Level entry dropped, the
    // skills lines narrowed to the master CV's nine, 0.5in margins). Edition
    // 2026-12 took Rahul's own Oct 2026 master CV wording, five Amazon bullets
    // where there had been two, and the default general CV itself now needs
    // nus's 8.5pt floor, so deep detail ran to a third page in nus. The Nov 2026
    // master CV fits it again: its PA bullets merged seven into five, and the
    // bullets it brought in (STMicro's, Abbott's impact pair, Amazon's brief)
    // carry no deep variant to grow into. The nus overflow report is still pinned
    // by the oversized spec above; this one keeps both styles honest at the
    // bottom of their ladders.
    const general = configBySlug('general') as Spec;
    const harvard = await renderResumePdf({ ...general, detail: 'deep', style: 'harvard' }, pools, profile) as { fit: Fit; pages: number };
    expect(harvard.fit.fitted).toBe(true);
    expect(harvard.pages).toBe(2);
    const nus = await renderResumePdf({ ...general, detail: 'deep', style: 'nus' }, pools, profile) as { fit: Fit; pages: number };
    expect(nus.fit.fitted).toBe(true);
    expect(nus.pages).toBe(2);
  });

  it('refuses a project Rahul has blocked, even when a spec names it directly', async () => {
    const blocked = (pools.projects.entries as unknown as PoolEntry[]).filter((entry) => entry.blocked);
    expect(blocked.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['asyncddgs', 'portfolio', 'utopia', 'flowshop', 'ie2110']),
    );
    for (const entry of blocked) {
      const spec = { pages: 1, sections: [{ type: 'projects', title: 'PROJECTS', entries: [{ id: entry.id, bullets: [] }] }] };
      await expect(renderResumePdf(spec, pools, profile)).rejects.toThrow(/is not available for résumés/);
    }
    // No canonical résumé may name one either.
    for (const config of configs) {
      for (const section of config.sections) {
        for (const selection of section.entries ?? []) {
          expect(blocked.map((entry) => entry.id), `${config.slug} selects ${selection.id}`).not.toContain(selection.id);
        }
      }
    }
  });

  it('holds PA to one title and refuses an invented one', async () => {
    const pa = (pools.experience.entries as unknown as Array<{ id: string; role: Record<string, string> }>)
      .find((entry) => entry.id === 'pa');
    expect(Object.keys(pa?.role ?? {})).toEqual(['default']);
    const spec = (roleVariant?: string) => ({
      pages: 1,
      sections: [{ type: 'experience', title: 'EXPERIENCE', entries: [{ id: 'pa', bullets: ['churp'], roleVariant }] }],
    });
    expect(renderResumeMarkdown(spec(), pools, profile) as string).toContain('Software Engineer (Full Stack & Cloud), Pro bono');
    // A key that is not on the entry fails loudly rather than falling back.
    await expect(renderResumePdf(spec('vp-of-everything'), pools, profile)).rejects.toThrow(/unknown role option/);
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

  it('accepts every canonical config and refuses type below the floor', () => {
    for (const config of configs) expect(specSchema.safeParse(config).success, config.slug).toBe(true);
    expect(specSchema.safeParse({ ...highlights, bodyPt: 8 }).success).toBe(false);
    expect(specSchema.safeParse({ ...highlights, bodyPt: 8.5 }).success).toBe(true);
    expect(specSchema.safeParse({ ...highlights, style: 'harvard' }).success).toBe(true);
    expect(specSchema.safeParse({ ...highlights, style: 'nus' }).success).toBe(true);
    expect(specSchema.safeParse({ ...highlights, style: 'europass' }).success).toBe(false);
  });

  it('exposes every pool bullet and skills line, so nothing is hidden from a model', () => {
    // Rahul's requirement: material that is on no ready-made résumé — the AWS
    // deployment bullet, say — must still be offered to anything building one.
    const blocks = resumeBlocks() as { sections: Array<{ type: string; entries: BlockEntry[] }>; skillLines: Array<{ id: string }> };
    const exposed = new Set(blocks.sections.flatMap((section) => section.entries
      .flatMap((entry) => (entry.bullets ?? []).map((bullet) => `${entry.id}.${bullet.id}`))));
    for (const type of ['education', 'experience', 'projects', 'leadership'] as const) {
      for (const entry of pools[type].entries as unknown as PoolEntry[]) {
        if (entry.blocked) continue;
        for (const bullet of entry.bullets ?? []) {
          expect(exposed.has(`${entry.id}.${bullet.id}`), `${entry.id}.${bullet.id} missing from list_resume_blocks`).toBe(true);
        }
      }
    }
    expect(exposed.has('pa.infra')).toBe(true);
    // ...and the converse: what Rahul blocked is not on the menu at all.
    expect(exposed.has('asyncddgs.main')).toBe(false);
    expect(exposed.has('portfolio.main')).toBe(false);
    const lines = new Set(blocks.skillLines.map((line) => line.id));
    for (const line of pools.skills.lines as Array<{ id: string }>) {
      expect(lines.has(line.id), `${line.id} missing from list_resume_blocks`).toBe(true);
    }
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

  it('refuses to print a caller\'s prose as a section heading', async () => {
    // This endpoint asks for no token, so the spec in the URL is a stranger's.
    // The heading must fail validation rather than reach the renderer.
    const injected = {
      ...highlights,
      sections: highlights.sections.map((section) => (section.type === 'experience'
        ? { ...section, title: 'EXPERIENCE (references: hire@evil.example)' }
        : section)),
    };
    const response = await GET(new Request(url(`spec=${encodeSpec(injected)}`)));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/sections\.\d+\.title/);
    // The same spec with its own heading back still renders, so this is the
    // heading being refused and not the selection.
    expect((await GET(new Request(url(`spec=${encodeSpec(highlights)}`)))).status).toBe(200);
  });

  it('rejects a malformed spec, an unknown format, and an invalid selection', async () => {
    expect((await GET(new Request(url('spec=notbase64')))).status).toBe(400);
    expect((await GET(new Request(url(`format=exe&spec=${encodeSpec(highlights)}`)))).status).toBe(400);
    const badSpec = { ...highlights, sections: [{ type: 'skills', title: 'SKILLS AND CERTIFICATIONS', lines: ['nope'] }] };
    const badId = await GET(new Request(url(`spec=${encodeSpec(badSpec)}`)));
    expect(badId.status).toBe(400);
    expect((await badId.json()).error).toMatch(/unknown skills line: nope/);
  });
});

describe('the master CV shapes a spec can ask for', () => {
  // Nov 2026: general reproduces Rahul's VMock master CV, which needed a summary
  // section, one-bullet project lines, the GPA, grouping by employer and an
  // undated heading. Each is a selection, never text a caller supplies.
  type Rich = { kind: string; entryId?: string; sectionType?: string; organization?: string; role?: string | null; dateLabel?: string; label?: string; text?: string; inline?: boolean };
  const general = configBySlug('general') as Spec;
  const items = assemble(general, pools) as Rich[];

  it('prints the summary from profile.json, and only where a summary section selects it', () => {
    const text = items.find((item) => item.kind === 'text');
    expect(text?.sectionType).toBe('summary');
    expect(text?.text).toBe((profile as { summary: string }).summary);
    expect((assemble(highlights, pools) as Rich[]).some((item) => item.kind === 'text')).toBe(false);
    // The schema takes the section with no text of its own.
    expect(specSchema.safeParse({ pages: 1, sections: [{ type: 'summary', title: 'SUMMARY', text: 'mine' }] }).data)
      .toEqual({ pages: 1, sections: [{ type: 'summary', title: 'SUMMARY' }] });
  });

  it('runs cv-inline projects as one labelled bullet, the date inside the parenthetical', () => {
    const swarmline = items.find((item) => item.kind === 'bullet' && item.entryId === 'swarmline');
    expect(swarmline?.label).toBe('Team Lead & Finalist, Swarmline: SG Defence Tech Hackathon (1,300+ applicants, Sep 2026)');
    expect(items.find((item) => item.kind === 'bullet' && item.entryId === 'hailo')?.label)
      .toBe('Personal Project, Hailo Edge AI Training and Deployment (Mar 2026)');
    expect(items.filter((item) => item.kind === 'entry' && item.sectionType === 'projects').every((item) => item.inline)).toBe(true);
    // Its sentence stays its own, so the checker reads the verb, not the label.
    expect(swarmline?.text?.startsWith('Directed a 5-person team')).toBe(true);
    const twoBullets = { ...general, sections: general.sections.map((section) => (section.type === 'projects'
      ? { ...section, entries: [{ id: 'swarmline', bullets: ['coordination', 'main'] }] } : section)) };
    expect(() => assemble(twoBullets, pools)).toThrow(/one bullet; swarmline selects 2/);
  });

  it('prints the GPA after the degree unless the selection drops it', () => {
    const degree = items.find((item) => item.kind === 'entry' && item.entryId === 'nus');
    expect(degree?.role).toBe('Bachelor of Engineering, Industrial and Systems Engineering (GPA: 4.37/5.00)');
    const without = { ...general, sections: general.sections.map((section) => (section.type === 'education'
      ? { ...section, entries: [{ id: 'nus', gpa: false, bullets: ['majors'] }] } : section)) };
    expect((assemble(without, pools) as Rich[]).find((item) => item.entryId === 'nus')?.role)
      .toBe('Bachelor of Engineering, Industrial and Systems Engineering');
  });

  it('keeps one company\'s entries together whatever their dates, by rule', () => {
    const order = (spec: Spec) => (assemble(spec, pools) as Rich[])
      .filter((item) => item.kind === 'entry' && item.sectionType === 'experience').map((item) => item.entryId);
    // People's Association ended (Sep 2026) after the internship (Jun 2026), so
    // the date sort alone would print it between the two Abbott roles. The
    // group takes the place of its first entry, the running contract.
    expect(order(general)).toEqual(['stmicro-or', 'abbott-contract', 'abbott-intern', 'pa']);
    const reversed = { ...general, sections: general.sections.map((section) => (section.type === 'experience'
      ? { ...section, entries: [...(section.entries ?? [])].reverse() } : section)) };
    expect(order(reversed)).toEqual(order(general));
    // Every canonical résumé, every dated section: no company is split.
    const company = (organization: string) => organization.replace(/(\s*\([^()]*\))+\s*$/, '').trim().toLowerCase();
    for (const config of configs) {
      const entries = (assemble(config, pools) as Rich[]).filter((item) => item.kind === 'entry' && item.sectionType !== 'projects');
      for (const type of new Set(entries.map((item) => item.sectionType))) {
        const printed = entries.filter((item) => item.sectionType === type).map((item) => company(item.organization ?? ''));
        const split = printed.filter((name, index) => index > 0 && printed[index - 1] !== name && printed.slice(0, index - 1).includes(name));
        expect(split, `${config.slug} ${type}`).toEqual([]);
      }
    }
    // `after` is retired. A link built with it still parses (zod strips it) and
    // prints the same order.
    const legacy = { ...general, sections: general.sections.map((section) => (section.type === 'experience'
      ? { ...section, entries: (section.entries ?? []).map((entry) => (entry.id === 'abbott-intern' ? { ...entry, after: 'abbott-contract' } : entry)) } : section)) };
    const parsed = specSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    expect(order(parsed.data as Spec)).toEqual(order(general));
  });

  it('dates the A*STAR heading on general, as the 2026-11-02 master CV does', () => {
    const astar = items.find((item) => item.kind === 'entry' && item.entryId === 'astar-artc');
    expect(astar?.organization).toBe('A*STAR');
    expect(astar?.dateLabel).toBe('Jan 2027 – May 2027');
    // `date: false` stays a spec option for an entry whose bullet says when.
    const undated = { pages: 1, sections: [{ type: 'research', title: 'RESEARCH EXPERIENCE', entries: [{ id: 'astar-artc', date: false, bullets: ['attachment'] }] }] };
    expect((assemble(undated, pools) as Rich[]).find((item) => item.kind === 'entry')?.dateLabel).toBe('');
  });

  it('prints the research and national service sections, from a spec the schema accepts', () => {
    const markdown = renderResumeMarkdown(general, pools, profile) as string;
    expect(markdown).toContain('## NATIONAL SERVICE');
    expect(markdown).toContain('## RESEARCH EXPERIENCE');
    expect(specSchema.safeParse(general).success).toBe(true);
  });
});
