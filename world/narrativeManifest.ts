import type { CameraShotDefinition, InteractionBounds, WorldAnchorDefinition } from '../types';
import shotData from './narrativeManifest.json';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const vec3 = (value: unknown): value is [number, number, number] => Array.isArray(value) && value.length === 3 && value.every(finite);
const orderedPair = (value: unknown, positive = false): value is [number, number] => Array.isArray(value) && value.length === 2 && value.every(finite) && value[0] < value[1] && (!positive || value[0] > 0);
const color = (value: unknown) => value === undefined || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const bounds = (value: unknown): value is InteractionBounds => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<InteractionBounds>;
  return [candidate.left, candidate.top, candidate.right, candidate.bottom].every(finite)
    && candidate.right! > candidate.left! && candidate.bottom! > candidate.top!;
};

const optionalIssues = (shot: Partial<CameraShotDefinition>, prefix: string) => {
  const issues: string[] = [];
  if (shot.roll !== undefined && !finite(shot.roll)) issues.push(`${prefix} roll is invalid`);
  if (shot.focusDistance !== undefined && (!finite(shot.focusDistance) || shot.focusDistance <= 0)) issues.push(`${prefix} focus distance is invalid`);
  if (shot.dollyDistance !== undefined && (!finite(shot.dollyDistance) || shot.dollyDistance <= 0)) issues.push(`${prefix} dolly distance is invalid`);
  if (shot.exposure !== undefined && (!finite(shot.exposure) || shot.exposure < 0 || shot.exposure > 5)) issues.push(`${prefix} exposure is invalid`);
  if (shot.lighting !== undefined) {
    const lighting = object(shot.lighting);
    if (!lighting || ![lighting.key, lighting.fill, lighting.environment].every(finite) || !finite(lighting.key) || lighting.key < 0 || lighting.key > 20 || !finite(lighting.fill) || lighting.fill < 0 || lighting.fill > 20 || !finite(lighting.environment) || lighting.environment < 0 || lighting.environment > 5 || !color(lighting.keyColor) || !color(lighting.fillColor)) issues.push(`${prefix} lighting is invalid`);
  }
  if (shot.orbitLimits !== undefined) { const orbit = object(shot.orbitLimits); if (!orbit || !orderedPair(orbit.azimuth) || !orderedPair(orbit.polar) || !orderedPair(orbit.distance, true)) issues.push(`${prefix} orbit limits are invalid`); }
  if (shot.characterFraming !== undefined) { const framing = object(shot.characterFraming); if (!framing || !finite(framing.scale) || framing.scale <= 0 || !vec3(framing.offset)) issues.push(`${prefix} character framing is invalid`); }
  if (shot.safeTextRegionIds !== undefined && (!Array.isArray(shot.safeTextRegionIds) || shot.safeTextRegionIds.some((id) => typeof id !== 'string' || !id.trim()))) issues.push(`${prefix} safe text IDs are invalid`);
  return issues;
};

export const validateCameraShotDefinitions = (shots: readonly CameraShotDefinition[]) => {
  const issues: string[] = [];
  const ids = new Set<string>();
  shots.forEach((shot) => {
    if (!shot || typeof shot !== 'object' || typeof shot.id !== 'string' || !shot.id.trim() || typeof shot.chapterId !== 'string' || !shot.chapterId.trim()) { issues.push('shot id and chapter are required'); return; }
    if (ids.has(shot.id)) issues.push(`${shot.id} is duplicated`); ids.add(shot.id);
    if (!vec3(shot.position) || !vec3(shot.target)) issues.push(`${shot.id} vectors are invalid`);
    if (!finite(shot.near) || !finite(shot.far) || shot.near <= 0 || shot.far <= shot.near) issues.push(`${shot.id} clipping planes are invalid`);
    if (!finite(shot.fov) || shot.fov <= 5 || shot.fov >= 120) issues.push(`${shot.id} FOV is invalid`);
    if (!orderedPair(shot.scrollRange) || shot.scrollRange[0] < 0 || shot.scrollRange[1] > 1) issues.push(`${shot.id} scroll range is invalid`);
    if (!shot.transition || !finite(shot.transition.duration) || shot.transition.duration > 0.45 || shot.transition.duration < 0 || typeof shot.transition.easing !== 'string' || !shot.transition.easing.trim()) issues.push(`${shot.id} transition must be valid and 0–0.45s`);
    issues.push(...optionalIssues(shot, shot.id));
    const responsive = shot.responsive === undefined ? {} : object(shot.responsive);
    if (!responsive) issues.push(`${shot.id} responsive override is invalid`);
    Object.entries(responsive ?? {}).forEach(([tier, overrideValue]) => {
      const override = object(overrideValue);
      if (!['tablet', 'mobile'].includes(tier) || !override) { issues.push(`${shot.id} responsive override is invalid`); return; }
      if (['id', 'chapterId', 'responsive'].some((key) => key in override)) { issues.push(`${shot.id} responsive identity is invalid`); return; }
      const merged = { ...shot, ...override } as CameraShotDefinition;
      if (override.position !== undefined && !vec3(override.position)) issues.push(`${shot.id} responsive position is invalid`);
      if (override.target !== undefined && !vec3(override.target)) issues.push(`${shot.id} responsive target is invalid`);
      if (!finite(merged.near) || !finite(merged.far) || merged.near <= 0 || merged.far <= merged.near) issues.push(`${shot.id} responsive clipping is invalid`);
      if (!finite(merged.fov) || merged.fov <= 5 || merged.fov >= 120) issues.push(`${shot.id} responsive FOV is invalid`);
      if (!orderedPair(merged.scrollRange) || merged.scrollRange[0] < 0 || merged.scrollRange[1] > 1) issues.push(`${shot.id} responsive scroll range is invalid`);
      if (!merged.transition || !finite(merged.transition.duration) || merged.transition.duration < 0 || merged.transition.duration > .45 || typeof merged.transition.easing !== 'string' || !merged.transition.easing.trim()) issues.push(`${shot.id} responsive transition is invalid`);
      issues.push(...optionalIssues(merged, `${shot.id} responsive ${tier}`));
    });
  });
  return { valid: issues.length === 0, issues };
};

