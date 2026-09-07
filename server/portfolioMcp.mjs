// portfolioMcp.mjs: read-only portfolio data plus the résumé builder tools for
// api/mcp.mjs (MCP) and api/portfolio.mjs (JSON export). Imports ONLY JSON and
// packages: Vercel compiles api/ per file as native ESM (no bundling), so
// nothing here may import portfolioData.ts; regenerate
// server/portfolio-snapshot.json with `npm run snapshot` after data changes.
import { z } from 'zod';
import snapshot from './portfolio-snapshot.json' with { type: 'json' };
import { configBySlug, pools, profile, resumeBlocks, resumeConfigs } from './resumeContent.mjs';
import { encodeSpec, renderResume, renderResumeMarkdown, specSchema } from './resumeRender.mjs';
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

/** Render a spec and return links plus the fit report. Used by the MCP tool. */
export const buildResume = async (spec) => {
  const result = await renderResume(spec, pools, profile);
  const encoded = encodeSpec(spec);
  return {
    pages: result.pages,
    fit: result.fit,
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

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });

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
    description: 'Every entry, bullet (with its depth variants) and skills line you may select, plus the ready-made résumés you can start from. These ids are the only content build_resume accepts. Optionally filter to one section type to keep the response small.',
    inputSchema: z.object({ section: z.enum(['education', 'experience', 'projects', 'leadership', 'skills']).optional() }),
  }, async ({ section }) => {
    const blocks = resumeBlocks();
    if (!section) return text(blocks);
    if (section === 'skills') return text({ skillLines: blocks.skillLines });
    return text({ sections: blocks.sections.filter((item) => item.type === section) });
  });

  server.registerTool('build_resume', {
    title: 'Build a résumé',
    description: 'Render a Harvard-style résumé from selected block ids and return PDF, DOCX and Markdown. Content comes only from list_resume_blocks; bullet text cannot be supplied. Auto-fit adjusts typography within sanctioned limits and never drops what you chose; if it still overflows you get an overflow report to act on.',
    inputSchema: z.object({ spec: specSchema }),
  }, async ({ spec }) => {
    try {
      const built = await buildResume(spec);
      return text(built);
    } catch (error) {
      return { ...text(error instanceof Error ? error.message : 'Could not build résumé'), isError: true };
    }
  });
};
