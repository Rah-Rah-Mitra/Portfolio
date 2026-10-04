/// <reference lib="webworker" />
import { FmmSolver2D, createInitialConditions } from '../lib/nbody/fmm';
import { normalizeNBodyWorkerMessage, resolveEffectiveParticleCount, type NBodyWorkerConfig } from '../lib/nbody/workerProtocol';
import { paintField, paintSprite, SPRITE_SIZE, type FieldInk } from '../lib/nbody/paint';

const worker = self as DedicatedWorkerGlobalScope;
const solver = new FmmSolver2D(4096, 10);
let config: NBodyWorkerConfig | null = null;
let positions = new Float64Array(0);
let velocities = new Float64Array(0);
let masses = new Float64Array(0);
let accelerations = new Float64Array(0);
let paused = false;
let pointerX = 0;
let pointerY = 0;
let pointerActive = false;
let renderCanvas: OffscreenCanvas | null = null;
let renderContext: OffscreenCanvasRenderingContext2D | null = null;
let sprite: OffscreenCanvas | null = null;
let spriteColor = '';
const leafBounds = new Float32Array(4096 * 3);
const stepTimes = new Float64Array(60);
const sortedStepTimes = new Float64Array(60);
let stepSampleCount = 0;
let stepCursor = 0;
let lastStepP95 = 0;

const initialize = (nextConfig: NBodyWorkerConfig) => {
  config = { ...nextConfig };
  const initial = createInitialConditions(config.effectiveParticleCount, config.preset, config.seed);
  positions = initial.positions;
  velocities = initial.velocities;
  masses = initial.masses;
  accelerations = new Float64Array(positions.length);
  const computed = solver.compute(positions, masses, config);
  accelerations.set(computed.accelerations);
  stepSampleCount = 0;
  stepCursor = 0;
  lastStepP95 = 0;
};

const stepP95 = () => {
  const count = Math.min(stepSampleCount, stepTimes.length);
  if (count === 0) return 0;
  sortedStepTimes.set(stepTimes.subarray(0, count), 0);
  for (let index = 1; index < count; index += 1) {
    const value = sortedStepTimes[index]!;
    let cursor = index - 1;
    while (cursor >= 0 && sortedStepTimes[cursor]! > value) {
      sortedStepTimes[cursor + 1] = sortedStepTimes[cursor]!;
      cursor -= 1;
    }
    sortedStepTimes[cursor + 1] = value;
  }
  return sortedStepTimes[Math.min(count - 1, Math.floor(count * 0.95))]!;
};

// Painting lives in lib/nbody/paint.ts so the main-thread fallback draws the
// same picture. The sprite is rebuilt only when the palette changes.
const render = (widthCss: number, heightCss: number, dpr: number, ink: FieldInk) => {
  if (!renderCanvas || !renderContext) return;
  const width = Math.max(1, Math.round(widthCss * dpr));
  const height = Math.max(1, Math.round(heightCss * dpr));
  if (renderCanvas.width !== width || renderCanvas.height !== height) { renderCanvas.width = width; renderCanvas.height = height; }
  const nextSpriteColor = `${ink.accent}:${ink.accentDeep}`;
  if (!sprite || spriteColor !== nextSpriteColor) {
    sprite = new OffscreenCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const context = sprite.getContext('2d');
    if (context) paintSprite(context, ink.accent, ink.accentDeep);
    spriteColor = nextSpriteColor;
  }
  const leafCount = config?.showTree ? solver.writeLeafBounds(leafBounds) : 0;
  paintField(renderContext, {
    positions, count: masses.length, width, height, dpr, sprite,
    leaves: leafCount ? { bounds: leafBounds, count: leafCount } : undefined,
  }, ink);
};

