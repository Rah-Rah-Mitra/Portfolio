import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const vec3 = (value) => Array.isArray(value) && value.length === 3 && value.every(finite);
const orderedPair = (value, positive = false) => Array.isArray(value) && value.length === 2 && value.every(finite) && value[0] < value[1] && (!positive || value[0] > 0);
const color = (value) => value === undefined || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
const validateOptional = (shot, prefix) => {
  if (shot.roll !== undefined && !finite(shot.roll)) throw new Error(`${prefix}: roll must be finite.`);
  if (shot.focusDistance !== undefined && (!finite(shot.focusDistance) || shot.focusDistance <= 0)) throw new Error(`${prefix}: focus distance must be positive.`);
  if (shot.dollyDistance !== undefined && (!finite(shot.dollyDistance) || shot.dollyDistance <= 0)) throw new Error(`${prefix}: dolly distance must be positive.`);
  if (shot.exposure !== undefined && (!finite(shot.exposure) || shot.exposure < 0 || shot.exposure > 5)) throw new Error(`${prefix}: exposure is invalid.`);
  if (shot.lighting !== undefined) {
    const { key, fill, environment, keyColor, fillColor } = shot.lighting ?? {};
    if (![key, fill, environment].every(finite) || key < 0 || key > 20 || fill < 0 || fill > 20 || environment < 0 || environment > 5 || !color(keyColor) || !color(fillColor)) throw new Error(`${prefix}: lighting values or colors are invalid.`);
  }
  if (shot.orbitLimits !== undefined) { const orbit = object(shot.orbitLimits); if (!orbit || !orderedPair(orbit.azimuth) || !orderedPair(orbit.polar) || !orderedPair(orbit.distance, true)) throw new Error(`${prefix}: orbit limits are invalid.`); }
  if (shot.characterFraming !== undefined) { const framing = object(shot.characterFraming); if (!framing || !finite(framing.scale) || framing.scale <= 0 || !vec3(framing.offset)) throw new Error(`${prefix}: character framing is invalid.`); }
  if (shot.safeTextRegionIds !== undefined && (!Array.isArray(shot.safeTextRegionIds) || shot.safeTextRegionIds.some((id) => typeof id !== 'string' || !id.trim()))) throw new Error(`${prefix}: safe text region IDs are invalid.`);
};
export const validateCameraShot = (shot, context = 'shot') => {
  if (!shot || typeof shot !== 'object' || typeof shot.id !== 'string' || !shot.id.trim() || typeof shot.chapterId !== 'string' || !shot.chapterId.trim()) throw new Error(`${context}: id and chapterId are required.`);
  if (!vec3(shot.position)) throw new Error(`${shot.id}: position must be a finite vec3.`);
  if (!vec3(shot.target)) throw new Error(`${shot.id}: target must be a finite vec3.`);
  if (!finite(shot.fov) || shot.fov <= 5 || shot.fov >= 120) throw new Error(`${shot.id}: invalid FOV.`);
  if (!finite(shot.near) || !finite(shot.far) || shot.near <= 0 || shot.far <= shot.near) throw new Error(`${shot.id}: invalid clipping planes.`);
  if (!Array.isArray(shot.scrollRange) || shot.scrollRange.length !== 2 || !shot.scrollRange.every(finite) || shot.scrollRange[0] < 0 || shot.scrollRange[1] > 1 || shot.scrollRange[0] >= shot.scrollRange[1]) throw new Error(`${shot.id}: invalid scroll range ordering.`);
  if (!finite(shot.transition?.duration) || shot.transition.duration < 0 || shot.transition.duration > .45) throw new Error(`${shot.id}: transition must be <= 0.45s.`);
  if (typeof shot.transition.easing !== 'string' || !shot.transition.easing.trim()) throw new Error(`${shot.id}: easing is required.`);
  validateOptional(shot, shot.id);
  const responsive = shot.responsive === undefined ? {} : object(shot.responsive);
  if (!responsive) throw new Error(`${shot.id}: responsive override is invalid.`);
  for (const [tier, override] of Object.entries(responsive)) {
    if (!['mobile', 'tablet'].includes(tier) || !object(override)) throw new Error(`${shot.id}: responsive override is invalid.`);
    if (['id', 'chapterId', 'responsive'].some((key) => key in override)) throw new Error(`${shot.id}: responsive identity is invalid.`);
    if ('position' in override && !vec3(override.position)) throw new Error(`${shot.id}: responsive position is invalid.`);
    if ('target' in override && !vec3(override.target)) throw new Error(`${shot.id}: responsive target is invalid.`);
    if ('fov' in override && (!finite(override.fov) || override.fov <= 5 || override.fov >= 120)) throw new Error(`${shot.id}: responsive FOV is invalid.`);
    const near = override.near ?? shot.near; const far = override.far ?? shot.far;
    if (!finite(near) || !finite(far) || near <= 0 || far <= near) throw new Error(`${shot.id}: responsive clipping planes are invalid.`);
    if ('scrollRange' in override && (!Array.isArray(override.scrollRange) || override.scrollRange.length !== 2 || !override.scrollRange.every(finite) || override.scrollRange[0] < 0 || override.scrollRange[1] > 1 || override.scrollRange[0] >= override.scrollRange[1])) throw new Error(`${shot.id}: responsive scroll range is invalid.`);
    if ('transition' in override && (!finite(override.transition?.duration) || override.transition.duration < 0 || override.transition.duration > .45 || typeof override.transition.easing !== 'string' || !override.transition.easing.trim())) throw new Error(`${shot.id}: responsive transition is invalid.`);
    try { validateOptional({ ...shot, ...override }, `${shot.id}: responsive ${tier}`); } catch (error) { throw new Error(`${shot.id}: responsive ${tier} is invalid: ${error.message}`); }
  }
  return shot;
};

export const mergeCameraShots = (existing, incoming) => {
  const replacements = new Map(incoming.map((shot) => [validateCameraShot(shot).id, shot]));
  const merged = existing.map((shot) => replacements.get(validateCameraShot(shot).id) ?? shot);
  existing.forEach((shot) => replacements.delete(shot.id));
  return [...merged, ...replacements.values()];
};

export const mergeCameraShotFile = async (inputPath, manifestPath) => {
  const [incomingRaw, existingRaw] = await Promise.all([readFile(inputPath, 'utf8'), readFile(manifestPath, 'utf8')]);
  const value = JSON.parse(incomingRaw); const incoming = Array.isArray(value) ? value : [value];
  const merged = mergeCameraShots(JSON.parse(existingRaw), incoming);
  await writeFile(manifestPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return merged;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [inputPath, manifestPath = fileURLToPath(new URL('../../world/narrativeManifest.json', import.meta.url))] = process.argv.slice(2);
  if (!inputPath) throw new Error('Usage: node scripts/camera/validate-merge-shots.mjs <input.json> [world/narrativeManifest.json]');
  const merged = await mergeCameraShotFile(inputPath, manifestPath);
  console.log(`Validated and merged ${merged.length} repository camera shot(s) -> ${manifestPath}`);
}
