import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ArchiveWindow, WorkWindow, WorldWindow } from '../components/workbench/WorkbenchWindows';
import { archiveRows, featuredCards, projectLinks } from '../lib/workbench';
import { allProjects } from '../portfolioData';

// Static markup, no DOM: these are what the prerendered page shows before JS.
const markup = (component: React.FC) => renderToStaticMarkup(createElement(component));
const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, '&'));

describe('project links on the workbench', () => {
  it('gives every archive row every public link its project has, primary first', () => {
    for (const project of allProjects) {
      const row = archiveRows.find((candidate) => candidate.id === project.id);
      const carried = [row?.href, ...(row?.links ?? []).map((link) => link.href)].filter(Boolean);
      expect(carried, project.id).toEqual(projectLinks(project).map((link) => link.href));
    }
    // The four that used to be reachable only through the assistant.
    expect(archiveRows.find((row) => row.id === 'arcane')?.links?.map((link) => link.label)).toEqual(['Arcane-PP', 'Arcane-GLM', 'Arcane-OCR']);
    expect(archiveRows.find((row) => row.id === 'maritime-deficiency-severity')?.links?.map((link) => link.label)).toEqual(['Certificate of submission']);
  });

  it('renders them on the Selected Work cards and the archive rows', () => {
    const work = hrefsOf(markup(WorkWindow));
    for (const { project } of featuredCards) {
      for (const link of projectLinks(project)) expect(work, project.id).toContain(link.href);
    }
    const archiveHtml = markup(ArchiveWindow);
    const archive = hrefsOf(archiveHtml);
    for (const project of allProjects) {
      for (const link of projectLinks(project)) expect(archive, project.id).toContain(link.href);
    }
    // tests/e2e/quality.spec.ts pins the no-JS evidence count; links add no rows.
    expect(archiveHtml.match(/id="project-/g)).toHaveLength(allProjects.length);
  });
});

describe('World window', () => {
  it('keeps the #world anchor and says it is a drawing, not a 3D scene', () => {
    const html = markup(WorldWindow);
    expect(html).toContain('id="world"');
    expect(html).toMatch(/CSS figure with no 3D engine/);
    expect(html).not.toMatch(/Three\.js|Optical Courier|renders on demand|optical test bench|LIVE ACCENT/i);
  });

  it('points at the spatial builds and the Camera Lab through real in-page anchors', () => {
    const hrefs = hrefsOf(markup(WorldWindow));
    const spatial = archiveRows.filter((row) => row.domain === '3D / Vision').map((row) => `#project-${row.id}`);
    expect(spatial.length).toBeGreaterThan(0);
    expect(hrefs).toEqual([...spatial, '#technical-lab']);
  });

  it('labels a fork under BUILDS as a fork, not as Rahul’s own library', () => {
    const html = markup(WorldWindow);
    const forks = archiveRows.filter((row) => row.domain === '3D / Vision' && /\bfork\b/i.test(row.category));
    expect(forks.map((row) => row.id)).toContain('kalidokit-fork');
    for (const row of forks) expect(html).toContain(`>${row.title} (fork)</a>`);
    expect(html).not.toMatch(/OnTheSpectrum \(fork\)/);
  });
});
