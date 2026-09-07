// resumeContent.mjs — the résumé content pools and canonical configs, imported
// once and shared by the MCP tools, the build API, and the renderer.
//
// Static imports only: Vercel compiles api/ per file as native ESM with no
// bundling, so file tracing needs to see every JSON path literally. A new
// résumé config must be added to `resumeConfigs` here.
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

export { profile };
export const pools = { education, experience, projects, leadership, skills };
export const resumeConfigs = [
  softwareEngineer, solutionArchitect, aiEngineer, operationsResearchEngineer,
  cyberSecurity, civicTechSolutionArchitect, highlights, general,
];
export const configBySlug = (slug) => resumeConfigs.find((config) => config.slug === slug);

/**
 * Every block an agent may select, with each bullet's depth variants. This is
 * the menu for build_resume: selection is the only way to compose a résumé, so
 * nothing outside this list can reach a document.
 *
 * Entries carrying `blocked` are withheld: Rahul has material he does not want
 * on a résumé at all, and the builder is meant to run without him reviewing the
 * output, so the block has to hold at the menu and again at render time.
 */
export const resumeBlocks = () => ({
  sections: ['education', 'experience', 'projects', 'leadership'].map((type) => ({
    type,
    entries: pools[type].entries.filter((entry) => !entry.blocked).map((entry) => ({
      id: entry.id,
      organization: entry.organization,
      role: entry.role ?? null,
      location: entry.location ?? null,
      dateLabel: entry.dateLabel,
      sort: entry.sort ?? entry.start,
      bullets: (entry.bullets ?? []).map((bullet) => ({
        id: bullet.id,
        variants: Object.fromEntries(Object.entries(bullet.text)),
      })),
    })),
  })),
  skillLines: pools.skills.lines.map(({ id, label, items }) => ({ id, label, items })),
  startingPoints: resumeConfigs.map((config) => ({ slug: config.slug, subject: config.subject, pages: config.pages })),
});
