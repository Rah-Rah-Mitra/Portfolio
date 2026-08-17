import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as productionLoader from '../world/productionCourierLoader';
import { loadProductionCourier, resolveCourierAssetPolicy } from '../world/productionCourierLoader';
import { createNeutralCourierPlaceholder, type CourierAsset } from '../world/courierAsset';

describe('production Courier gate', () => {
  it('never imports an absent GLB while production approval is false', async () => {
    const importer = vi.fn();
    expect(resolveCourierAssetPolicy({ productionApproved: false, productionGlb: null })).toEqual({ kind: 'procedural', path: null });
    await expect(loadProductionCourier({ productionApproved: false, productionGlb: null }, importer)).resolves.toBeNull();
    expect(importer).not.toHaveBeenCalled();
  });

  it('requires both truthful approval and a production path before lazy importing', async () => {
    const importer = vi.fn().mockResolvedValue({ scene: 'loaded' });
    await expect(loadProductionCourier({ productionApproved: true, productionGlb: '/assets/courier.glb' }, importer)).resolves.toEqual({ scene: 'loaded' });
    expect(importer).toHaveBeenCalledWith('/assets/courier.glb');
    expect(() => resolveCourierAssetPolicy({ productionApproved: true, productionGlb: null })).toThrow(/production GLB/i);
  });

  it('replaces and disposes the fallback while preserving transform and reaction pose', async () => {
    const startCourierAssetUpgrade = (productionLoader as { startCourierAssetUpgrade?: Function }).startCourierAssetUpgrade;
    expect(startCourierAssetUpgrade).toBeTypeOf('function');
    if (!startCourierAssetUpgrade) return;
    const parent = new THREE.Group();
    const fallback = createNeutralCourierPlaceholder();
    fallback.root.position.set(2, 3, 4); fallback.root.scale.setScalar(.6); fallback.root.visible = false;
    parent.add(fallback.root);
    const fallbackDispose = vi.spyOn(fallback, 'dispose');
    const production: CourierAsset = { root: new THREE.Group(), setPose: vi.fn(), dispose: vi.fn() };
    const upgrade = startCourierAssetUpgrade({
      manifest: { productionApproved: true, productionGlb: '/assets/courier.glb' }, fallback, parent,
      importer: vi.fn().mockResolvedValue(production), getPose: () => 'success',
    });

    await expect(upgrade.ready).resolves.toBe(production);
    expect(parent.children).toEqual([production.root]);
    expect(production.root.position.toArray()).toEqual([2, 3, 4]);
    expect(production.root.scale.toArray()).toEqual([.6, .6, .6]);
    expect(production.root.visible).toBe(false);
    expect(production.setPose).toHaveBeenCalledWith('success');
    expect(fallbackDispose).toHaveBeenCalledOnce();
    upgrade.dispose();
    expect(production.dispose).toHaveBeenCalledOnce();
  });

  it('keeps the fallback on load rejection and disposes a late asset after unmount', async () => {
    const startCourierAssetUpgrade = (productionLoader as { startCourierAssetUpgrade?: Function }).startCourierAssetUpgrade;
    expect(startCourierAssetUpgrade).toBeTypeOf('function');
    if (!startCourierAssetUpgrade) return;
    const rejectedFallback = createNeutralCourierPlaceholder(); const rejectedParent = new THREE.Group(); rejectedParent.add(rejectedFallback.root);
    const rejected = startCourierAssetUpgrade({ manifest: { productionApproved: true, productionGlb: '/bad.glb' }, fallback: rejectedFallback, parent: rejectedParent, importer: vi.fn().mockRejectedValue(new Error('decode')), getPose: () => 'idle' });
    await expect(rejected.ready).resolves.toBe(rejectedFallback);
    expect(rejectedParent.children).toEqual([rejectedFallback.root]);

    let resolveAsset!: (asset: CourierAsset) => void;
    const late = new Promise<CourierAsset>((resolve) => { resolveAsset = resolve; });
    const lateFallback = createNeutralCourierPlaceholder(); const lateParent = new THREE.Group(); lateParent.add(lateFallback.root);
    const production: CourierAsset = { root: new THREE.Group(), setPose: vi.fn(), dispose: vi.fn() };
    const upgrade = startCourierAssetUpgrade({ manifest: { productionApproved: true, productionGlb: '/late.glb' }, fallback: lateFallback, parent: lateParent, importer: () => late, getPose: () => 'idle' });
    upgrade.dispose(); resolveAsset(production); await upgrade.ready;
    expect(production.dispose).toHaveBeenCalledOnce();
    expect(lateParent.children).toHaveLength(0);
  });
});