const simulate = (dt: number) => {
  if (!config) return null;
  const started = performance.now();
  const scaledDt = dt * config.timeScale;
  const half = scaledDt * 0.5;
  for (let index = 0; index < positions.length; index += 1) {
    velocities[index] = velocities[index]! + accelerations[index]! * half;
    positions[index] = positions[index]! + velocities[index]! * scaledDt;
  }
  const computed = solver.compute(positions, masses, config);
  accelerations.set(computed.accelerations);
  if (pointerActive && config.pointerAttraction) {
    for (let body = 0; body < masses.length; body += 1) {
      const offset = body * 2;
      const dx = positions[offset]! - pointerX;
      const dy = positions[offset + 1]! - pointerY;
      const scale = -0.16 / (dx * dx + dy * dy + 0.012);
      accelerations[offset] = accelerations[offset]! + scale * dx;
      accelerations[offset + 1] = accelerations[offset + 1]! + scale * dy;
    }
  }
  for (let index = 0; index < velocities.length; index += 1) velocities[index] = velocities[index]! + accelerations[index]! * half;
  const elapsed = performance.now() - started;
  stepTimes[stepCursor] = elapsed;
  stepCursor = (stepCursor + 1) % stepTimes.length;
  stepSampleCount += 1;
  if (stepSampleCount > 0 && stepSampleCount % 60 === 0) {
    lastStepP95 = stepP95();
    const effective = resolveEffectiveParticleCount(config.particleCount, config.effectiveParticleCount, lastStepP95);
    if (effective < config.effectiveParticleCount) initialize({ ...config, effectiveParticleCount: effective });
  }
  return { elapsed, metrics: computed.metrics, p95: lastStepP95 };
};

worker.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = normalizeNBodyWorkerMessage(event.data);
  if (!message) {
    // A rejected step still carried the host's only frame buffer; hand it back,
    // or the host would wait on it forever and the field would stall.
    const raw = event.data as { buffer?: unknown } | null;
    if (raw && typeof raw === 'object' && raw.buffer instanceof ArrayBuffer) worker.postMessage({ type: 'protocol-error', buffer: raw.buffer }, [raw.buffer]);
    else worker.postMessage({ type: 'protocol-error' });
    return;
  }
  if (message.type === 'initialize') {
    if (message.canvas) {
      renderCanvas = message.canvas;
      renderContext = renderCanvas.getContext('2d');
    }
    initialize(message.config);
    worker.postMessage({ type: 'ready', effectiveParticleCount: config?.effectiveParticleCount ?? 0 });
    return;
  }
  if (message.type === 'configure') {
    // A slider step tunes the running field in place; only initialize reseeds it.
    // Before initialize there is no config to tune, and the next initialize
    // carries the current values anyway.
    if (config) {
      const { type: _type, ...live } = message;
      config = { ...config, ...live };
    }
    return;
  }
  if (message.type === 'pause') { paused = message.paused; return; }
  if (message.type === 'pointer') { pointerX = message.x; pointerY = message.y; pointerActive = message.active; return; }
  if (message.type === 'reset') {
    if (config) initialize({ ...config, seed: message.seed });
    return;
  }
  if (message.type === 'recycle') return;
  if (message.type === 'step') {
    // dt === 0 is a redraw (see workerProtocol): it paints even while paused,
    // which is how a halted field still shows a still frame.
    if (!config || (paused && message.dt > 0)) {
      worker.postMessage({ type: 'frame', paused: true, buffer: message.buffer }, [message.buffer]);
      return;
    }
    const performanceMetrics = message.dt > 0 ? simulate(message.dt) : null;
    if (message.accent && message.accentDeep) {
      render(message.width ?? 0, message.height ?? 0, message.dpr ?? 1, {
        accent: message.accent, accentDeep: message.accentDeep, trailPersistence: message.trailPersistence ?? 38,
      });
    }
    const destination = new Float32Array(message.buffer);
    const bodyCount = Math.min(masses.length, Math.floor(destination.length / 2));
    for (let index = 0; index < bodyCount * 2; index += 1) destination[index] = positions[index]!;
    worker.postMessage({
      type: 'frame',
      buffer: message.buffer,
      bodyCount,
      effectiveParticleCount: config.effectiveParticleCount,
      metrics: performanceMetrics,
    }, [message.buffer]);
  }
});

export {};
