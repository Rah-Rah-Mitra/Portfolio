type ValidationResult = { valid: boolean; issues: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSha256 = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isNonEmpty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export const validateCourierManifest = (value: unknown): ValidationResult => {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ['manifest must be an object'] };
  if (value.status !== 'pre-rig-ready' && value.status !== 'production-ready') issues.push('status must describe a truthful ready checkpoint');
  if (!isNonEmpty(value.positivePrompt)) issues.push('positivePrompt is required');
  if (!isNonEmpty(value.negativePrompt)) issues.push('negativePrompt is required');

  const models = Array.isArray(value.models) ? value.models : [];
  if (models.length < 4) issues.push('Z-Image, text encoder, BiRefNet, and Hunyuan3D provenance are required');
  models.forEach((model, index) => {
    if (!isRecord(model) || !isNonEmpty(model.filename) || !isSha256(model.sha256) || !isNonEmpty(model.source) || !isNonEmpty(model.license)) {
      issues.push(`model ${index} is missing filename/hash/source/license provenance`);
    }
  });

  const generations = Array.isArray(value.generations) ? value.generations : [];
  if (generations.length < 3) issues.push('at least three candidate generations are required');
  const seeds = new Set<number>();
  generations.forEach((generation, index) => {
    if (!isRecord(generation) || !Number.isSafeInteger(generation.seed) || !isNonEmpty(generation.promptId) || !isNonEmpty(generation.id)) {
      issues.push(`generation ${index} is missing fixed-seed execution provenance`);
      return;
    }
    seeds.add(generation.seed as number);
    if (!isRecord(generation.review) || typeof generation.review.approved !== 'boolean' || !Array.isArray(generation.review.forbiddenPropsObserved)) {
      issues.push(`generation ${index} is missing visual review`);
    }
  });
  if (seeds.size !== generations.length) issues.push('candidate seeds must be unique');

  const selectedId = value.selectedCandidateId;
  if (!isNonEmpty(selectedId) || !generations.some((generation) => isRecord(generation) && generation.id === selectedId)) {
    issues.push('selectedCandidateId must identify a reviewed candidate');
  }
  const outputs = Array.isArray(value.selectedOutputs) ? value.selectedOutputs : [];
  const requiredKinds = new Set(['sheet', 'front', 'left', 'back', 'material-detail']);
  outputs.forEach((output, index) => {
    if (!isRecord(output) || !isNonEmpty(output.path) || !isSha256(output.sha256) || !isNonEmpty(output.kind)) {
      issues.push(`selected output ${index} is incomplete`);
      return;
    }
    requiredKinds.delete(output.kind as string);
  });
  if (requiredKinds.size) issues.push(`selected outputs missing: ${[...requiredKinds].join(', ')}`);

  if (!isRecord(value.mixamo) || typeof value.mixamo.rigged !== 'boolean' || !isNonEmpty(value.mixamo.status)) {
    issues.push('Mixamo status must be explicit');
  }
  return { valid: issues.length === 0, issues };
};

export const validatePreMixamoReport = (value: unknown): ValidationResult => {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ['validation report must be an object'] };
  const geometry = isRecord(value.geometry) ? value.geometry : {};
  const transforms = isRecord(value.transforms) ? value.transforms : {};
  if (geometry.primaryConnectedComponents !== 1) issues.push('primary body must be one connected component');
  if (geometry.nonManifoldEdges !== 0) issues.push('primary body must be manifold');
  if (typeof geometry.vertices !== 'number' || geometry.vertices < 500) issues.push('vertex count is unexpectedly low');
  if (typeof geometry.triangles !== 'number' || geometry.triangles < 900) issues.push('triangle count is unexpectedly low');
  if (typeof geometry.headRatio !== 'number' || geometry.headRatio < 6.9 || geometry.headRatio > 7.6) issues.push('head ratio must remain near 7.25');
  if (transforms.applied !== true || transforms.upAxis !== '+Z' || transforms.originCentered !== true) issues.push('transforms must be clean, origin-centered, and +Z up');
  if (!Array.isArray(value.materials) || value.materials.length < 5) issues.push('five reviewed material roles are required');
  if (!isRecord(value.bounds) || !Array.isArray(value.bounds.min) || !Array.isArray(value.bounds.max)) issues.push('bounds are required');
  return { valid: issues.length === 0, issues };
};
