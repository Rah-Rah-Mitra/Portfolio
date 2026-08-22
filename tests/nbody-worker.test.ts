import { describe, expect, it } from 'vitest';
import { createWorkerConfig, normalizeNBodyWorkerMessage, resolveEffectiveParticleCount } from '../lib/nbody/workerProtocol';

describe('N-body Worker protocol', () => {
  it('rejects malformed and unknown commands', () => {
    expect(normalizeNBodyWorkerMessage(null)).toBeNull();
    expect(normalizeNBodyWorkerMessage({ type: 'step', dt: Infinity })).toBeNull();
    expect(normalizeNBodyWorkerMessage({ type: 'launch' })).toBeNull();
  });

  it('accepts bounded initialization, step, pause, reset, pointer, and recycled-buffer messages', () => {
    expect(normalizeNBodyWorkerMessage({ type: 'initialize', config: createWorkerConfig() })?.type).toBe('initialize');
    expect(normalizeNBodyWorkerMessage({ type: 'step', dt: 1 / 30, buffer: new ArrayBuffer(64) })?.type).toBe('step');
    expect(normalizeNBodyWorkerMessage({ type: 'pause', paused: true })?.type).toBe('pause');
    expect(normalizeNBodyWorkerMessage({ type: 'reset', seed: 43 })?.type).toBe('reset');
    expect(normalizeNBodyWorkerMessage({ type: 'pointer', x: 0.2, y: -0.3, active: true })?.type).toBe('pointer');
    expect(normalizeNBodyWorkerMessage({ type: 'recycle', buffer: new ArrayBuffer(64) })?.type).toBe('recycle');
  });

  it('accepts only bounded render palette values on a step message', () => {
    const buffer = new ArrayBuffer(64);
    expect(normalizeNBodyWorkerMessage({ type: 'step', dt: 1 / 30, buffer, surface: '#e9efed', darkSurface: false })?.type).toBe('step');
    expect(normalizeNBodyWorkerMessage({ type: 'step', dt: 1 / 30, buffer, surface: 'url(javascript:bad)', darkSurface: false })).toBeNull();
    expect(normalizeNBodyWorkerMessage({ type: 'step', dt: 1 / 30, buffer, surface: '#080b0f', darkSurface: 'yes' })).toBeNull();
  });

  it('only downgrades effective count after slow p95 and never auto-upgrades', () => {
    expect(resolveEffectiveParticleCount(2048, 2048, 18)).toBe(2048);
    expect(resolveEffectiveParticleCount(2048, 2048, 25)).toBe(1536);
    expect(resolveEffectiveParticleCount(2048, 1536, 12)).toBe(1536);
    expect(resolveEffectiveParticleCount(256, 256, 40)).toBe(256);
  });
});
