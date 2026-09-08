// portfolioMcp.mjs: read-only portfolio data plus the résumé builder tools for
// api/mcp.mjs (MCP) and api/portfolio.mjs (JSON export). Imports ONLY JSON and
// packages: Vercel compiles api/ per file as native ESM (no bundling), so
// nothing here may import portfolioData.ts; regenerate
// server/portfolio-snapshot.json with `npm run snapshot` after data changes.
import { z } from 'zod';
import snapshot from './portfolio-snapshot.json' with { type: 'json' };
import { configBySlug, pools, profile, resumeBlocks, resumeConfigs } from './resumeContent.mjs';
import { assemble, decodeSpec, encodeSpec, measureBulletLines, renderResume, renderResumeMarkdown, specSchema } from './resumeRender.mjs';
import { checkResume, firstWord, framesIn, leadLemma, metricsIn } from './resumeCheck.mjs';
import { RESUME_GUIDE } from './resumeGuide.mjs';

export { resumeConfigs };

const abs = (path) => new URL(path, snapshot.site.canonicalUrl).href;

/** Markdown for one canonical résumé config. */
export const resumeMarkdown = (config) => renderResumeMarkdown(config, pools, profile);

export const listResumes = () => snapshot.resumes.map((resume) => ({
  slug: resume.id,
  role: resume.role,
  headline: resume.headline,
  keywords: resume.keywords,
  pages: configBySlug(resume.id)?.pages ?? null,
  pdfUrl: abs(resume.pdfUrl),
  docxUrl: abs(resume.docxUrl),
}));

export const getProfile = () => ({
  name: snapshot.site.name,
  ...snapshot.profile,
  location: snapshot.site.location,
  email: snapshot.site.email,
  site: snapshot.site.canonicalUrl,
  links: snapshot.site.social,
  resumeEdition: snapshot.site.resumeEdition,
});

// 3-line port of lib/workbench.ts filterArchiveRows (that one lives in the React graph).
export const filterProjects = (query = '', domain = 'All') => {
  const q = query.trim().toLowerCase();
  return snapshot.archive.filter((row) => (domain === 'All' || row.domain === domain)
    && (!q || `${row.title} ${row.category} ${row.stack} ${row.domain}`.toLowerCase().includes(q)));
};

/**
 * The unselected bullets sitting on entries a spec already uses. Swapping one in
 * is the only remedy an agent may apply, so the checker needs this list to tell
 * an actionable finding from one it can only report.
 */
export const swapCandidates = (spec, chosen) => {
  const taken = new Set(chosen);
  const candidates = [];
  for (const section of spec.sections) {
    if (section.type === 'skills') continue;
    for (const selection of section.entries) {
      const entry = pools[section.type].entries.find((item) => item.id === selection.id);
      for (const bullet of entry?.bullets ?? []) {
        const ref = `${entry.id}.${bullet.id}`;
        if (!taken.has(ref)) candidates.push({ ref, entryId: entry.id, sectionType: section.type, text: bullet.text.default });
      }
    }
  }
  return candidates;
};

/**
 * Lane A of the checker, measured at the typography the résumé actually ships
 * at: linting a 10.5pt config as though it were 10pt would report the wrong line
 * counts. `fit` comes from the render when there is one, so build_resume pays for
 * a single pass rather than two.
 */
/**
 * The alternative wordings available for the bullets on this page, with the three
 * facts the rules are about derived at the résumé's own typography. A wording
 * already selected is not offered back.
 */
const rephrasingsFor = (spec, bullets, typography) => {
  const options = [];
  for (const bullet of bullets) {
    const [entryId, bulletId] = [bullet.entryId, bullet.bulletId];
    const source = pools[bullet.sectionType]?.entries.find((entry) => entry.id === entryId)
      ?.bullets?.find((item) => item.id === bulletId);
    for (const [id, phrasing] of Object.entries(source?.phrasings ?? {})) {
      if (bullet.phrasing === id) continue;
      options.push({ ref: bullet.ref, id, text: phrasing.text });
    }
  }
  const lines = measureBulletLines(options.map((option) => option.text), typography);
  const byRef = {};
  options.forEach((option, index) => {
    const found = metricsIn(option.text);
    byRef[option.ref] = [...(byRef[option.ref] ?? []), {
      id: option.id,
      text: option.text,
      lead: firstWord(option.text).replace(/[^A-Za-z-]+$/, ''),
      lemma: leadLemma(firstWord(option.text)),
      frames: framesIn(option.text).map((frame) => (frame.kind === 'opener' ? `opener:${frame.surface}` : 'trailing-participle')),
      lines: lines[index],
      hasMetric: found.metrics.length > 0,
    }];
  });
  return byRef;
};

/**
 * Rahul's own attested technologies, taken from the skills lines rather than a
 * dictionary: the checker imports nothing, so the vocabulary is passed in, and
 * this keeps it to terms he has already claimed somewhere.
 */
