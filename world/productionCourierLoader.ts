export type ProductionCourierManifest = { productionApproved: boolean; productionGlb: string | null };

export const resolveCourierAssetPolicy = (manifest: ProductionCourierManifest): { kind: 'procedural' | 'production'; path: string | null } => {
  if (!manifest.productionApproved) return { kind: 'procedural', path: null };
  if (!manifest.productionGlb) throw new Error('A production-approved Courier requires a production GLB path.');
  return { kind: 'production', path: manifest.productionGlb };
};

export const loadProductionCourier = async <T>(
  manifest: ProductionCourierManifest,
  importer: (path: string) => Promise<T>,
): Promise<T | null> => {
  const policy = resolveCourierAssetPolicy(manifest);
  return policy.kind === 'production' && policy.path ? importer(policy.path) : null;
};
