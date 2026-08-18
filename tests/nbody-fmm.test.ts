import { describe, expect, it } from 'vitest';
import {
  FmmSolver2D,
  computeDirectAccelerations,
  createInitialConditions,
  leapfrogStep,
  totalEnergy,
} from '../lib/nbody/fmm';

const rmsRelativeError = (reference: Float64Array, candidate: Float64Array) => {
  let error = 0;
  let scale = 0;
  for (let index = 0; index < reference.length; index += 1) {
    const delta = candidate[index]! - reference[index]!;
    error += delta * delta;
    scale += reference[index]! * reference[index]!;
  }
  return Math.sqrt(error / Math.max(scale, Number.EPSILON));
};

describe('2D logarithmic gravitational FMM', () => {
  it('reproduces deterministic Galaxy, Binary, and Field initial conditions', () => {
    for (const preset of ['galaxy', 'binary', 'field'] as const) {
      const first = createInitialConditions(256, preset, 74021);
      const second = createInitialConditions(256, preset, 74021);
      expect(first.positions).toEqual(second.positions);
      expect(first.velocities).toEqual(second.velocities);
      expect(first.masses).toEqual(second.masses);
      expect(createInitialConditions(256, preset, 74022).positions).not.toEqual(first.positions);
    }
  });

  it('matches softened direct near-field acceleration exactly', () => {
    const positions = new Float64Array([-0.1, 0.2, 0.3, -0.2]);
    const masses = new Float64Array([2, 3]);
    const acceleration = computeDirectAccelerations(positions, masses, 1.4, 0.03);
    const dx = positions[0]! - positions[2]!;
    const dy = positions[1]! - positions[3]!;
    const denominator = dx * dx + dy * dy + 0.03 ** 2;
    expect(acceleration[0]).toBeCloseTo(-1.4 * 3 * dx / denominator, 12);
    expect(acceleration[1]).toBeCloseTo(-1.4 * 3 * dy / denominator, 12);
    expect(acceleration[2]).toBeCloseTo(1.4 * 2 * dx / denominator, 12);
    expect(acceleration[3]).toBeCloseTo(1.4 * 2 * dy / denominator, 12);
  });

  it('agrees with deterministic direct summation within one percent RMS at order eight', () => {
    const initial = createInitialConditions(384, 'field', 88017);
    const direct = computeDirectAccelerations(initial.positions, initial.masses, 1, 0.002);
    const solver = new FmmSolver2D(4096, 10);
    const result = solver.compute(initial.positions, initial.masses, { expansionOrder: 8, leafCapacity: 48, gravity: 1, softening: 0.002 });
    expect(rmsRelativeError(direct, result.accelerations)).toBeLessThan(0.01);
    expect(result.metrics.m2lInteractions).toBeGreaterThan(0);
    expect(result.metrics.treeDepth).toBeGreaterThan(1);
  });

  it('keeps a softened two-body orbit finite with under three percent energy drift', () => {
    const positions = new Float64Array([-0.5, 0, 0.5, 0]);
    const velocities = new Float64Array([0, -0.5, 0, 0.5]);
    const masses = new Float64Array([1, 1]);
    const acceleration = computeDirectAccelerations(positions, masses, 1, 0.01);
    const start = totalEnergy(positions, velocities, masses, 1, 0.01);
    for (let step = 0; step < 1000; step += 1) {
      leapfrogStep(positions, velocities, acceleration, masses, 0.001, 1, 0.01);
    }
    const end = totalEnergy(positions, velocities, masses, 1, 0.01);
    expect(Number.isFinite(end)).toBe(true);
    expect(Math.abs((end - start) / start)).toBeLessThan(0.03);
  });

  it('demonstrates sub-quadratic interaction growth for a uniform field', () => {
    const solver = new FmmSolver2D(4096, 10);
    const small = createInitialConditions(512, 'field', 2901);
    const large = createInitialConditions(1024, 'field', 2901);
    const smallMetrics = solver.compute(small.positions, small.masses, { expansionOrder: 8, leafCapacity: 24, gravity: 1, softening: 0.004 }).metrics;
    const largeMetrics = solver.compute(large.positions, large.masses, { expansionOrder: 8, leafCapacity: 24, gravity: 1, softening: 0.004 }).metrics;
    const smallWork = smallMetrics.m2lInteractions + smallMetrics.directInteractions;
    const largeWork = largeMetrics.m2lInteractions + largeMetrics.directInteractions;
    expect(largeWork / smallWork).toBeLessThan(3.2);
    expect(largeWork).toBeLessThan(1024 * 1024 * 0.45);
  });
});
