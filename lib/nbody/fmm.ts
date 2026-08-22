/*
 * Adaptive two-dimensional logarithmic-kernel FMM.
 * Translation structure and interaction-list strategy are adapted from
 * keyframe41/Fast-Multipole-Method (Public Domain / MIT); see THIRD_PARTY_NOTICES.md.
 * This solver is not a three-dimensional inverse-square implementation.
 */
import type { NBodyExpansionOrder, NBodyLeafCapacity, NBodyPreset } from '../../types';

export interface FmmOptions {
  expansionOrder: NBodyExpansionOrder;
  leafCapacity: NBodyLeafCapacity;
  gravity: number;
  softening: number;
}

export interface FmmMetrics {
  treeDepth: number;
  nodeCount: number;
  m2lInteractions: number;
  directInteractions: number;
}

export interface InitialConditions {
  positions: Float64Array;
  velocities: Float64Array;
  masses: Float64Array;
}

const MAX_DEPTH = 18;
const SEPARATION_RATIO = 2.75;

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
};

const normalPair = (random: () => number): [number, number] => {
  const radius = Math.sqrt(-2 * Math.log(Math.max(1e-12, random())));
  const angle = Math.PI * 2 * random();
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
};

export const createInitialConditions = (count: number, preset: NBodyPreset, seed: number): InitialConditions => {
  const safeCount = Math.max(2, Math.floor(count));
  const random = mulberry32(seed);
  const positions = new Float64Array(safeCount * 2);
  const velocities = new Float64Array(safeCount * 2);
  const masses = new Float64Array(safeCount);
  for (let index = 0; index < safeCount; index += 1) {
    const offset = index * 2;
    masses[index] = 1 / safeCount;
    if (preset === 'field') {
      positions[offset] = random() * 1.8 - 0.9;
      positions[offset + 1] = random() * 1.8 - 0.9;
      velocities[offset] = (random() - 0.5) * 0.015;
      velocities[offset + 1] = (random() - 0.5) * 0.015;
      continue;
    }
    if (preset === 'binary') {
      const cluster = index % 2 === 0 ? -1 : 1;
      const [nx, ny] = normalPair(random);
      positions[offset] = cluster * 0.34 + nx * 0.115;
      positions[offset + 1] = ny * 0.115;
      velocities[offset] = -ny * 0.12;
      velocities[offset + 1] = cluster * 0.23 + nx * 0.12;
      continue;
    }
    const radius = 0.055 + Math.sqrt(random()) * 0.72;
    const angle = Math.PI * 2 * random();
    const jitter = (random() - 0.5) * 0.018;
    positions[offset] = Math.cos(angle) * radius + jitter;
    positions[offset + 1] = Math.sin(angle) * radius + jitter;
    const speed = 0.2 + Math.sqrt(radius) * 0.37;
    velocities[offset] = -Math.sin(angle) * speed;
    velocities[offset + 1] = Math.cos(angle) * speed;
  }
  return { positions, velocities, masses };
};

export const computeDirectAccelerations = (
  positions: Float64Array,
  masses: Float64Array,
  gravity: number,
  softening: number,
  output = new Float64Array(positions.length),
) => {
  output.fill(0);
  const epsilonSquared = softening * softening;
  for (let target = 0; target < masses.length; target += 1) {
    const targetOffset = target * 2;
    const tx = positions[targetOffset]!;
    const ty = positions[targetOffset + 1]!;
    let ax = 0;
    let ay = 0;
    for (let source = 0; source < masses.length; source += 1) {
      if (source === target) continue;
      const sourceOffset = source * 2;
      const dx = tx - positions[sourceOffset]!;
      const dy = ty - positions[sourceOffset + 1]!;
      const scale = -gravity * masses[source]! / (dx * dx + dy * dy + epsilonSquared);
      ax += scale * dx;
      ay += scale * dy;
    }
    output[targetOffset] = ax;
    output[targetOffset + 1] = ay;
  }
  return output;
};

