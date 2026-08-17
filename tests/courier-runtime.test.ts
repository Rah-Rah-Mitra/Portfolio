import { describe, expect, it, vi } from 'vitest';
import { loadProductionCourier, resolveCourierAssetPolicy } from '../world/productionCourierLoader';

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
});