const skillTerms = (() => {
  const terms = new Set();
  for (const line of pools.skills.lines) {
    for (const chunk of line.items.split(/[,;]/)) {
      const cleaned = chunk.replace(/\([^)]*\)/g, ' ').trim();
      for (const part of cleaned.split(/\s*\/\s*|\s+&\s+/)) {
        const term = part.trim();
        if (term.length > 2) terms.add(term);
      }
    }
  }
  return [...terms].sort((a, b) => b.length - a.length);
})();

export const checkSpec = (spec, fit = null) => {
  const typography = { bodyPt: fit?.bodyPt ?? undefined, marginIn: fit?.marginIn ?? undefined };
  const bullets = assemble(spec, pools).filter((item) => item.kind === 'bullet');
  const lines = measureBulletLines(bullets.map((bullet) => bullet.text), typography);
  return checkResume(bullets.map((bullet, index) => ({ ...bullet, lines: lines[index] })), {
    candidates: swapCandidates(spec, bullets.map((bullet) => bullet.ref)),
    rephrasings: rephrasingsFor(spec, bullets, typography),
    skillTerms,
    typography: fit ? { bodyPt: fit.bodyPt, marginIn: fit.marginIn } : null,
  });
};

/**
 * Render a spec and return links, the fit report and the check report. The check
 * rides along unasked: the failure this exists to prevent is an agent building,
 * getting a URL and handing it over, and a check you have to remember to call is
 * one a hurried agent skips. Only errors and warnings travel here; check_resume
 * returns the notes too.
 */
export const buildResume = async (spec) => {
  const result = await renderResume(spec, pools, profile);
  const encoded = encodeSpec(spec);
  const full = checkSpec(spec, result.fit);
  return {
    pages: result.pages,
    fit: result.fit,
    check: { ...full, findings: full.findings.filter((item) => item.severity !== 'note') },
    pdfUrl: abs(`/api/resume?spec=${encoded}`),
    docxUrl: abs(`/api/resume?format=docx&spec=${encoded}`),
    markdown: result.markdown,
  };
};

export const portfolioExport = () => ({
  mcp: abs('/api/mcp'),
  profile: getProfile(),
  experience: snapshot.experience,
  projects: snapshot.projects,
  resumes: listResumes().map((resume) => ({ ...resume, markdown: resumeMarkdown(configBySlug(resume.slug)) })),
});

/**
 * resumeBlocks() plus the three derived fields that let an agent choose well
 * instead of being told afterwards that it chose badly: the opening verb, the
 * rendered line cost, and whether the bullet carries a measurement. A repetition
 * finding is a complaint about a decision the menu gave no way to make, so the
 * menu now carries the facts the rules are about.
 *
 * Derived here rather than in resumeContent.mjs because line measurement needs
 * pdfkit, and the builder window imports that module in the browser.
 */
export const decoratedBlocks = () => {
  const blocks = resumeBlocks();
  const bullets = blocks.sections.flatMap((section) => section.entries.flatMap((entry) => entry.bullets));
  const texts = bullets.map((bullet) => bullet.variants.default ?? Object.values(bullet.variants)[0] ?? '');
  const lines = measureBulletLines(texts);
  bullets.forEach((bullet, index) => {
    bullet.lead = firstWord(texts[index]).replace(/[^A-Za-z-]+$/, '');
    bullet.lines = lines[index];
    bullet.hasMetric = metricsIn(texts[index]).metrics.length > 0;
  });
  // Alternative wordings, with the same three derived fields, so an agent can see
  // that a bullet opening "Built" also has one opening "Turned" before it picks.
  const pool = new Map();
  for (const type of ['education', 'experience', 'projects', 'leadership']) {
    for (const entry of pools[type].entries) {
      for (const bullet of entry.bullets ?? []) pool.set(`${entry.id}.${bullet.id}`, bullet);
    }
  }
  for (const section of blocks.sections) {
    for (const entry of section.entries) {
      for (const bullet of entry.bullets) {
        const source = pool.get(`${entry.id}.${bullet.id}`);
        const phrasings = Object.entries(source?.phrasings ?? {});
        if (!phrasings.length) continue;
        const measured = measureBulletLines(phrasings.map(([, item]) => item.text));
        bullet.phrasings = Object.fromEntries(phrasings.map(([id, item], index) => [id, {
          text: item.text,
          note: item.note,
          lead: firstWord(item.text).replace(/[^A-Za-z-]+$/, ''),
          lines: measured[index],
          hasMetric: metricsIn(item.text).metrics.length > 0,
        }]));
      }
    }
  }
  return blocks;
};

// Compact, not pretty-printed. Every one of these payloads is read by a model
// through an MCP tool result, and the indentation was 12,197 bytes of it across
// list_resume_blocks, list_resumes and get_profile alone. Use the MCP inspector
// with a formatter when eyeballing one by hand.
const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });

