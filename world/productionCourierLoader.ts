import type * as THREE from 'three';
import type { CourierAsset } from './courierAsset';

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

export const loadProductionCourierIfApproved = loadProductionCourier;

export const startCourierAssetUpgrade = ({ manifest, fallback, parent, importer, getPose, onActivate, onError }: {
  manifest: ProductionCourierManifest;
  fallback: CourierAsset;
  parent: THREE.Object3D;
  importer: (path: string) => Promise<CourierAsset>;
  getPose: () => string;
  onActivate?: (asset: CourierAsset) => void;
  onError?: (error: unknown) => void;
}) => {
  let active = fallback;
  let disposed = false;
  const ready = loadProductionCourierIfApproved(manifest, importer).then((production) => {
    if (!production) return fallback;
    if (disposed) { production.dispose(); return fallback; }
    production.root.position.copy(fallback.root.position);
    production.root.quaternion.copy(fallback.root.quaternion);
    production.root.scale.copy(fallback.root.scale);
    production.root.visible = fallback.root.visible;
    production.setPose(getPose());
    parent.add(production.root);
    parent.remove(fallback.root);
    fallback.dispose();
    active = production;
    onActivate?.(production);
    return production;
  }).catch((error) => {
    onError?.(error);
    return fallback;
  });
  return {
    ready,
    current: () => active,
    dispose() {
      if (disposed) return;
      disposed = true;
      parent.remove(active.root);
      active.dispose();
    },
  };
};
