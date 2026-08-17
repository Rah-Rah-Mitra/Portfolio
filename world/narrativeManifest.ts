import type { CameraShotDefinition, WorldAnchorDefinition } from '../types';
import shotData from './narrativeManifest.json';

export const cameraShots = shotData as unknown as CameraShotDefinition[];

const safeTextByChapter: Record<string, string[]> = {
  home: ['portfolio-title'], work: ['selected-work-title'], experience: ['experience-title'],
  'all-work': ['all-projects-title'], 'technical-lab': ['technical-lab-copy'], domains: ['capabilities-title'],
  proof: ['proof-title'], contact: ['departure-iris-title'],
};

export const worldAnchorDefinitions: WorldAnchorDefinition[] = cameraShots.map((shot, index) => ({
  id: `anchor-${shot.chapterId}`,
  elementId: shot.chapterId,
  chapterId: shot.chapterId,
  worldOffset: [index % 2 ? 0.35 : -0.35, 0, 0],
  projectionDepth: 6,
  worldNormal: [0, 0, 1],
  occluderElementIds: safeTextByChapter[shot.chapterId] ?? [],
  responsive: { mobile: { worldOffset: [0, -0.4, 0], projectionDepth: 8 } },
}));

export const validateCameraShotDefinitions = (shots: readonly CameraShotDefinition[]) => {
  const issues: string[] = [];
  const ids = new Set<string>();
  shots.forEach((shot) => {
    if (ids.has(shot.id)) issues.push(`${shot.id} is duplicated`);
    ids.add(shot.id);
    if (![...shot.position, ...shot.target].every(Number.isFinite)) issues.push(`${shot.id} vectors are invalid`);
    if (!Number.isFinite(shot.near) || !Number.isFinite(shot.far) || shot.near <= 0 || shot.far <= shot.near) issues.push(`${shot.id} clipping planes are invalid`);
    if (!Number.isFinite(shot.fov) || shot.fov <= 5 || shot.fov >= 120) issues.push(`${shot.id} FOV is invalid`);
    if (!shot.scrollRange.every(Number.isFinite) || shot.scrollRange[0] < 0 || shot.scrollRange[1] > 1 || shot.scrollRange[0] >= shot.scrollRange[1]) issues.push(`${shot.id} scroll range is invalid`);
    if (!Number.isFinite(shot.transition.duration) || shot.transition.duration > 0.45 || shot.transition.duration < 0 || !shot.transition.easing.trim()) issues.push(`${shot.id} transition must be valid and 0–0.45s`);
    Object.values(shot.responsive ?? {}).forEach((override) => {
      const near = override.near ?? shot.near; const far = override.far ?? shot.far;
      const invalidRange = override.scrollRange && (!override.scrollRange.every(Number.isFinite) || override.scrollRange[0] < 0 || override.scrollRange[1] > 1 || override.scrollRange[0] >= override.scrollRange[1]);
      const invalidTransition = override.transition && (!Number.isFinite(override.transition.duration) || override.transition.duration < 0 || override.transition.duration > .45 || !override.transition.easing.trim());
      if ((override.position && !override.position.every(Number.isFinite)) || (override.target && !override.target.every(Number.isFinite)) || (override.fov !== undefined && (!Number.isFinite(override.fov) || override.fov <= 5 || override.fov >= 120)) || !Number.isFinite(near) || !Number.isFinite(far) || near <= 0 || far <= near || invalidRange || invalidTransition) issues.push(`${shot.id} responsive override is invalid`);
    });
  });
  return { valid: issues.length === 0, issues };
};