export const leapfrogStep = (
  positions: Float64Array,
  velocities: Float64Array,
  accelerations: Float64Array,
  masses: Float64Array,
  dt: number,
  gravity: number,
  softening: number,
) => {
  const half = dt * 0.5;
  for (let index = 0; index < positions.length; index += 1) {
    velocities[index] = velocities[index]! + accelerations[index]! * half;
    positions[index] = positions[index]! + velocities[index]! * dt;
  }
  computeDirectAccelerations(positions, masses, gravity, softening, accelerations);
  for (let index = 0; index < velocities.length; index += 1) velocities[index] = velocities[index]! + accelerations[index]! * half;
};

export const totalEnergy = (
  positions: Float64Array,
  velocities: Float64Array,
  masses: Float64Array,
  gravity: number,
  softening: number,
) => {
  let energy = 0;
  for (let index = 0; index < masses.length; index += 1) {
    const offset = index * 2;
    energy += 0.5 * masses[index]! * (velocities[offset]! ** 2 + velocities[offset + 1]! ** 2);
    for (let source = index + 1; source < masses.length; source += 1) {
      const sourceOffset = source * 2;
      const dx = positions[offset]! - positions[sourceOffset]!;
      const dy = positions[offset + 1]! - positions[sourceOffset + 1]!;
      energy += 0.5 * gravity * masses[index]! * masses[source]! * Math.log(dx * dx + dy * dy + softening * softening);
    }
  }
  return energy;
};

export class FmmSolver2D {
  readonly maxBodies: number;
  readonly maxOrder: number;
  private readonly maxNodes: number;
  private readonly stride: number;
  private readonly order: Int32Array;
  private readonly orderScratch: Int32Array;
  private readonly nodeCx: Float64Array;
  private readonly nodeCy: Float64Array;
  private readonly nodeHalf: Float64Array;
  private readonly nodeStart: Int32Array;
  private readonly nodeBodyCount: Int32Array;
  private readonly nodeDepth: Int16Array;
  private readonly children: Int32Array;
  private readonly multipoles: Float64Array;
  private readonly locals: Float64Array;
  private readonly binomial: Float64Array;
  private readonly powerRe: Float64Array;
  private readonly powerIm: Float64Array;
  private readonly directTargets: Int32Array;
  private readonly directSources: Int32Array;
  private readonly accelerations: Float64Array;
  private positions = new Float64Array(0);
  private masses = new Float64Array(0);
  private orderValue: NBodyExpansionOrder = 8;
  private leafCapacity: NBodyLeafCapacity = 48;
  private gravity = 1;
  private softening = 0.002;
  private nodeCount = 0;
  private directPairCount = 0;
  private deepestNode = 0;
  private m2lInteractions = 0;
  private directInteractions = 0;

  constructor(maxBodies = 4096, maxOrder = 10) {
    this.maxBodies = maxBodies;
    this.maxOrder = maxOrder;
    this.maxNodes = maxBodies * 6 + 16;
    this.stride = maxOrder + 1;
    this.order = new Int32Array(maxBodies);
    this.orderScratch = new Int32Array(maxBodies);
    this.nodeCx = new Float64Array(this.maxNodes);
    this.nodeCy = new Float64Array(this.maxNodes);
    this.nodeHalf = new Float64Array(this.maxNodes);
    this.nodeStart = new Int32Array(this.maxNodes);
    this.nodeBodyCount = new Int32Array(this.maxNodes);
    this.nodeDepth = new Int16Array(this.maxNodes);
    this.children = new Int32Array(this.maxNodes * 4);
    this.multipoles = new Float64Array(this.maxNodes * this.stride * 2);
    this.locals = new Float64Array(this.maxNodes * this.stride * 2);
    this.binomial = new Float64Array(this.stride * this.stride);
    this.powerRe = new Float64Array(this.stride + 2);
    this.powerIm = new Float64Array(this.stride + 2);
    this.directTargets = new Int32Array(maxBodies * 48);
    this.directSources = new Int32Array(maxBodies * 48);
    this.accelerations = new Float64Array(maxBodies * 2);
    for (let n = 0; n <= maxOrder; n += 1) {
      this.binomial[n * this.stride] = 1;
      this.binomial[n * this.stride + n] = 1;
      for (let k = 1; k < n; k += 1) this.binomial[n * this.stride + k] = this.binomial[(n - 1) * this.stride + k - 1]! + this.binomial[(n - 1) * this.stride + k]!;
    }
  }

