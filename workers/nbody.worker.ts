/// <reference lib="webworker" />
import { FmmSolver2D, createInitialConditions } from '../lib/nbody/fmm';
import { normalizeNBodyWorkerMessage, resolveEffectiveParticleCount, type NBodyWorkerConfig } from '../lib/nbody/workerProtocol';

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
    worker.postMessage({ type: 'protocol-error' });
    return;
  }
  if (message.type === 'initialize') {
    initialize(message.config);
    worker.postMessage({ type: 'ready', effectiveParticleCount: config?.effectiveParticleCount ?? 0 });
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
    if (paused || !config) {
      worker.postMessage({ type: 'frame', paused: true, buffer: message.buffer }, [message.buffer]);
      return;
    }
    const performanceMetrics = simulate(message.dt);
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
