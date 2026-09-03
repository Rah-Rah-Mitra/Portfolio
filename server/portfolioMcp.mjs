// portfolioMcp.mjs — read-only portfolio + résumé data for api/mcp.mjs (MCP
// tools) and api/portfolio.mjs (JSON export). Imports ONLY JSON and packages:
// Vercel compiles api/ per file as native ESM (no bundling), so nothing here
// may import portfolioData.ts — regenerate server/portfolio-snapshot.json with
// `npm run snapshot` after data changes.
import { z } from 'zod';
import snapshot from './portfolio-snapshot.json' with { type: 'json' };
import profile from '../scripts/resume/content/profile.json' with { type: 'json' };
import education from '../scripts/resume/content/education.json' with { type: 'json' };
import experience from '../scripts/resume/content/experience.json' with { type: 'json' };
import projects from '../scripts/resume/content/projects.json' with { type: 'json' };
import leadership from '../scripts/resume/content/leadership.json' with { type: 'json' };
import skills from '../scripts/resume/content/skills.json' with { type: 'json' };
import softwareEngineer from '../scripts/resume/content/resumes/software-engineer.json' with { type: 'json' };
import solutionArchitect from '../scripts/resume/content/resumes/solution-architect.json' with { type: 'json' };
import aiEngineer from '../scripts/resume/content/resumes/ai-engineer.json' with { type: 'json' };
import operationsResearchEngineer from '../scripts/resume/content/resumes/operations-research-engineer.json' with { type: 'json' };
import cyberSecurity from '../scripts/resume/content/resumes/cyber-security.json' with { type: 'json' };
import civicTechSolutionArchitect from '../scripts/resume/content/resumes/civic-tech-solution-architect.json' with { type: 'json' };
import highlights from '../scripts/resume/content/resumes/highlights.json' with { type: 'json' };
import general from '../scripts/resume/content/resumes/general.json' with { type: 'json' };

// ponytail: static imports so Vercel's file tracing bundles the configs; no fs/glob.
export const resumeConfigs = [softwareEngineer, solutionArchitect, aiEngineer, operationsResearchEngineer, cyberSecurity, civicTechSolutionArchitect, highlights, general];

const abs = (path) => new URL(path, snapshot.site.canonicalUrl).href;
const pools = { education: education.entries, experience: experience.entries, projects: projects.entries, leadership: leadership.entries };
const skillLines = new Map(skills.lines.map((line) => [line.id, line]));
const configBySlug = (slug) => resumeConfigs.find((config) => config.slug === slug);

// Mirrors scripts/resume/build_resumes.py:38-74 — bullet override by slug, sort
// policy (projects by `sort`, everything else by `start`, both desc), and
// two-line (role) vs one-line (project) entries.
export const resumeMarkdown = (config) => {
  const out = [`# ${profile.name}`, profile.contact.map((item) => (item.url ? `[${item.text}](${item.url})` : item.text)).join(' · ')];
  for (const section of config.sections) {
    out.push('', `## ${section.title}`);
    if (section.type === 'skills') {
      for (const id of section.lines) {
        const line = skillLines.get(id);
        out.push(`- **${line.label}:** ${line.items}`);
      }
      continue;
    }
    const pool = new Map(pools[section.type].map((entry) => [entry.id, entry]));
    const key = section.type === 'projects' ? 'sort' : 'start';
    const chosen = section.entries
      .map((selection) => ({ entry: pool.get(selection.id), bullets: selection.bullets ?? [] }))
      .sort((a, b) => b.entry[key].localeCompare(a.entry[key]));
    for (const { entry, bullets } of chosen) {
      out.push('', entry.role
        ? `**${entry.organization}**, ${entry.location ?? ''} — *${entry.role}* (${entry.dateLabel})`
        : `**${entry.organization}** (${entry.dateLabel})`);
      const byId = new Map((entry.bullets ?? []).map((bullet) => [bullet.id, bullet]));
      for (const id of bullets) {
        const bullet = byId.get(id);
        out.push(`- ${bullet.text[config.slug] ?? bullet.text.default}`);
      }
    }
  }
  return out.join('\n');
};

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
    description: 'The résumé variants (role-targeted one-pagers, the one-page "highlights" best-of, the two-page "general" master CV) with absolute PDF/DOCX URLs and page counts.',
    inputSchema: z.object({}),
  }, async () => text(listResumes()));

  server.registerTool('get_resume', {
    title: 'Résumé content',
    description: 'Rendered Markdown of one résumé variant plus its PDF/DOCX URLs. Use "highlights" for the one-page best-of and "general" for the full two-page CV.',
    inputSchema: z.object({ slug: z.enum(resumeConfigs.map((config) => config.slug)) }),
  }, async ({ slug }) => {
    const resume = listResumes().find((candidate) => candidate.slug === slug);
    return text(`${resumeMarkdown(configBySlug(slug))}\n\nPDF: ${resume.pdfUrl}\nDOCX: ${resume.docxUrl}`);
  });
};
