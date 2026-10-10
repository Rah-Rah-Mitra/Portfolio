import { describe, expect, it } from 'vitest';
import { applyEffectPatch, defaultSettings, sanitizeEffectPatch } from '../contexts/PhysicsContext';
import { defaultBackdropSettings } from '../lib/backdropSettings';

describe('FX backdrop settings', () => {
  it('boots with N-body and smoke off and the Estate drawings on, on the shared defaults', () => {
    expect(defaultSettings).toBe(defaultBackdropSettings);
    expect(Object.keys(defaultSettings)).toEqual(['nbody', 'fluid', 'drawing']);
    expect(defaultSettings.nbody.enabled).toBe(false);
    expect(defaultSettings.fluid.enabled).toBe(false);
    expect(defaultSettings.drawing.enabled).toBe(true);
  });

  it('takes only the Estate drawings’ switch: the drawing set has no parameters', () => {
    expect(sanitizeEffectPatch('drawing', { enabled: false, tempo: 'x', curl: 5 })).toEqual({ enabled: false });
    expect(sanitizeEffectPatch('drawing', { enabled: 'yes' })).toEqual({});
  });

  it('clamps numbers into the ranges the engines were tuned for', () => {
    expect(sanitizeEffectPatch('nbody', { particleCount: 99_999, timeScale: 0, gravity: 5, softening: 1, trailPersistence: -4 }))
      .toEqual({ particleCount: 4096, timeScale: 0.25, gravity: 2, softening: 0.04, trailPersistence: 0 });
    expect(sanitizeEffectPatch('fluid', { speed: 9, intensity: -1, opacity: 100, splatRadius: 1, curl: 120 }))
      .toEqual({ speed: 2.4, intensity: 0, opacity: 80, splatRadius: 10, curl: 90 });
  });

  it('rounds integer settings and drops non-finite numbers', () => {
    expect(sanitizeEffectPatch('nbody', { particleCount: 1000.6, seed: 3.2 })).toEqual({ particleCount: 1001, seed: 3 });
    expect(sanitizeEffectPatch('nbody', { gravity: Number.NaN, timeScale: Number.POSITIVE_INFINITY, particleCount: '512' })).toEqual({});
  });

  it('accepts discrete settings only from their lists, without snapping', () => {
    expect(sanitizeEffectPatch('nbody', { preset: 'binary', expansionOrder: 6, leafCapacity: 96 }))
      .toEqual({ preset: 'binary', expansionOrder: 6, leafCapacity: 96 });
    expect(sanitizeEffectPatch('nbody', { preset: 'spiral', expansionOrder: 7, leafCapacity: 50 })).toEqual({});
    expect(sanitizeEffectPatch('fluid', { quality: 'high' })).toEqual({ quality: 'high' });
    expect(sanitizeEffectPatch('fluid', { quality: 'ultra' })).toEqual({});
  });

  it('keeps flags boolean and ignores keys that belong to the other backdrop or to nothing', () => {
    expect(sanitizeEffectPatch('nbody', { enabled: true, showTree: 'yes', pointerAttraction: false })).toEqual({ enabled: true, pointerAttraction: false });
    expect(sanitizeEffectPatch('fluid', { pointerInteraction: true, curl: 10, particleCount: 512, smash: { enabled: true } }))
      .toEqual({ pointerInteraction: true, curl: 10 });
  });

  it('patches one backdrop and returns the same object when nothing valid changed', () => {
    const next = applyEffectPatch(defaultSettings, 'fluid', { enabled: true, opacity: 500 });
    expect(next.fluid).toEqual({ ...defaultSettings.fluid, enabled: true, opacity: 80 });
    expect(next.nbody).toBe(defaultSettings.nbody);
    expect(applyEffectPatch(defaultSettings, 'nbody', { expansionOrder: 5 as never })).toBe(defaultSettings);
  });
});
