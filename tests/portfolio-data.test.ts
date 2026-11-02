import { describe, expect, it } from 'vitest';
import { snapshotExperience } from '../lib/portfolioSnapshot';
import { allProjects, experienceRecords, projectArchive, projectHighlights, unifiedPortfolioData } from '../portfolioData';

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
      record.role && record.organization && record.location && record.dateLabel && record.scope
    ))).toBe(true);
    // Responsibilities live outside the main bundle (lib/experienceResponsibilities.ts)
    // and join the records only in the MCP snapshot, which throws on a record
    // that has none, so a new record cannot ship to list_experience without them.
    expect(snapshotExperience().every((record) => record.responsibilities.length > 0)).toBe(true);
    expect(snapshotExperience().map((record) => record.id)).toEqual(experienceRecords.map((record) => record.id));
    expect(experienceRecords.map((record) => record.sortDate)).toEqual(
      [...experienceRecords].sort((a, b) => b.sortDate.localeCompare(a.sortDate)).map((record) => record.sortDate),
    );
    // The incoming A*STAR attachment starts in Jan 2027, so it sorts first.
    expect(experienceRecords[0].organization).toBe('A*STAR');
    expect(experienceRecords[1].organization).toBe('STMicroelectronics (NUS Capstone)');
  });
});
