import { describe, expect, it } from 'vitest';
import { allProjects, experienceRecords } from '../portfolioData';
import { renderSemanticPortfolio } from '../semanticRender';
import { ESTATE_CATALOGUE } from '../lib/estate/catalogue.generated';

describe('deterministic semantic prerender', () => {
  it('renders the recruiter evidence without browser-only APIs', () => {
    const markup = renderSemanticPortfolio();

    expect(markup).toContain('Rahul Mitra');
    expect(markup).toContain('Intelligent systems, made operational.');
    // Ten, not seven: People's Association was missing from the site entirely
    // (it existed only as a project card and an event note, and events are
    // filtered out of experienceNotes), the two Abbott roles were one merged
    // record where the résumés carry two, and NTUC Health, on every résumé, had
    // no record until Oct 2026.
    expect(experienceRecords).toHaveLength(10);
    experienceRecords.forEach((record) => expect(markup).toContain(`experience-${record.id}`));
    expect(allProjects).toHaveLength(29);
    allProjects.forEach((project) => expect(markup).toContain(`project-${project.id}`));
    expect(markup).toContain('Download résumé');
    expect(markup).toContain(`mailto:`);
    expect(markup).toContain('LinkedIn');
    expect(markup).not.toContain('<video');
    expect(markup).not.toMatch(/Build lens|Secure lens|switchProfile|data-lens=/i);
  });

  it('prerenders the Estate window as text: its facts, all 14 buildings and the key list', () => {
    const markup = renderSemanticPortfolio();
    expect(markup).toContain('Sample Town N5');
    for (const site of ESTATE_CATALOGUE.sites) expect(markup, site.id).toContain(site.name);
    expect(markup).toContain('id="estate-keys"');
    expect(markup).toContain('data-estate-phase="poster"');
    // The engine is a lazy chunk: nothing of it, and no canvas, is in the document.
    expect(markup).not.toMatch(/<canvas[^>]*data-estate|data-estate-draws/);
  });
});
