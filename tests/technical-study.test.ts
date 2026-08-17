import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { technicalDemo } from '../fieldTestData';

describe('synthetic calibration study', () => {
  const study = JSON.parse(readFileSync(new URL('../public/lab/study.json', import.meta.url), 'utf8'));

  it('ships measured deterministic outputs and provenance', () => {
    expect(study.frameCount).toBeGreaterThanOrEqual(12);
    expect(study.trackedKeypoints).toBeGreaterThan(0);
    expect(study.poseInliers).toBeGreaterThan(0);
    expect(study.medianReprojectionPx).toBeGreaterThanOrEqual(0);
    expect(study.trajectoryErrorPercent).toBeGreaterThan(0);
    expect(study.knownTrajectory).toHaveLength(study.frameCount);
    expect(study.estimatedTrajectory).toHaveLength(study.frameCount);
  });

  it('states that the study is not professional work', () => {
    expect(technicalDemo.disclaimer).toContain('not a professional project claim');
    expect(technicalDemo.provenance).toContain('monocular scale');
  });
});