export const parseCameraShotDefinitions = (value: unknown): CameraShotDefinition[] => {
  if (!Array.isArray(value)) throw new Error('Camera shot manifest must be an array.');
  const shots = value as CameraShotDefinition[];
  const result = validateCameraShotDefinitions(shots);
  if (!result.valid) throw new Error(`Invalid camera shot manifest: ${result.issues.join('; ')}`);
  return shots;
};

export const cameraShots = parseCameraShotDefinitions(shotData);

const safeTextByChapter: Record<string, string[]> = {
  home: ['portfolio-title'], work: ['selected-work-title'], experience: ['experience-title'],
  'all-work': ['all-projects-title'], 'technical-lab': ['technical-lab-copy'], domains: ['capabilities-title'],
  proof: ['proof-title'], contact: ['departure-iris-title'],
};

const authoredAnchors: WorldAnchorDefinition[] = cameraShots.map((shot, index) => ({
  id: `anchor-${shot.chapterId}`,
  elementId: shot.chapterId,
  chapterId: shot.chapterId,
  worldOffset: [index % 2 ? 0.35 : -0.35, 0, 0],
  projectionDepth: 6,
  worldNormal: [0, 0, 1],
  occluderElementIds: safeTextByChapter[shot.chapterId] ?? [],
  responsive: { mobile: { worldOffset: [0, -0.4, 0], projectionDepth: 8 } },
}));

export const validateWorldAnchorDefinitions = (value: unknown) => {
  const issues: string[] = [];
  if (!Array.isArray(value)) return { valid: false, issues: ['World anchors must be an array'] };
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') { issues.push(`anchor ${index} is invalid`); return; }
    const anchor = raw as WorldAnchorDefinition;
    if (![anchor.id, anchor.elementId, anchor.chapterId].every((item) => typeof item === 'string' && item.trim())) issues.push(`anchor ${index} IDs are invalid`);
    if (!vec3(anchor.worldOffset) || !vec3(anchor.worldNormal) || !anchor.worldNormal.some((axis) => axis !== 0)) issues.push(`${anchor.id} vectors are invalid`);
    if (!finite(anchor.projectionDepth) || anchor.projectionDepth <= 0) issues.push(`${anchor.id} projection depth is invalid`);
    if (anchor.interactionBounds !== undefined && !bounds(anchor.interactionBounds)) issues.push(`${anchor.id} interaction bounds are invalid`);
    if (anchor.occluderElementIds !== undefined && (!Array.isArray(anchor.occluderElementIds) || anchor.occluderElementIds.some((id) => typeof id !== 'string' || !id.trim()))) issues.push(`${anchor.id} occluder IDs are invalid`);
    const responsive = anchor.responsive === undefined ? {} : object(anchor.responsive);
    if (!responsive) issues.push(`${anchor.id} responsive override is invalid`);
    Object.entries(responsive ?? {}).forEach(([tier, overrideValue]) => {
      const override = object(overrideValue);
      if (!['tablet', 'mobile'].includes(tier) || !override) { issues.push(`${anchor.id} responsive override is invalid`); return; }
      if (override.worldOffset !== undefined && !vec3(override.worldOffset)) issues.push(`${anchor.id} responsive world offset is invalid`);
      if (override.worldNormal !== undefined && (!vec3(override.worldNormal) || !override.worldNormal.some((axis) => axis !== 0))) issues.push(`${anchor.id} responsive normal is invalid`);
      if (override.projectionDepth !== undefined && (!finite(override.projectionDepth) || override.projectionDepth <= 0)) issues.push(`${anchor.id} responsive depth is invalid`);
      if (override.interactionBounds !== undefined && !bounds(override.interactionBounds)) issues.push(`${anchor.id} responsive bounds are invalid`);
    });
  });
  return { valid: issues.length === 0, issues };
};

const anchorValidation = validateWorldAnchorDefinitions(authoredAnchors);
if (!anchorValidation.valid) throw new Error(`Invalid world anchor manifest: ${anchorValidation.issues.join('; ')}`);
export const worldAnchorDefinitions = authoredAnchors;
