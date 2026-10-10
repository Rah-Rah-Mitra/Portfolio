import { JOURNEY_STAGES, SECTION_IDS } from '../constants';
import { allProjects, coreCompetencies, experienceRecords, fieldNotes, resumeProfiles } from '../portfolioData';
import type { BackdropSettings } from './backdropSettings';
import { workstationApps } from './workstation';

// Every href the assistant may cite. AskThePage drops any reference outside it,
// and the page state hands the same list to the model. The in-page anchors are
// the workbench windows' own, plus #contact inside Résumés & Contact, so a
// reference can only name a place that exists.
export const allowedLinks = new Set([
  ...workstationApps.map((app) => app.fallbackAnchor),
  `#${SECTION_IDS.CONTACT}`,
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
 * a project no longer fits. What the labs and the FX panel are is not here: the
 * server states that itself (SITE_EXHIBITS), where a browser cannot rewrite it.
 * `surface` is which one asked: on 'field-index' (the ≤880px phone registry)
 * the labs and the Estate are not there, and SITE_EXHIBITS tells the model so.
 */
export type AssistantSurface = 'field-workbench' | 'field-index';
export const buildPageState = (settings: BackdropSettings, surface: AssistantSurface = 'field-workbench') => ({
  surface,
  // Only whether each FX desk background is on. Their engine parameters are not
  // evidence of anything and would spend the budget the projects need.
  backdrops: { nbody: settings.nbody.enabled, fluid: settings.fluid.enabled, drawing: settings.drawing.enabled },
  allowedLinks: Array.from(allowedLinks),
  chapters: JOURNEY_STAGES.map((stage) => stage.id),
  apps: workstationApps.map((app) => app.id),
  experience: experienceRecords.map(({ id, role, organization, dateLabel, scope, outcomes }) => ({ id, role, organization, dateLabel, scope, outcomes })),
  competencies: coreCompetencies.map(({ title, tools }) => ({ title, tools })),
  projects: allProjects.map(({ id, title, category, description, tags, spotlight, repoUrl, liveUrl, links }) => ({ id, title, category, description, tags, spotlight, repoUrl, liveUrl, links })),
  events: fieldNotes.map(({ id, aliases, title, kind, kinds, dateLabel, summary, tags, links }) => ({ id, aliases, title, kind, kinds, dateLabel, summary, tags, links })),
  resumes: resumeProfiles.map(({ id, role, headline, keywords, pdfUrl, docxUrl }) => ({ id, role, headline, keywords, pdfUrl, docxUrl })),
});
