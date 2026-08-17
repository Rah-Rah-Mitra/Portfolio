import type { CameraShotDefinition, WorldAnchorDefinition } from '../types';

export const cameraShots: CameraShotDefinition[] = [
  { id: 'overview', chapterId: 'home', position: [0, 1.8, 8], target: [0, 1, 0], fov: 38, near: 0.1, far: 80, focusDistance: 8, exposure: 1, scrollRange: [0, 0.12], transition: { duration: 0.42, easing: 'power2.out' } },
  { id: 'selected-work', chapterId: 'work', position: [-2.4, 2.2, 7], target: [0, 0.8, 0], fov: 42, near: 0.1, far: 80, focusDistance: 7, exposure: 1, scrollRange: [0.1, 0.3], transition: { duration: 0.36, easing: 'power2.out' } },
  { id: 'experience', chapterId: 'experience', position: [2.1, 1.5, 7.4], target: [0, 1, 0], fov: 40, near: 0.1, far: 80, focusDistance: 7.4, exposure: 1, scrollRange: [0.28, 0.43], transition: { duration: 0.34, easing: 'power2.out' } },
  { id: 'projects', chapterId: 'all-work', position: [0, 3.2, 8.6], target: [0, 0.4, 0], fov: 44, near: 0.1, far: 80, focusDistance: 8.6, exposure: 1, scrollRange: [0.41, 0.6], transition: { duration: 0.4, easing: 'power2.out' } },
  { id: 'camera-lab', chapterId: 'technical-lab', position: [-3.1, 1.2, 6.5], target: [0, 0.85, 0], fov: 36, near: 0.1, far: 80, focusDistance: 6.5, exposure: 1.05, scrollRange: [0.58, 0.76], transition: { duration: 0.42, easing: 'power2.out' }, responsive: { mobile: { position: [0, 2.6, 9], fov: 48 } } },
  { id: 'capabilities', chapterId: 'domains', position: [2.8, 2, 7.3], target: [0, 0.7, 0], fov: 41, near: 0.1, far: 80, focusDistance: 7.3, exposure: 1, scrollRange: [0.74, 0.84], transition: { duration: 0.34, easing: 'power2.out' } },
  { id: 'proof', chapterId: 'proof', position: [-1.5, 2.6, 8], target: [0, 0.9, 0], fov: 43, near: 0.1, far: 80, focusDistance: 8, exposure: 1, scrollRange: [0.82, 0.92], transition: { duration: 0.32, easing: 'power2.out' } },
  { id: 'departure', chapterId: 'contact', position: [0, 1.1, 6.2], target: [0, 1, 0], fov: 34, near: 0.1, far: 80, focusDistance: 6.2, exposure: 1, scrollRange: [0.9, 1], transition: { duration: 0.42, easing: 'power2.out' } },
];

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
    if (shot.near <= 0 || shot.far <= shot.near) issues.push(`${shot.id} clipping planes are invalid`);
    if (shot.fov <= 5 || shot.fov >= 120) issues.push(`${shot.id} FOV is invalid`);
    if (shot.scrollRange[0] < 0 || shot.scrollRange[1] > 1 || shot.scrollRange[0] >= shot.scrollRange[1]) issues.push(`${shot.id} scroll range is invalid`);
    if (shot.transition.duration > 0.45 || shot.transition.duration < 0) issues.push(`${shot.id} transition must be 0–0.45s`);
  });
  return { valid: issues.length === 0, issues };
};
