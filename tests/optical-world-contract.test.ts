import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as manifest from '../world/narrativeManifest';
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

  it('parses runtime JSON and validates authored safe-region geometry', () => {
    const parse = (manifest as typeof manifest & { parseCameraShotDefinitions?: (value: unknown) => unknown }).parseCameraShotDefinitions;
    const validateAnchors = (manifest as typeof manifest & { validateWorldAnchorDefinitions?: (value: unknown) => { valid: boolean } }).validateWorldAnchorDefinitions;
    expect(parse).toBeTypeOf('function'); expect(validateAnchors).toBeTypeOf('function');
    expect(() => parse?.([{ ...cameraShots[0], focusDistance: Number.NaN }])).toThrow(/focus/i);
    expect(validateCameraShotDefinitions([{ ...cameraShots[0], lighting: null } as never]).valid).toBe(false);
    expect(validateCameraShotDefinitions([{ ...cameraShots[0], responsive: { mobile: { orbitLimits: null } } } as never]).valid).toBe(false);
    expect(validateCameraShotDefinitions([{ ...cameraShots[0], responsive: 7 } as never]).valid).toBe(false);
    expect(validateCameraShotDefinitions([{ ...cameraShots[0], responsive: { mobile: { transition: { duration: .2, easing: 9 } } } } as never]).valid).toBe(false);
    expect(validateCameraShotDefinitions([{ ...cameraShots[0], responsive: { mobile: { id: 'mobile-identity' } } } as never]).valid).toBe(false);
    expect(validateCameraShotDefinitions([{ ...cameraShots[0], responsive: { tablet: { chapterId: 'other-section' } } } as never]).valid).toBe(false);
    expect(validateAnchors?.([{ id: 'unsafe', elementId: 'home', chapterId: 'home', worldOffset: [0, 0, 0], projectionDepth: 5, worldNormal: [0, 0, 1], interactionBounds: { left: 10, top: 0, right: 5, bottom: 20 } }]).valid).toBe(false);
    expect(validateAnchors?.([{ id: 'unsafe-mobile', elementId: 'home', chapterId: 'home', worldOffset: [0, 0, 0], projectionDepth: 5, worldNormal: [0, 0, 1], responsive: { mobile: { interactionBounds: { left: 0, top: Number.NaN, right: 10, bottom: 20 } } } }]).valid).toBe(false);
    expect(validateAnchors?.([{ id: 'unsafe-responsive', elementId: 'home', chapterId: 'home', worldOffset: [0, 0, 0], projectionDepth: 5, worldNormal: [0, 0, 1], responsive: 7 }]).valid).toBe(false);
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
    expect(world).toContain('ScrollTrigger.maxScroll(window)');
    expect(world).toContain('localSurface.getBoundingClientRect()');
    expect(world).toContain('new InteractionArbitrator()');
    expect(world).toContain('WORLD_POLICY_CHANGE_EVENT');
    expect(world).toContain('resolveWorldPolicyHandoff');
    expect(world).toContain('activeResponsiveShot.current');
    expect(world).toContain('constrainOrbitState');
    expect(world).toContain('positionCameraFromOrbit');
    expect(world).toContain('new THREE.AmbientLight');
    expect(world).toContain('ambient.intensity = adapter.lighting.environment');
    expect(world).toContain('applyCharacterFraming');
    expect(world).not.toContain('scene.rotation.y +=');
    expect(`${portfolio}\n${world}`).not.toMatch(/field-engineer-guide\.webp|toon-blaster-runner\.glb/);
    expect(existsSync(new URL('../public/images/field-engineer-guide.webp', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../public/models/toon-blaster-runner.glb', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../public/renders/toon-blaster-runner-preview.png', import.meta.url))).toBe(false);
  });

  it('keeps the camera director development-only and dynamic', async () => {
    const host = await readFile(new URL('../components/OpticalBenchWorld.tsx', import.meta.url), 'utf8');
    expect(host).toContain('import.meta.env.DEV');
    expect(host).toContain("import('./CameraDirector')");
  });
});
