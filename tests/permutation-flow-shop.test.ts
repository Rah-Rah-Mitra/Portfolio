import { describe, expect, it } from 'vitest';
import {
  START_ORDER,
  TEACHING_INSTANCE,
  analyze,
  cds,
  evaluate,
  exhaustive,
  explain,
  generateInstance,
  johnson,
  johnsonDominance,
  lowerBound,
  makespanOf,
  moveJob,
  neh,
  orderLabel,
  ordersSooner,
  taillardUniform,
  type FlowShopInstance,
  type Range,
} from '../lib/permutationFlowShop';

// Known answers for FIG. 05d. The literature block pins the generator and the
// tie rules against Taillard (1993); everything else was reproduced by an
// independent scratch implementation before the bench was built on it.

const TA_SEEDS = [873654221, 379008056, 1866992158, 216771124, 495070989, 402959317, 1369363414, 2021925980, 573109518, 88325120];
const TA_RANGES: Range[] = Array.from({ length: 5 }, () => [1, 99] as const);
const U19: Range[] = [[1, 9], [1, 9], [1, 9]];

// A bare two-machine instance for Johnson's rule.
const pair = (a: number[], b: number[]): FlowShopInstance => ({
  seed: 1,
  ranges: [[1, 9], [1, 9]],
  jobs: a.map((_, j) => String.fromCharCode(65 + j)),
  machines: ['M1', 'M2'],
  p: a.map((v, j) => [v, b[j]]),
});

const permutations = (n: number): number[][] => {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((rest) => Array.from({ length: n }, (_, at) => [...rest.slice(0, at), n - 1, ...rest.slice(at)]));
};

const INST = TEACHING_INSTANCE;
const ANALYSIS = analyze(INST);
const at = (letters: string) => letters.split(' ').map((l) => INST.jobs.indexOf(l));

describe('Taillard (1993) generator and bounds', () => {
  it('reproduces the ta001 processing times', () => {
    const ta001 = generateInstance(873654221, 20, TA_RANGES);
    expect(ta001.p.map((pj) => pj[0])).toEqual([54, 83, 15, 71, 77, 36, 53, 38, 27, 87, 76, 91, 14, 29, 12, 77, 32, 87, 68, 94]);
    expect(ta001.p.slice(0, 5).map((pj) => pj[1])).toEqual([79, 3, 11, 99, 56]);
  });

  it('rejects seeds outside [1, 2^31 − 2]', () => {
    expect(() => taillardUniform(0)).toThrow(RangeError);
    expect(() => taillardUniform(2147483647)).toThrow(RangeError);
    expect(() => taillardUniform(2147483646)).not.toThrow();
  });

  it("matches Taillard's published lower bounds for ta001–ta010", () => {
    const bounds = TA_SEEDS.map((seed) => lowerBound(generateInstance(seed, 20, TA_RANGES)).value);
    expect(bounds).toEqual([1232, 1290, 1073, 1268, 1198, 1180, 1226, 1170, 1206, 1082]);
  });

  it('pins NEH on ta001–ta010 under the stated tie rules (ta001 = 1286 is the cited value)', () => {
    const nehs = TA_SEEDS.map((seed) => neh(generateInstance(seed, 20, TA_RANGES)).makespan);
    expect(nehs).toEqual([1286, 1365, 1159, 1325, 1305, 1228, 1278, 1223, 1291, 1151]);
  });
});

describe("Johnson's rule", () => {
  it('solves the textbook instance', () => {
    const a = [3, 5, 1, 6, 7];
    const b = [6, 2, 2, 6, 5];
    const order = johnson(a, b);
    expect(order).toEqual([2, 0, 3, 4, 1]);
    expect(makespanOf(pair(a, b), order)).toBe(24);
    expect(exhaustive(pair(a, b)).makespan).toBe(24);
  });

  it('solves the retired three-job toy', () => {
    const order = johnson([3, 6, 4], [7, 2, 5]);
    expect(order).toEqual([0, 2, 1]);
    expect(makespanOf(pair([3, 6, 4], [7, 2, 5]), order)).toBe(17);
  });

  it('is exact on two machines (200 seeded instances)', () => {
    for (let s = 1; s <= 200; s += 1) {
      const inst = generateInstance(s * 7919, 6, [[1, 20], [1, 20]]);
      const order = johnson(inst.p.map((pj) => pj[0]), inst.p.map((pj) => pj[1]));
      expect(makespanOf(inst, order)).toBe(exhaustive(inst).makespan);
    }
  });
});

describe("Johnson's three-machine dominance condition", () => {
  const instances = (base: number, ranges: Range[]) =>
    Array.from({ length: 60 }, (_, s) => generateInstance(base + (s + 1) * 7919, 6, ranges));

  it('makes the M1+M2 | M2+M3 fold optimal whenever it holds', () => {
    for (const inst of [...instances(5000, [[5, 9], [1, 4], [3, 9]]), ...instances(7000, [[1, 9], [1, 3], [3, 9]])]) {
      expect(johnsonDominance(inst).holds).toBe(true);
      expect(cds(inst).folds[1].makespan).toBe(exhaustive(inst).makespan);
    }
  });

  it('is only sufficient: without it the same fold can miss', () => {
    const misses = instances(9000, U19).filter((inst) => cds(inst).folds[1].makespan > exhaustive(inst).makespan);
    expect(misses.length).toBeGreaterThan(0);
  });
});

