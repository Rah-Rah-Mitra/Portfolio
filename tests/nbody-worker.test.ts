import { describe, expect, it, vi } from 'vitest';
import { createWorkerConfig, FIELD_SCALE, normalizeNBodyWorkerMessage, resolveEffectiveParticleCount, toFieldPoint, type NBodyLiveConfig } from '../lib/nbody/workerProtocol';

const LIVE: NBodyLiveConfig = { timeScale: 1, gravity: 1, softening: 0.012, expansionOrder: 8, leafCapacity: 48, pointerAttraction: true, showTree: false };

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

  it('accepts a zero-length step: that is the redraw a halted field paints its still frame with', () => {
    expect(normalizeNBodyWorkerMessage({ type: 'step', dt: 0, buffer: new ArrayBuffer(64) })?.type).toBe('step');
    expect(normalizeNBodyWorkerMessage({ type: 'step', dt: -0.01, buffer: new ArrayBuffer(64) })).toBeNull();
  });

  it('accepts only #rrggbb accent-ramp values on a step message, since they reach a fillStyle', () => {
    const buffer = new ArrayBuffer(64);
    expect(normalizeNBodyWorkerMessage({ type: 'step', dt: 1 / 30, buffer, accent: '#5980a6', accentDeep: '#416180' })?.type).toBe('step');
    expect(normalizeNBodyWorkerMessage({ type: 'step', dt: 1 / 30, buffer, accent: 'url(javascript:bad)' })).toBeNull();
    expect(normalizeNBodyWorkerMessage({ type: 'step', dt: 1 / 30, buffer, accentDeep: 'var(--color-accent-700)' })).toBeNull();
    expect(normalizeNBodyWorkerMessage({ type: 'step', dt: 1 / 30, buffer, trailPersistence: 91 })).toBeNull();
  });

  it('accepts a live configure with the same bounds as initialize, and carries no other key', () => {
    expect(normalizeNBodyWorkerMessage({ type: 'configure', ...LIVE, gravity: 2, timeScale: 0.25 })).toEqual({ type: 'configure', ...LIVE, gravity: 2, timeScale: 0.25 });
    // Rebuilt, not passed through: a body count or seed must never ride a configure past initialize.
    expect(normalizeNBodyWorkerMessage({ type: 'configure', ...LIVE, particleCount: 4096, seed: 7 })).toEqual({ type: 'configure', ...LIVE });
    expect(normalizeNBodyWorkerMessage({ type: 'configure', ...LIVE, gravity: 2.05 })).toBeNull();
    expect(normalizeNBodyWorkerMessage({ type: 'configure', ...LIVE, expansionOrder: 12 })).toBeNull();
    expect(normalizeNBodyWorkerMessage({ type: 'configure', ...LIVE, showTree: 'yes' })).toBeNull();
    const { gravity: _gravity, ...partial } = LIVE;
    expect(normalizeNBodyWorkerMessage({ type: 'configure', ...partial })).toBeNull();
  });

  it('only downgrades effective count after slow p95 and never auto-upgrades', () => {
    expect(resolveEffectiveParticleCount(2048, 2048, 18)).toBe(2048);
    expect(resolveEffectiveParticleCount(2048, 2048, 25)).toBe(1536);
    expect(resolveEffectiveParticleCount(2048, 1536, 12)).toBe(1536);
    expect(resolveEffectiveParticleCount(256, 256, 40)).toBe(256);
  });
});

describe('desk pointer → field coordinates', () => {
  it('maps through the same square frame the worker draws with, so the attractor sits under the cursor', () => {
    // A 1000×500 desk: one field unit is 0.48 × 500 = 240 px either way.
    const unit = 500 * FIELD_SCALE;
    expect(toFieldPoint(500, 250, 1000, 500)).toEqual({ x: 0, y: 0 });
    const point = toFieldPoint(750, 125, 1000, 500);
    expect(point.x).toBeCloseTo(250 / unit, 12);
    expect(point.y).toBeCloseTo(125 / unit, 12); // y is up in the field
  });

  it('clamps a wide desk edge into the range the worker accepts', () => {
    const edge = toFieldPoint(3000, 0, 3000, 500);
    expect(edge.x).toBe(4);
    expect(normalizeNBodyWorkerMessage({ type: 'pointer', ...edge, active: true })?.type).toBe('pointer');
    expect(normalizeNBodyWorkerMessage({ type: 'pointer', x: 4.01, y: 0, active: true })).toBeNull();
  });
});

describe('N-body worker: live settings', () => {
  // The worker registers on `self`, which the pure project does not have; a
  // stand-in records what it posts back. resetModules gives each test a fresh worker.
  const boot = async () => {
    let handler: ((event: { data: unknown }) => void) | null = null;
    const posted: Array<Record<string, unknown>> = [];
    vi.stubGlobal('self', {
      addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => { handler = listener; },
      postMessage: (message: Record<string, unknown>) => { posted.push(message); },
    });
    vi.resetModules();
    await import('../workers/nbody.worker');
    vi.unstubAllGlobals();
    const send = (data: unknown) => handler!({ data });
    const step = () => {
      send({ type: 'step', dt: 1 / 30, buffer: new ArrayBuffer(256 * 2 * Float32Array.BYTES_PER_ELEMENT) });
      return Array.from(new Float32Array(posted.at(-1)!.buffer as ArrayBuffer));
    };
    return { send, step, posted };
  };
  const config = createWorkerConfig({ particleCount: 256, effectiveParticleCount: 256 });

  it('tunes the running field in place: a configure never reseeds it, and its values reach the integrator', async () => {
    const { send, step } = await boot();
    // One step, then (optionally) a configure, then two more. Velocity Verlet
    // moves positions on the acceleration from the step before, so a new
    // gravity shows in positions one step after it lands; timeScale at once.
    const run = (live?: Partial<typeof LIVE>) => {
      send({ type: 'initialize', config });
      step();
      if (live) send({ type: 'configure', ...LIVE, ...live });
      step();
      return step();
    };
    send({ type: 'initialize', config });
    const firstStep = step();
    const plain = run();
    expect(plain).not.toEqual(firstStep);
    // A restart would have put the bodies back on their first step.
    expect(run({})).toEqual(plain);
    expect(run({ gravity: 2 })).not.toEqual(plain);
    expect(run({ timeScale: 0.5 })).not.toEqual(plain);
  });

  it('ignores a configure that arrives before initialize', async () => {
    const { send, posted } = await boot();
    send({ type: 'configure', ...LIVE, gravity: 2 });
    expect(posted).toEqual([]);
    send({ type: 'initialize', config });
    expect(posted.at(-1)).toEqual({ type: 'ready', effectiveParticleCount: 256 });
  });
});
