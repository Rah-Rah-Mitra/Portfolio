import { JOURNEY_STAGES, SECTION_IDS } from '../constants';
import { allProjects, coreCompetencies, experienceRecords, fieldNotes, resumeProfiles } from '../portfolioData';
import { workstationApps } from './workstation';

// Every href the assistant may cite. AskThePage drops any reference outside it,
// and the page state hands the same list to the model.
export const allowedLinks = new Set([
  ...Object.values(SECTION_IDS).map((id) => `#${id}`),
  '#world',
  ...allProjects.flatMap((project) => [`#project-${project.id}`, project.repoUrl, project.liveUrl, ...(project.links ?? []).map((link) => link.url)]).filter((link): link is string => Boolean(link)),
  ...resumeProfiles.flatMap((resume) => [resume.pdfUrl, resume.docxUrl]),
  ...fieldNotes.flatMap((note) => (note.links ?? []).map((link) => link.url)),
]);

/**
 * What the assistant answers from. server/pageAgent.mjs puts only the first
 * PAGE_STATE_CHARS characters of this JSON into the prompt, so key order is a
 * priority order: everything after the cut is invisible to the model, which is
 * told to say evidence is absent rather than guess. The competency tools come
 * before the projects because they are short and are the only place the site
 * names most of the tools Rahul uses; tests/page-agent-server.test.ts fails when
 * a project no longer fits.
 */
export const buildPageState = (effects: unknown) => ({
  surface: 'continuous-field-test', effects,
  sections: Object.values(SECTION_IDS), allowedLinks: Array.from(allowedLinks),
  chapters: JOURNEY_STAGES.map((stage) => stage.id),
  apps: workstationApps.map((app) => app.id),
  experience: experienceRecords.map(({ id, role, organization, dateLabel, scope, outcomes }) => ({ id, role, organization, dateLabel, scope, outcomes })),
  competencies: coreCompetencies.map(({ title, tools }) => ({ title, tools })),
  projects: allProjects.map(({ id, title, category, description, tags, spotlight, repoUrl, liveUrl, links }) => ({ id, title, category, description, tags, spotlight, repoUrl, liveUrl, links })),
  events: fieldNotes.map(({ id, aliases, title, kind, kinds, dateLabel, summary, tags, links }) => ({ id, aliases, title, kind, kinds, dateLabel, summary, tags, links })),
  resumes: resumeProfiles.map(({ id, role, headline, keywords, pdfUrl, docxUrl }) => ({ id, role, headline, keywords, pdfUrl, docxUrl })),
});