  compute(positions: Float64Array, masses: Float64Array, options: FmmOptions): { accelerations: Float64Array; metrics: FmmMetrics } {
    if (masses.length > this.maxBodies || positions.length !== masses.length * 2) throw new RangeError('N-body input exceeds the configured FMM capacity.');
    this.positions = positions;
    this.masses = masses;
    this.orderValue = options.expansionOrder;
    this.leafCapacity = options.leafCapacity;
    this.gravity = options.gravity;
    this.softening = options.softening;
    this.nodeCount = 0;
    this.directPairCount = 0;
    this.deepestNode = 0;
    this.m2lInteractions = 0;
    this.directInteractions = 0;
    for (let index = 0; index < masses.length; index += 1) this.order[index] = index;
    this.children.fill(-1);
    this.accelerations.fill(0, 0, positions.length);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < masses.length; index += 1) {
      const offset = index * 2;
      const x = positions[offset]!;
      const y = positions[offset + 1]!;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const half = Math.max(maxX - minX, maxY - minY, 1e-6) * 0.5000001;
    const root = this.buildNode(0, masses.length, cx, cy, half, 0);
    const coefficientCount = this.nodeCount * this.stride * 2;
    this.multipoles.fill(0, 0, coefficientCount);
    this.locals.fill(0, 0, coefficientCount);
    this.upward(root);
    this.interact(root, root);
    this.downward(root);
    this.evaluateLeaves(root);
    this.evaluateDirectPairs();
    return {
      accelerations: this.accelerations.subarray(0, positions.length),
      metrics: {
        treeDepth: this.deepestNode,
        nodeCount: this.nodeCount,
        m2lInteractions: this.m2lInteractions,
        directInteractions: this.directInteractions,
      },
    };
  }

