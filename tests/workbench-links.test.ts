import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ArchiveWindow, WorkWindow, WorldWindow } from '../components/workbench/WorkbenchWindows';
import { archiveRows, featuredCards, projectLinks } from '../lib/workbench';
import { allProjects } from '../portfolioData';
import { ESTATE_CATALOGUE } from '../lib/estate/catalogue.generated';

// Static markup, no DOM: these are what the prerendered page shows before JS.
const markup = (component: React.FC) => renderToStaticMarkup(createElement(component));
const listFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : Promise.resolve(/\.(?:tsx?|css|glsl)$/.test(entry.name) ? [full] : []);
  }));
  return nested.flat();
};
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

describe('Estate window', () => {
  it('keeps the #world anchor and describes the generated estate as text, with no canvas', () => {
    const html = markup(WorldWindow);
    expect(html).toContain('id="world"');
    expect(html).toContain('data-estate-phase="poster"');
    expect(html).toMatch(/generated Singapore HDB neighbourhood/);
    expect(html).toMatch(/not a real town/);
    const img = html.match(/<img [^>]*>/)?.[0] ?? '';
    expect(img).toMatch(/alt="[^"]+"/);
    expect(img).toContain(`src="${ESTATE_CATALOGUE.poster.src}"`);
    expect(img).toContain('loading="lazy"');
    for (const site of ESTATE_CATALOGUE.sites) expect(html, site.id).toContain(`>${site.name}<`);
    expect(html.match(/data-estate-site="/g)).toHaveLength(14);
    expect(html).toContain('id="estate-keys"');
    expect(html).not.toContain('<canvas');
    // The stage is a figure, not a control, until the viewer is live.
    expect(html).not.toMatch(/role="application"|tabindex="0"[^>]*data-estate-stage/);
    expect(html).not.toMatch(/CSS figure|no 3D engine|CSS drawing/i);
    expect(html).not.toMatch(/Three\.js|Optical Courier|renders on demand|optical test bench|LIVE ACCENT/i);
    // The no-JS evidence counts and FieldWorkbench's routing key on these prefixes.
    expect(html).not.toMatch(/id="(experience|project|selected)-/);
  });

  it('points at the spatial builds, the Camera Lab, the pipeline and the licence through real links', () => {
    const hrefs = hrefsOf(markup(WorldWindow));
    const spatial = archiveRows.filter((row) => row.domain === '3D / Vision').map((row) => `#project-${row.id}`);
    expect(spatial.length).toBeGreaterThan(0);
    expect(hrefs).toEqual([...spatial, '#technical-lab', 'https://github.com/Rah-Rah-Mitra/Bonsai-Estate', '/estate/LICENSE.txt']);
  });

  it('labels a fork under BUILDS as a fork, not as Rahul’s own library', () => {
    const html = markup(WorldWindow);
    const forks = archiveRows.filter((row) => row.domain === '3D / Vision' && /\bfork\b/i.test(row.category));
    expect(forks.map((row) => row.id)).toContain('kalidokit-fork');
    for (const row of forks) expect(html).toContain(`>${row.title} (fork)</a>`);
    expect(html).not.toMatch(/OnTheSpectrum \(fork\)/);
  });

  it('carries no hard-coded colour anywhere in the estate tree', async () => {
    // Engine, HUD and shell alike: every colour is a design token (plan §7.3).
    const files = await listFiles('components/workbench/estate');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      expect(text, file).not.toMatch(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{1,5})?\b/);
    }
    expect(markup(WorldWindow)).not.toMatch(/(fill|stroke|style)="[^"]*#[0-9a-fA-F]{3,8}\b/);
  });

  it('renders identically twice (stable hydration)', () => {
    const render = () => renderToString(createElement(WorldWindow));
    expect(render()).toBe(render());
  });
});
