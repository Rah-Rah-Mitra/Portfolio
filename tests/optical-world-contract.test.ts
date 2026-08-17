import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { cameraShots, validateCameraShotDefinitions } from '../world/narrativeManifest';

describe('optical test bench contract', () => {
  it('stores validated camera direction in a typed manifest', () => {
    expect(validateCameraShotDefinitions(cameraShots)).toEqual({ valid: true, issues: [] });
    expect(cameraShots.length).toBeGreaterThanOrEqual(6);
    cameraShots.forEach((shot) => {
      expect(shot.near).toBeGreaterThan(0);
      expect(shot.far).toBeGreaterThan(shot.near);
      expect(shot.transition.duration).toBeLessThanOrEqual(0.45);
    });
  });

  it('uses one lazy optical world without the retired image or runner asset', async () => {
    const [portfolio, world] = await Promise.all([
      readFile(new URL('../components/PortfolioExperience.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../components/OpticalBenchWorld.tsx', import.meta.url), 'utf8'),
    ]);
    expect(portfolio).toContain("React.lazy(() => import('./OpticalBenchWorld'))");
    expect(world).toContain('THREE.WebGLRenderer');
    expect(world).toContain('ScrollTrigger');
    expect(world).toContain("fastScrollEnd: 2500");
    expect(world).toContain("preventOverlaps: 'portfolio-narrative'");
    expect(`${portfolio}\n${world}`).not.toMatch(/field-engineer-guide\.webp|toon-blaster-runner\.glb/);
  });

  it('keeps the camera director development-only and dynamic', async () => {
    const host = await readFile(new URL('../components/OpticalBenchWorld.tsx', import.meta.url), 'utf8');
    expect(host).toContain('import.meta.env.DEV');
    expect(host).toContain("import('./CameraDirector')");
  });
});