export const registerPortfolioTools = (server) => {
  server.registerTool('get_profile', {
    title: 'Profile',
    description: 'Who Rahul Mitra is: bio, location, links, headline stats, competency clusters, skills, and the current résumé edition.',
    inputSchema: z.object({}),
  }, async () => text(getProfile()));

  server.registerTool('list_experience', {
    title: 'Experience',
    description: 'Full professional and education record, newest first, with scope, responsibilities, outcomes, and linked project ids.',
    inputSchema: z.object({}),
  }, async () => text(snapshot.experience));

  server.registerTool('list_projects', {
    title: 'Projects',
    description: `All ${snapshot.projects.length} indexed projects as compact rows. Optional text query and domain filter (${snapshot.domains.join(', ')}). Use get_project for the full record.`,
    inputSchema: z.object({ query: z.string().optional(), domain: z.enum(snapshot.domains).optional() }),
  }, async ({ query, domain }) => text(filterProjects(query, domain)));

  server.registerTool('get_project', {
    title: 'Project detail',
    description: 'Full record for one project id from list_projects, including the spotlight narrative, tags, and links.',
    inputSchema: z.object({ id: z.string() }),
  }, async ({ id }) => {
    const project = snapshot.projects.find((candidate) => candidate.id === id);
    return project ? text(project) : { ...text(`Unknown project id: ${id}`), isError: true };
  });

  server.registerTool('list_resumes', {
    title: 'Résumés',
    description: 'The ready-made résumé variants (role-targeted one-pagers, the one-page "highlights" best-of, the two-page "general" master CV) with absolute PDF/DOCX URLs and page counts.',
    inputSchema: z.object({}),
  }, async () => text(listResumes()));

  server.registerTool('get_resume', {
    title: 'Résumé content',
    description: 'One ready-made résumé as Markdown, plus its PDF/DOCX URLs and its build spec. Use the spec as the starting point for a tailored build.',
    inputSchema: z.object({ slug: z.enum(resumeConfigs.map((config) => config.slug)) }),
  }, async ({ slug }) => {
    const resume = listResumes().find((candidate) => candidate.slug === slug);
    const config = configBySlug(slug);
    return text({ ...resume, markdown: resumeMarkdown(config), spec: config });
  });

  // ── résumé builder ──────────────────────────────────────────────────────
  server.registerTool('get_resume_guide', {
    title: 'How to build a résumé',
    description: 'Read this before build_resume. The Harvard layout rules, the spec schema, the ordering policy, how auto-fit works, and the rule that you may only select from list_resume_blocks and must never write your own bullet text.',
    inputSchema: z.object({}),
  }, async () => text(RESUME_GUIDE));

  server.registerTool('list_resume_blocks', {
    title: 'Résumé building blocks',
    description: 'Every entry, bullet (with its depth variants) and skills line you may select, plus the ready-made résumés you can start from. These ids are the only content build_resume accepts. Each bullet also carries its opening verb, its rendered line cost and whether it holds a measurement, so you can spread the verbs and the evidence deliberately rather than being told afterwards. Optionally filter to one section type to keep the response small.',
    inputSchema: z.object({ section: z.enum(['education', 'experience', 'projects', 'leadership', 'skills']).optional() }),
  }, async ({ section }) => {
    const blocks = decoratedBlocks();
    if (!section) return text(blocks);
    if (section === 'skills') return text({ skillLines: blocks.skillLines });
    return text({ sections: blocks.sections.filter((item) => item.type === section) });
  });

  server.registerTool('build_resume', {
    title: 'Build a résumé',
    description: 'Render a Harvard-style résumé from selected block ids and return PDF, DOCX and Markdown. Content comes only from list_resume_blocks; bullet text cannot be supplied. Auto-fit adjusts typography within sanctioned limits and never drops what you chose; if it still overflows you get an overflow report to act on. The response also carries a check report naming repeated opening verbs, repeated sentence frames and over-long bullets, with the block ids to swap where a swap exists.',
    inputSchema: z.object({ spec: specSchema }),
  }, async ({ spec }) => {
    try {
      const built = await buildResume(spec);
      return text(built);
    } catch (error) {
      return { ...text(error instanceof Error ? error.message : 'Could not build résumé'), isError: true };
    }
  });

  server.registerTool('check_resume', {
    title: 'Check a résumé',
    description: 'Check a ready-made slug, or a résumé you built, for repeated opening verbs, a repeated sentence frame, hedging words, thin quantification and over-long bullets. Every finding names block ids, and where the menu holds a fix it names the swap rather than asking you to cut good material. Deterministic: the same selection always returns the same report. It reports counts, never a score, and it never rewrites text. Pass a slug, or the spec value out of a build_resume URL as encodedSpec.',
    inputSchema: z.object({
      slug: z.enum(resumeConfigs.map((config) => config.slug)).optional(),
      encodedSpec: z.string().max(8000).optional(),
    }),
  }, async ({ slug, encodedSpec }) => {
    if ((slug ? 1 : 0) + (encodedSpec ? 1 : 0) !== 1) {
      return { ...text('Pass exactly one of slug or encodedSpec.'), isError: true };
    }
    try {
      const spec = slug ? configBySlug(slug) : specSchema.parse(decodeSpec(encodedSpec));
      const { fit } = await renderResume(spec, pools, profile);
      return text(checkSpec(spec, fit));
    } catch (error) {
      return { ...text(error instanceof Error ? error.message : 'Could not check that résumé'), isError: true };
    }
  });
};
