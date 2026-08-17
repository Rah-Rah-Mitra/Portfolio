import { describe, expect, it } from 'vitest';
import { allProjects, experienceRecords, projectArchive, projectHighlights, unifiedPortfolioData } from '../portfolioData';
import { guideChapters } from '../fieldTestData';

describe('unified portfolio record', () => {
  it('contains every unique current and archived project', () => {
    const sourceIds = new Set([...projectHighlights, ...projectArchive].map((project) => project.id));
    expect(new Set(allProjects.map((project) => project.id))).toEqual(sourceIds);
    expect(allProjects).toHaveLength(sourceIds.size);
    expect(unifiedPortfolioData.projects).toBe(allProjects);
  });

  it('keeps experience ordered and conventionally complete', () => {
    expect(experienceRecords.length).toBeGreaterThanOrEqual(5);
    expect(experienceRecords.every((record) => (
      record.role && record.organization && record.location && record.dateLabel
      && record.scope && record.responsibilities.length > 0
    ))).toBe(true);
    expect(experienceRecords.map((record) => record.sortDate)).toEqual(
      [...experienceRecords].sort((a, b) => b.sortDate.localeCompare(a.sortDate)).map((record) => record.sortDate),
    );
    expect(experienceRecords[0].organization).toBe('Abbott');
  });

  it('provides one monotonic guide cue for every evidence chapter', () => {
    expect(guideChapters[0].sectionId).toBe('home');
    expect(guideChapters.at(-1)?.sectionId).toBe('contact');
    expect(new Set(guideChapters.map((chapter) => chapter.sectionId)).size).toBe(guideChapters.length);
    expect(guideChapters.every((chapter, index) => index === 0 || chapter.pathProgress > guideChapters[index - 1].pathProgress)).toBe(true);
  });
});
