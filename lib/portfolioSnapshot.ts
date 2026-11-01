// portfolioSnapshot.ts: JSON-safe projection of the TypeScript portfolio data
// for the serverless MCP + JSON routes (server/portfolioMcp.mjs). Vercel
// compiles api/ per file as native ESM without bundling, so the function cannot
// import portfolioData.ts directly; it imports the committed
// server/portfolio-snapshot.json instead. Regenerate with `npm run snapshot`;
// tests/portfolio-mcp.test.ts fails when the committed snapshot is stale.
import { SITE_CONFIG } from '../siteConfig';
import { allProjects, coreCompetencies, experienceRecords, fieldNoteByIdOrAlias, resumeProfiles, unifiedPortfolioData } from '../portfolioData';
import resumeProfile from '../scripts/resume/content/profile.json';
import type { SnapshotExperienceRecord } from '../types';
import { experienceResponsibilities } from './experienceResponsibilities';
import { WORKBENCH_DOMAINS, archiveRows, dossierStats } from './workbench';

// Responsibilities are keyed like experienceDetailById, by a record's own id or
// by the alias of a field note that merged into it (YesWeHack's record is
// cyber-achievement-3), so resolve each key to the record it describes.
const responsibilitiesByRecord = new Map(Object.entries(experienceResponsibilities)
  .map(([key, list]) => [fieldNoteByIdOrAlias.get(key)?.id ?? key, list]));

export const snapshotExperience = (): SnapshotExperienceRecord[] => experienceRecords.map(({ outcomes, ...record }) => {
  const responsibilities = responsibilitiesByRecord.get(record.id);
  if (!responsibilities?.length) throw new Error(`experience record ${record.id} has no responsibilities in lib/experienceResponsibilities.ts`);
  return { ...record, responsibilities, outcomes };
});

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
    // The master CV's summary, from the résumé profile so the CV and the MCP
    // read one paragraph. CV-only: no role résumé prints it.
    summary: resumeProfile.summary,
    skills: unifiedPortfolioData.skills.map((skill) => skill.name), // icon (ReactNode) dropped
    competencies: coreCompetencies.map(({ id, title, summary, tools, proof }) => ({ id, title, summary, tools, proof })),
    stats: dossierStats.map(({ value, label }) => ({ value, label })),
  },
  experience: snapshotExperience(),
  projects: allProjects,
  archive: archiveRows,
  domains: [...WORKBENCH_DOMAINS],
  resumes: resumeProfiles.map(({ id, role, headline, keywords, pdfUrl, docxUrl }) => ({ id, role, headline, keywords, pdfUrl, docxUrl })),
});