describe('general invariants (60 seeded F3 instances)', () => {
  it('orders bound ≤ optimum ≤ every heuristic, and counts all 720 orders', () => {
    for (let s = 1; s <= 60; s += 1) {
      const inst = generateInstance(1000 + s * 7919, 6, U19);
      const opt = exhaustive(inst);
      expect(lowerBound(inst).value).toBeLessThanOrEqual(opt.makespan);
      expect(opt.makespan).toBeLessThanOrEqual(neh(inst).makespan);
      expect(opt.makespan).toBeLessThanOrEqual(cds(inst).makespan);
      expect(opt.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(720);
      expect(opt.total).toBe(720);
    }
  });
});

describe('the teaching instance', () => {
  it('is the seeded 6 × 3 instance the bench describes', () => {
    expect(INST.p).toEqual([[6, 8, 5], [2, 7, 4], [4, 3, 6], [1, 9, 9], [2, 2, 5], [8, 1, 7]]);
    expect(INST.jobs).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(INST.machines).toEqual(['M1', 'M2', 'M3']);
    expect(START_ORDER).toEqual([0, 1, 2, 3, 4, 5]);
    expect(ANALYSIS.loads).toEqual([23, 30, 36]);
    expect(ANALYSIS.busiest).toBe(2);
    expect(ANALYSIS.dominance).toEqual({ holds: false, minM1: 1, maxM2: 9, minM3: 4 });
    expect(ANALYSIS.quickestToLast).toEqual({ job: 4, time: 4 });
  });

  it('evaluates the start order to 54 with the published Gantt', () => {
    const s = evaluate(INST, START_ORDER);
    expect(s.makespan).toBe(54);
    const table = INST.jobs.map((_, j) => s.ops.filter((op) => op.job === j).map((op) => `${op.start}-${op.end}`).join('/'));
    expect(table).toEqual([
      '0-6/6-14/14-19', '6-8/14-21/21-25', '8-12/21-24/25-31',
      '12-13/24-33/33-42', '13-15/33-35/42-47', '15-23/35-36/47-54',
    ]);
    expect(s.machines[2]).toEqual({
      load: 36, leadIn: 14,
      gaps: [{ before: 1, start: 19, length: 2 }, { before: 3, start: 31, length: 2 }],
      gapTotal: 4, tail: 0, waiting: 18,
    });
    expect(s.machines[0]).toMatchObject({ leadIn: 0, tail: 31 });
    expect(s.machines[1]).toMatchObject({ leadIn: 6, gaps: [], tail: 18 });
    expect(s.criticalPath.map(({ position, machine }) => [position, machine])).toEqual(
      [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [3, 2], [4, 2], [5, 2]],
    );
  });

  it('gives each classic method its own makespan', () => {
    expect(ANALYSIS.cds).toMatchObject({ order: [3, 1, 4, 2, 5, 0], makespan: 46, fold: 1 });
    expect(ANALYSIS.cds.folds[1]).toEqual({ fold: 2, order: [4, 2, 1, 3, 0, 5], makespan: 46 });
    expect(ANALYSIS.neh).toEqual({ order: [4, 2, 3, 1, 5, 0], makespan: 43, priority: [0, 3, 5, 1, 2, 4] });
    const { histogram, ...opt } = ANALYSIS.optimum;
    expect(opt).toEqual({ order: [4, 2, 1, 5, 3, 0], makespan: 41, optimalCount: 1, worst: 58, total: 720 });
    expect(Object.fromEntries(histogram.map((bin) => [bin.makespan, bin.count]))).toEqual({
      41: 1, 42: 4, 43: 12, 44: 35, 45: 50, 46: 157, 47: 76, 48: 56, 49: 48,
      50: 109, 51: 42, 52: 45, 53: 25, 54: 36, 55: 14, 56: 2, 57: 6, 58: 2,
    });
    expect(ANALYSIS.bound).toEqual({ value: 40, machine: 2, head: 4, headJob: 4, load: 36, tail: 0, machineBound: 40, jobBound: 19 });
  });

  it('walks the optimal critical path E1 C1 C2 B2 B3 F3 D3 A3', () => {
    const s = evaluate(INST, ANALYSIS.optimum.order);
    const names = s.criticalPath.map(({ position, machine }) => `${INST.jobs[s.order[position]]}${machine + 1}`);
    expect(names.join(' ')).toBe('E1 C1 C2 B2 B3 F3 D3 A3');
    expect(s.machines[2]).toMatchObject({ leadIn: 4, gaps: [{ before: 1, start: 15, length: 1 }] });
  });

  it('keeps a strict ladder from bound to worst', () => {
    const ladder = [ANALYSIS.bound.value, ANALYSIS.optimum.makespan, ANALYSIS.neh.makespan, ANALYSIS.cds.makespan, ANALYSIS.start.makespan, ANALYSIS.optimum.worst];
    expect(ladder).toEqual([40, 41, 43, 46, 54, 58]);
  });

  it('counts the orders that finish strictly sooner', () => {
    const sooner = [54, 50, 47, 46, 44, 43, 41].map((c) => ordersSooner(ANALYSIS.optimum, c));
    expect(sooner).toEqual([660, 439, 259, 102, 17, 5, 0]);
  });

  it('holds every schedule identity across all 720 orders', () => {
    for (const order of permutations(6)) {
      const s = evaluate(INST, order);
      expect(s.makespan).toBe(makespanOf(INST, order));
      expect(s.makespan).toBeGreaterThanOrEqual(40);
      for (const line of s.machines) expect(line.leadIn + line.load + line.gapTotal + line.tail).toBe(s.makespan);
      expect(s.machines[2].tail).toBe(0);

      const path = s.criticalPath;
      expect(path).toHaveLength(8);
      expect(path[0]).toEqual({ position: 0, machine: 0 });
      expect(path[7]).toEqual({ position: 5, machine: 2 });
      const opAt = ({ position, machine }: { position: number; machine: number }) => s.ops[position * 3 + machine];
      let length = 0;
      path.forEach((step, i) => {
        const op = opAt(step);
        expect(op.critical).toBe(true);
        length += op.end - op.start;
        if (i === 0) return;
        const prev = path[i - 1];
        expect((step.position - prev.position) + (step.machine - prev.machine)).toBe(1);
        expect(step.position >= prev.position && step.machine >= prev.machine).toBe(true);
        expect(op.start).toBe(opAt(prev).end);
      });
      expect(length).toBe(s.makespan);
      expect(s.ops.filter((op) => op.critical)).toHaveLength(8);
    }
  });
});

describe('explain()', () => {
  const say = (order: readonly number[]) => explain(ANALYSIS, evaluate(INST, order));

  it('narrates the start order', () => {
    expect(say(START_ORDER)).toEqual({
      headline: "Makespan 54 = M3's 36 units of work + 18 units of M3 waiting.",
      detail: 'It waits 14 at the start while job A clears M1 and M2 (6 + 8); job E would get there in 4. Between jobs it waits 4 more — the longest, 2, for job B to clear M2.',
    });
  });

  it('narrates CDS', () => {
    expect(say(ANALYSIS.cds.order)).toEqual({
      headline: "Makespan 46 = M3's 36 units of work + 10 units of M3 waiting.",
      detail: 'It waits 10 at the start while job D clears M1 and M2 (1 + 9); job E would get there in 4. It never waits between jobs.',
    });
  });

  it('narrates NEH, with no quicker-job clause on a tie', () => {
    expect(say(ANALYSIS.neh.order)).toEqual({
      headline: "Makespan 43 = M3's 36 units of work + 7 units of M3 waiting.",
      detail: 'It waits 4 at the start while job E clears M1 and M2 (2 + 2). Between jobs it waits 3 more, for job D to clear M2.',
    });
  });

  it('narrates the optimum', () => {
    expect(say(ANALYSIS.optimum.order)).toEqual({
      headline: "Makespan 41 = M3's 36 units of work + 5 units of M3 waiting.",
      detail: 'It waits 4 at the start while job E clears M1 and M2 (2 + 2). Between jobs it waits 1 more, for job B to clear M2. No order finishes sooner.',
    });
  });
});

describe('moves and validation', () => {
  it('moves a job without mutating the input', () => {
    const start = [...START_ORDER];
    expect(moveJob(start, 0, 5)).toEqual([1, 2, 3, 4, 5, 0]);
    expect(makespanOf(INST, moveJob(start, 0, 5))).toBe(47);
    expect(makespanOf(INST, moveJob(start, 0, 1))).toBe(50);
    expect(makespanOf(INST, moveJob(start, 0, 2))).toBe(50);
    expect(makespanOf(INST, moveJob(start, 0, 3))).toBe(47);
    expect(makespanOf(INST, at('E B C D F A'))).toBe(44);
    expect(start).toEqual([0, 1, 2, 3, 4, 5]);
    const copy = moveJob(start, 0, 9);
    expect(copy).toEqual(start);
    expect(copy).not.toBe(start);
    expect(moveJob(start, -1, 2)).toEqual(start);
  });

  it('reaches the optimum from NEH by moving D right twice', () => {
    expect(makespanOf(INST, at('E C B D F A'))).toBe(46);
    expect(makespanOf(INST, at('E C B F D A'))).toBe(41);
  });

  it('rejects orders that are not permutations, and oversized exhaustive runs', () => {
    expect(() => evaluate(INST, [0, 0, 1, 2, 3, 4])).toThrow(RangeError);
    expect(() => evaluate(INST, [0, 1, 2, 3, 4])).toThrow(RangeError);
    expect(() => exhaustive(generateInstance(42, 9, U19))).toThrow(RangeError);
  });

  it('labels an order by job letters', () => {
    expect(orderLabel(INST, ANALYSIS.optimum.order)).toBe('E C B F D A');
    expect(orderLabel(INST, START_ORDER, '')).toBe('ABCDEF');
  });
});
