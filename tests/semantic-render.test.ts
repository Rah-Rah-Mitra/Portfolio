import { describe, expect, it } from 'vitest';
import { allProjects, experienceRecords } from '../portfolioData';
import { renderSemanticPortfolio } from '../semanticRender';

describe('deterministic semantic prerender', () => {
  it('renders the recruiter evidence without browser-only APIs', () => {
    const markup = renderSemanticPortfolio();

    expect(markup).toContain('Rahul Mitra');
    expect(markup).toContain('Intelligent systems, made operational.');
    expect(experienceRecords).toHaveLength(5);
    experienceRecords.forEach((record) => expect(markup).toContain(`experience-${record.id}`));
    expect(allProjects).toHaveLength(28);
    allProjects.forEach((project) => expect(markup).toContain(`project-${project.id}`));
    expect(markup).toContain('Download résumé');
    expect(markup).toContain(`mailto:`);
    expect(markup).toContain('LinkedIn');
    expect(markup).not.toContain('<video');
    expect(markup).not.toMatch(/Build lens|Secure lens|switchProfile|data-lens=/i);
  });
});