  private buildNode(start: number, count: number, cx: number, cy: number, half: number, depth: number): number {
    const node = this.nodeCount++;
    if (node >= this.maxNodes) throw new RangeError('Adaptive quadtree node capacity exceeded.');
    this.nodeCx[node] = cx; this.nodeCy[node] = cy; this.nodeHalf[node] = half;
    this.nodeStart[node] = start; this.nodeBodyCount[node] = count; this.nodeDepth[node] = depth;
    this.deepestNode = Math.max(this.deepestNode, depth);
    if (count <= this.leafCapacity || depth >= MAX_DEPTH || half < 1e-10) return node;

    let c0 = 0; let c1 = 0; let c2 = 0; let c3 = 0;
    const end = start + count;
    for (let cursor = start; cursor < end; cursor += 1) {
      const body = this.order[cursor]!;
      const quadrant = (this.positions[body * 2]! >= cx ? 1 : 0) + (this.positions[body * 2 + 1]! >= cy ? 2 : 0);
      if (quadrant === 0) c0 += 1; else if (quadrant === 1) c1 += 1; else if (quadrant === 2) c2 += 1; else c3 += 1;
    }
    const o0 = start; const o1 = o0 + c0; const o2 = o1 + c1; const o3 = o2 + c2;
    let w0 = o0; let w1 = o1; let w2 = o2; let w3 = o3;
    for (let cursor = start; cursor < end; cursor += 1) {
      const body = this.order[cursor]!;
      const quadrant = (this.positions[body * 2]! >= cx ? 1 : 0) + (this.positions[body * 2 + 1]! >= cy ? 2 : 0);
      if (quadrant === 0) this.orderScratch[w0++] = body;
      else if (quadrant === 1) this.orderScratch[w1++] = body;
      else if (quadrant === 2) this.orderScratch[w2++] = body;
      else this.orderScratch[w3++] = body;
    }
    this.order.set(this.orderScratch.subarray(start, end), start);
    const childHalf = half * 0.5;
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      const quadrantCount = quadrant === 0 ? c0 : quadrant === 1 ? c1 : quadrant === 2 ? c2 : c3;
      if (quadrantCount === 0) continue;
      const quadrantOffset = quadrant === 0 ? o0 : quadrant === 1 ? o1 : quadrant === 2 ? o2 : o3;
      const childCx = cx + (quadrant & 1 ? childHalf : -childHalf);
      const childCy = cy + (quadrant & 2 ? childHalf : -childHalf);
      this.children[node * 4 + quadrant] = this.buildNode(quadrantOffset, quadrantCount, childCx, childCy, childHalf, depth + 1);
    }
    return node;
  }

  private coefficient(node: number, order: number) { return (node * this.stride + order) * 2; }
  private binom(n: number, k: number) { return this.binomial[n * this.stride + k]!; }
  private isLeaf(node: number) { return this.children[node * 4] === -1 && this.children[node * 4 + 1] === -1 && this.children[node * 4 + 2] === -1 && this.children[node * 4 + 3] === -1; }

  private fillPowers(real: number, imaginary: number, count: number) {
    this.powerRe[0] = 1; this.powerIm[0] = 0;
    for (let order = 1; order <= count; order += 1) {
      const previousReal = this.powerRe[order - 1]!;
      const previousImaginary = this.powerIm[order - 1]!;
      this.powerRe[order] = previousReal * real - previousImaginary * imaginary;
      this.powerIm[order] = previousReal * imaginary + previousImaginary * real;
    }
  }

  private upward(node: number) {
    const base = this.coefficient(node, 0);
    if (this.isLeaf(node)) {
      const start = this.nodeStart[node]!;
      const end = start + this.nodeBodyCount[node]!;
      for (let cursor = start; cursor < end; cursor += 1) {
        const body = this.order[cursor]!;
        const mass = this.masses[body]!;
        this.multipoles[base] = this.multipoles[base]! + mass;
        this.fillPowers(this.positions[body * 2]! - this.nodeCx[node]!, this.positions[body * 2 + 1]! - this.nodeCy[node]!, this.orderValue);
        for (let order = 1; order <= this.orderValue; order += 1) {
          const coefficient = this.coefficient(node, order);
          this.multipoles[coefficient] = this.multipoles[coefficient]! - mass * this.powerRe[order]! / order;
          this.multipoles[coefficient + 1] = this.multipoles[coefficient + 1]! - mass * this.powerIm[order]! / order;
        }
      }
      return;
    }
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      const child = this.children[node * 4 + quadrant]!;
      if (child < 0) continue;
      this.upward(child);
      this.translateMultipole(child, node);
    }
  }

  private translateMultipole(child: number, parent: number) {
    const childZero = this.coefficient(child, 0);
    const parentZero = this.coefficient(parent, 0);
    const mass = this.multipoles[childZero]!;
    this.multipoles[parentZero] = this.multipoles[parentZero]! + mass;
    this.fillPowers(this.nodeCx[child]! - this.nodeCx[parent]!, this.nodeCy[child]! - this.nodeCy[parent]!, this.orderValue);
    for (let order = 1; order <= this.orderValue; order += 1) {
      let real = -mass * this.powerRe[order]! / order;
      let imaginary = -mass * this.powerIm[order]! / order;
      for (let childOrder = 1; childOrder <= order; childOrder += 1) {
        const coefficient = this.coefficient(child, childOrder);
        const powerOrder = order - childOrder;
        const scale = childOrder / order * this.binom(order, childOrder);
        const mr = this.multipoles[coefficient]!;
        const mi = this.multipoles[coefficient + 1]!;
        const pr = this.powerRe[powerOrder]!;
        const pi = this.powerIm[powerOrder]!;
        real += scale * (mr * pr - mi * pi);
        imaginary += scale * (mr * pi + mi * pr);
      }
      const target = this.coefficient(parent, order);
      this.multipoles[target] = this.multipoles[target]! + real;
      this.multipoles[target + 1] = this.multipoles[target + 1]! + imaginary;
    }
  }

  private interact(target: number, source: number) {
    const dx = this.nodeCx[target]! - this.nodeCx[source]!;
    const dy = this.nodeCy[target]! - this.nodeCy[source]!;
    const distanceSquared = dx * dx + dy * dy;
    const required = SEPARATION_RATIO * (this.nodeHalf[target]! + this.nodeHalf[source]!);
    if (target !== source && distanceSquared > required * required) {
      this.translateToLocal(target, source, dx, dy);
      this.m2lInteractions += 1;
      return;
    }
    const targetLeaf = this.isLeaf(target);
    const sourceLeaf = this.isLeaf(source);
    if (targetLeaf && sourceLeaf) {
      if (this.directPairCount >= this.directTargets.length) throw new RangeError('FMM near-field interaction capacity exceeded.');
      this.directTargets[this.directPairCount] = target;
      this.directSources[this.directPairCount] = source;
      this.directPairCount += 1;
      return;
    }
    if (!targetLeaf && (sourceLeaf || this.nodeHalf[target]! >= this.nodeHalf[source]!)) {
      for (let quadrant = 0; quadrant < 4; quadrant += 1) {
        const child = this.children[target * 4 + quadrant]!;
        if (child >= 0) this.interact(child, source);
      }
    } else {
      for (let quadrant = 0; quadrant < 4; quadrant += 1) {
        const child = this.children[source * 4 + quadrant]!;
        if (child >= 0) this.interact(target, child);
      }
    }
  }

  private translateToLocal(target: number, source: number, dx: number, dy: number) {
    const denominator = dx * dx + dy * dy;
    this.fillPowers(dx / denominator, -dy / denominator, this.orderValue);
    const mass = this.multipoles[this.coefficient(source, 0)]!;
    for (let localOrder = 1; localOrder <= this.orderValue; localOrder += 1) {
      const logSign = localOrder % 2 === 1 ? 1 : -1;
      let real = logSign * mass * this.powerRe[localOrder]! / localOrder;
      let imaginary = logSign * mass * this.powerIm[localOrder]! / localOrder;
      const multipoleSign = localOrder % 2 === 0 ? 1 : -1;
      for (let sourceOrder = 1; sourceOrder + localOrder <= this.orderValue; sourceOrder += 1) {
        const sourceCoefficient = this.coefficient(source, sourceOrder);
        const mr = this.multipoles[sourceCoefficient]!;
        const mi = this.multipoles[sourceCoefficient + 1]!;
        const powerOrder = sourceOrder + localOrder;
        const pr = this.powerRe[powerOrder]!;
        const pi = this.powerIm[powerOrder]!;
        const scale = multipoleSign * this.binom(sourceOrder + localOrder - 1, localOrder);
        real += scale * (mr * pr - mi * pi);
        imaginary += scale * (mr * pi + mi * pr);
      }
      const targetCoefficient = this.coefficient(target, localOrder);
      this.locals[targetCoefficient] = this.locals[targetCoefficient]! + real;
      this.locals[targetCoefficient + 1] = this.locals[targetCoefficient + 1]! + imaginary;
    }
  }

  private downward(node: number) {
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      const child = this.children[node * 4 + quadrant]!;
      if (child < 0) continue;
      this.translateLocal(node, child);
      this.downward(child);
    }
  }

  private translateLocal(parent: number, child: number) {
    this.fillPowers(this.nodeCx[child]! - this.nodeCx[parent]!, this.nodeCy[child]! - this.nodeCy[parent]!, this.orderValue);
    for (let localOrder = 1; localOrder <= this.orderValue; localOrder += 1) {
      let real = 0;
      let imaginary = 0;
      for (let parentOrder = localOrder; parentOrder <= this.orderValue; parentOrder += 1) {
        const coefficient = this.coefficient(parent, parentOrder);
        const lr = this.locals[coefficient]!;
        const li = this.locals[coefficient + 1]!;
        const powerOrder = parentOrder - localOrder;
        const pr = this.powerRe[powerOrder]!;
        const pi = this.powerIm[powerOrder]!;
        const scale = this.binom(parentOrder, localOrder);
        real += scale * (lr * pr - li * pi);
        imaginary += scale * (lr * pi + li * pr);
      }
      const target = this.coefficient(child, localOrder);
      this.locals[target] = this.locals[target]! + real;
      this.locals[target + 1] = this.locals[target + 1]! + imaginary;
    }
  }

  private evaluateLeaves(node: number) {
    if (!this.isLeaf(node)) {
      for (let quadrant = 0; quadrant < 4; quadrant += 1) {
        const child = this.children[node * 4 + quadrant]!;
        if (child >= 0) this.evaluateLeaves(child);
      }
      return;
    }
    const start = this.nodeStart[node]!;
    const end = start + this.nodeBodyCount[node]!;
    for (let cursor = start; cursor < end; cursor += 1) {
      const body = this.order[cursor]!;
      const bodyOffset = body * 2;
      this.fillPowers(this.positions[bodyOffset]! - this.nodeCx[node]!, this.positions[bodyOffset + 1]! - this.nodeCy[node]!, this.orderValue - 1);
      let fieldReal = 0;
      let fieldImaginary = 0;
      for (let order = 1; order <= this.orderValue; order += 1) {
        const coefficient = this.coefficient(node, order);
        const lr = this.locals[coefficient]!;
        const li = this.locals[coefficient + 1]!;
        const pr = this.powerRe[order - 1]!;
        const pi = this.powerIm[order - 1]!;
        fieldReal += order * (lr * pr - li * pi);
        fieldImaginary += order * (lr * pi + li * pr);
      }
      this.accelerations[bodyOffset] = -this.gravity * fieldReal;
      this.accelerations[bodyOffset + 1] = this.gravity * fieldImaginary;
    }
  }

  private evaluateDirectPairs() {
    const epsilonSquared = this.softening * this.softening;
    for (let pair = 0; pair < this.directPairCount; pair += 1) {
      const targetNode = this.directTargets[pair]!;
      const sourceNode = this.directSources[pair]!;
      const targetStart = this.nodeStart[targetNode]!;
      const targetEnd = targetStart + this.nodeBodyCount[targetNode]!;
      const sourceStart = this.nodeStart[sourceNode]!;
      const sourceEnd = sourceStart + this.nodeBodyCount[sourceNode]!;
      for (let targetCursor = targetStart; targetCursor < targetEnd; targetCursor += 1) {
        const target = this.order[targetCursor]!;
        const targetOffset = target * 2;
        let ax = this.accelerations[targetOffset]!;
        let ay = this.accelerations[targetOffset + 1]!;
        for (let sourceCursor = sourceStart; sourceCursor < sourceEnd; sourceCursor += 1) {
          const source = this.order[sourceCursor]!;
          if (source === target) continue;
          const sourceOffset = source * 2;
          const dx = this.positions[targetOffset]! - this.positions[sourceOffset]!;
          const dy = this.positions[targetOffset + 1]! - this.positions[sourceOffset + 1]!;
          const scale = -this.gravity * this.masses[source]! / (dx * dx + dy * dy + epsilonSquared);
          ax += scale * dx;
          ay += scale * dy;
          this.directInteractions += 1;
        }
        this.accelerations[targetOffset] = ax;
        this.accelerations[targetOffset + 1] = ay;
      }
    }
  }

  writeLeafBounds(output: Float32Array) {
    let count = 0;
    for (let node = 0; node < this.nodeCount && (count + 1) * 3 <= output.length; node += 1) {
      if (!this.isLeaf(node)) continue;
      const offset = count * 3;
      output[offset] = this.nodeCx[node]!;
      output[offset + 1] = this.nodeCy[node]!;
      output[offset + 2] = this.nodeHalf[node]!;
      count += 1;
    }
    return count;
  }
}
