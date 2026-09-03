// portfolioSnapshot.ts — JSON-safe projection of the TypeScript portfolio data
// for the serverless MCP + JSON routes (server/portfolioMcp.mjs). Vercel
// compiles api/ per file as native ESM without bundling, so the function cannot
// import portfolioData.ts directly; it imports the committed
// server/portfolio-snapshot.json instead. Regenerate with `npm run snapshot`;
// tests/portfolio-mcp.test.ts fails when the committed snapshot is stale.
import { SITE_CONFIG } from '../siteConfig';
import { allProjects, coreCompetencies, experienceRecords, resumeProfiles, unifiedPortfolioData } from '../portfolioData';
import { WORKBENCH_DOMAINS, archiveRows, dossierStats } from './workbench';

export const buildPortfolioSnapshot = () => ({
  site: {
    name: SITE_CONFIG.name,
    canonicalUrl: SITE_CONFIG.canonicalUrl,
    email: SITE_CONFIG.email,
    location: SITE_CONFIG.location,
    social: SITE_CONFIG.social,
    resumeEdition: SITE_CONFIG.resumeEdition,
  },
  profile: {
    tagline: unifiedPortfolioData.tagline,
    bio: unifiedPortfolioData.bio,
    skills: unifiedPortfolioData.skills.map((skill) => skill.name), // icon (ReactNode) dropped
    competencies: coreCompetencies.map(({ id, title, summary, tools, proof }) => ({ id, title, summary, tools, proof })),
    stats: dossierStats.map(({ value, label }) => ({ value, label })),
  },
  experience: experienceRecords,
  projects: allProjects,
  archive: archiveRows,
  domains: [...WORKBENCH_DOMAINS],
  resumes: resumeProfiles.map(({ id, role, headline, keywords, pdfUrl, docxUrl }) => ({ id, role, headline, keywords, pdfUrl, docxUrl })),
});
