// Permutation flow shop F | prmu | Cmax — the model behind FIG. 05d.
//
// n jobs each visit M1 → M2 → … → Mm, and every machine takes them in ONE
// shared order π. All jobs are released at 0, buffers are unlimited, there is
// no pre-emption and there are no setups. Times are integers in abstract units.
// Data is p[job][machine].
//
// Pure on purpose: no imports, no React, no DOM. The bench evaluates all 720
// orders of its six-job instance at module load, and that includes prerender.
//
// Tie rules are load-bearing — they are what make the published Taillard
// values below reproduce, and what keeps every sentence explain() writes true:
//  - Johnson: a = b goes to the second group; ties inside a group by index.
//  - CDS: the smaller fold wins a tie.
//  - NEH: stable priority (index breaks ties), first strictly-best insertion.
//  - exhaustive: the first minimum in lexicographic order is "the" optimum.
//  - critical path: on a tie, step back along the same machine.
//  - lower bound: first binding machine, lowest-index head job.
//  - explain(): the earliest of equally long gaps.

export type Range = readonly [number, number];

export interface FlowShopInstance {
  readonly seed: number;
  readonly ranges: readonly Range[];
  readonly jobs: readonly string[];
  readonly machines: readonly string[];
  readonly p: readonly (readonly number[])[];
}

// Taillard (1993), "Benchmarks for basic scheduling problems": a Lehmer LCG
// (a = 16807, m = 2^31 − 1) stepped with Schrage's method so it never
// overflows 32 bits, then scaled onto [lo, hi].
const LCG_M = 2147483647;

export function taillardUniform(seed: number): (lo: number, hi: number) => number {
  if (!Number.isInteger(seed) || seed < 1 || seed > LCG_M - 1) {
    throw new RangeError(`Taillard seeds lie in [1, 2^31 − 2]; got ${seed}.`);
  }
  let x = seed;
  return (lo, hi) => {
    const k = Math.floor(x / 127773);
    x = 16807 * (x % 127773) - k * 2836;
    if (x < 0) x += LCG_M;
    return lo + Math.floor((x / LCG_M) * (hi - lo + 1));
  };
}

const jobName = (j: number) => (j < 26 ? String.fromCharCode(65 + j) : `J${j + 1}`);

// Draws are machine-major (every job on M1, then every job on M2, …), exactly
// as Taillard generated ta001–ta120.
export function generateInstance(seed: number, jobCount: number, ranges: readonly Range[]): FlowShopInstance {
  const unif = taillardUniform(seed);
  const p = Array.from({ length: jobCount }, () => new Array<number>(ranges.length).fill(0));
  ranges.forEach(([lo, hi], k) => {
    for (let j = 0; j < jobCount; j += 1) p[j][k] = unif(lo, hi);
  });
  return {
    seed,
    ranges,
    jobs: Array.from({ length: jobCount }, (_, j) => jobName(j)),
    machines: ranges.map((_, k) => `M${k + 1}`),
    p,
  };
}

// Found by a scan: the busiest machine is unique and sets the bound, and
// LB < OPT < NEH < CDS < START holds strictly with a single optimal order.
// The bench's caption discloses that the seed was picked.
export const TEACHING_SEED = 20263570;
export const TEACHING_INSTANCE: FlowShopInstance = generateInstance(TEACHING_SEED, 6, [[1, 9], [1, 9], [1, 9]]);
export const START_ORDER: readonly number[] = TEACHING_INSTANCE.jobs.map((_, j) => j);

export interface Operation { position: number; job: number; machine: number; start: number; end: number; critical: boolean }
export interface Gap { before: number; start: number; length: number }
export interface MachineLine { load: number; leadIn: number; gaps: Gap[]; gapTotal: number; tail: number; waiting: number }
export interface Schedule {
  order: number[];
  /** Position-major, then machine. */
  ops: Operation[];
  makespan: number;
  machines: MachineLine[];
  criticalPath: { position: number; machine: number }[];
}

export function isPermutation(order: readonly number[], n: number): boolean {
  if (order.length !== n) return false;
  const seen = new Array<boolean>(n).fill(false);
  for (const j of order) {
    if (!Number.isInteger(j) || j < 0 || j >= n || seen[j]) return false;
    seen[j] = true;
  }
  return true;
}

// Hot path for the 720-order enumeration: one rolling row, no validation.
// Also scores partial orders, which is what NEH needs.
export function makespanOf(inst: FlowShopInstance, order: readonly number[]): number {
  const m = inst.machines.length;
  const c = new Array<number>(m).fill(0);
  for (const j of order) {
    const pj = inst.p[j];
    c[0] += pj[0];
    for (let k = 1; k < m; k += 1) c[k] = Math.max(c[k], c[k - 1]) + pj[k];
  }
  return c[m - 1] ?? 0;
}

// C(i,k) = max(C(i−1,k), C(i,k−1)) + p(π_i,k). Per machine, the identity
// leadIn + load + gapTotal + tail = Cmax holds and the last machine's tail is
// 0, so Cmax = load(Mm) + waiting(Mm): the order can only change the waiting.
export function evaluate(inst: FlowShopInstance, order: readonly number[]): Schedule {
  const n = inst.jobs.length;
  const m = inst.machines.length;
  if (!isPermutation(order, n)) throw new RangeError(`An order must be a permutation of 0..${n - 1}.`);

  const C = order.map(() => new Array<number>(m).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < m; k += 1) {
      const up = i > 0 ? C[i - 1][k] : 0;
      const left = k > 0 ? C[i][k - 1] : 0;
      C[i][k] = Math.max(up, left) + inst.p[order[i]][k];
    }
  }
  const makespan = C[n - 1][m - 1];

  // Canonical critical path: backtrack from the last operation, preferring the
  // same machine on a tie. Consecutive steps are back-to-back by construction.
  const path: { position: number; machine: number }[] = [];
  for (let i = n - 1, k = m - 1; ; ) {
    path.push({ position: i, machine: k });
    if (i === 0 && k === 0) break;
    if (i > 0 && k > 0) {
      if (C[i - 1][k] >= C[i][k - 1]) i -= 1;
      else k -= 1;
    } else if (i > 0) i -= 1;
    else k -= 1;
  }
  path.reverse();
  const onPath = new Set(path.map(({ position, machine }) => position * m + machine));

  const ops: Operation[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < m; k += 1) {
      const p = inst.p[order[i]][k];
      ops.push({ position: i, job: order[i], machine: k, start: C[i][k] - p, end: C[i][k], critical: onPath.has(i * m + k) });
    }
  }

  const machines: MachineLine[] = inst.machines.map((_, k) => {
    let load = 0;
    for (let j = 0; j < n; j += 1) load += inst.p[j][k];
    const leadIn = C[0][k] - inst.p[order[0]][k];
    const gaps: Gap[] = [];
    for (let i = 1; i < n; i += 1) {
      const start = C[i][k] - inst.p[order[i]][k];
      const length = start - C[i - 1][k];
      if (length > 0) gaps.push({ before: order[i], start: C[i - 1][k], length });
    }
    const gapTotal = gaps.reduce((sum, gap) => sum + gap.length, 0);
    return { load, leadIn, gaps, gapTotal, tail: makespan - C[n - 1][k], waiting: leadIn + gapTotal };
  });

  return { order: [...order], ops, makespan, machines, criticalPath: path };
}

export function moveJob(order: readonly number[], from: number, to: number): number[] {
  const next = [...order];
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < order.length;
  if (!inRange(from) || !inRange(to) || from === to) return next;
  const [job] = next.splice(from, 1);
  next.splice(to, 0, job);
  return next;
}

export function sameOrder(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((job, i) => job === b[i]);
}

// Johnson (1954): exact for two machines.
export function johnson(a: readonly number[], b: readonly number[]): number[] {
  const ids = a.map((_, j) => j);
  const first = ids.filter((j) => a[j] < b[j]).sort((x, y) => a[x] - a[y] || x - y);
  const second = ids.filter((j) => a[j] >= b[j]).sort((x, y) => b[y] - b[x] || x - y);
  return [...first, ...second];
}

export interface CdsResult { order: number[]; makespan: number; fold: number; folds: { fold: number; order: number[]; makespan: number }[] }

// Campbell, Dudek & Smith (1970): fold m machines into two m − 1 ways, run
// Johnson on each pseudo-pair, and score every candidate on the real shop.
export function cds(inst: FlowShopInstance): CdsResult {
  const m = inst.machines.length;
  const folds: CdsResult['folds'] = [];
  for (let fold = 1; fold < m; fold += 1) {
    const a = inst.p.map((pj) => pj.slice(0, fold).reduce((s, v) => s + v, 0));
    const b = inst.p.map((pj) => pj.slice(m - fold).reduce((s, v) => s + v, 0));
    const order = johnson(a, b);
    folds.push({ fold, order, makespan: makespanOf(inst, order) });
  }
  const best = folds.reduce((keep, f) => (f.makespan < keep.makespan ? f : keep), folds[0]);
  return { order: [...best.order], makespan: best.makespan, fold: best.fold, folds };
}

export interface NehResult { order: number[]; makespan: number; priority: number[] }

// Nawaz, Enscore & Ham (1983): largest total work first, each job slotted
// where the partial schedule stays shortest.
export function neh(inst: FlowShopInstance): NehResult {
  const total = inst.p.map((pj) => pj.reduce((s, v) => s + v, 0));
  const priority = inst.jobs.map((_, j) => j).sort((x, y) => total[y] - total[x] || x - y);
  let order: number[] = [];
  for (const job of priority) {
    let best: number[] = [];
    let bestC = Infinity;
    for (let at = 0; at <= order.length; at += 1) {
      const trial = [...order.slice(0, at), job, ...order.slice(at)];
      const c = makespanOf(inst, trial);
      if (c < bestC) {
        bestC = c;
        best = trial;
      }
    }
    order = best;
  }
  return { order, makespan: makespanOf(inst, order), priority };
}

export interface ExhaustiveResult {
  order: number[];
  makespan: number;
  optimalCount: number;
  worst: number;
  total: number;
  histogram: { makespan: number; count: number }[];
}

// Every order, lexicographically from the identity. For F2 and F3 some
// optimal schedule keeps one shared order (Johnson 1954, and the standard
// M(m−1)/Mm exchange argument), so this optimum holds over ALL schedules.
export function exhaustive(inst: FlowShopInstance, maxJobs = 8): ExhaustiveResult {
  const n = inst.jobs.length;
  if (n > maxJobs) throw new RangeError(`Exhaustive search is capped at ${maxJobs} jobs; this instance has ${n}.`);
  const perm = inst.jobs.map((_, j) => j);
  const counts = new Map<number, number>();
  let order = [...perm];
  let best = Infinity;
  let optimalCount = 0;
  let worst = -Infinity;
  let total = 0;
  for (;;) {
    const c = makespanOf(inst, perm);
    total += 1;
    counts.set(c, (counts.get(c) ?? 0) + 1);
    if (c < best) {
      best = c;
      order = [...perm];
      optimalCount = 1;
    } else if (c === best) optimalCount += 1;
    if (c > worst) worst = c;

    // Next permutation in lexicographic order.
    let i = n - 2;
    while (i >= 0 && perm[i] >= perm[i + 1]) i -= 1;
    if (i < 0) break;
    let j = n - 1;
    while (perm[j] <= perm[i]) j -= 1;
    [perm[i], perm[j]] = [perm[j], perm[i]];
    for (let lo = i + 1, hi = n - 1; lo < hi; lo += 1, hi -= 1) [perm[lo], perm[hi]] = [perm[hi], perm[lo]];
  }
  const histogram: ExhaustiveResult['histogram'] = [];
  for (let c = best; c <= worst; c += 1) histogram.push({ makespan: c, count: counts.get(c) ?? 0 });
  return { order, makespan: best, optimalCount, worst, total, histogram };
}

export interface LowerBound {
  value: number;
  machine: number;
  head: number;
  headJob: number;
  load: number;
  tail: number;
  machineBound: number;
  jobBound: number;
}

// Taillard (1993): machine k cannot start before the quickest job clears
// M1..M(k−1), must then do its whole load, and the last job off it still has
// the quickest possible run through M(k+1)..Mm. No job is shorter than its own
// total either. Reproduces the published bounds of ta001–ta010.
export function lowerBound(inst: FlowShopInstance): LowerBound {
  const m = inst.machines.length;
  const sum = (pj: readonly number[], from: number, to: number) => pj.slice(from, to).reduce((s, v) => s + v, 0);
  let bound: Omit<LowerBound, 'value' | 'jobBound'> | null = null;
  for (let k = 0; k < m; k += 1) {
    let head = Infinity;
    let headJob = 0;
    let tail = Infinity;
    let load = 0;
    inst.p.forEach((pj, j) => {
      const h = sum(pj, 0, k);
      if (h < head) {
        head = h;
        headJob = j;
      }
      tail = Math.min(tail, sum(pj, k + 1, m));
      load += pj[k];
    });
    const machineBound = head + load + tail;
    if (!bound || machineBound > bound.machineBound) bound = { machine: k, head, headJob, load, tail, machineBound };
  }
  const jobBound = Math.max(...inst.p.map((pj) => sum(pj, 0, m)));
  const b = bound as Omit<LowerBound, 'value' | 'jobBound'>;
  return { value: Math.max(b.machineBound, jobBound), ...b, jobBound };
}

export interface Dominance { holds: boolean; minM1: number; maxM2: number; minM3: number }

// Johnson's three-machine condition: when M2 never dominates (its longest step
// is no longer than M1's shortest or M3's shortest), the M1+M2 | M2+M3 fold is
// optimal. Sufficient, not necessary.
export function johnsonDominance(inst: FlowShopInstance): Dominance {
  if (inst.machines.length !== 3) throw new RangeError('The dominance condition is stated for three machines.');
  const col = (k: number) => inst.p.map((pj) => pj[k]);
  const minM1 = Math.min(...col(0));
  const maxM2 = Math.max(...col(1));
  const minM3 = Math.min(...col(2));
  return { holds: minM1 >= maxM2 || minM3 >= maxM2, minM1, maxM2, minM3 };
}

export function ordersSooner(ex: ExhaustiveResult, makespan: number): number {
  return ex.histogram.reduce((sum, bin) => sum + (bin.makespan < makespan ? bin.count : 0), 0);
}

export interface Analysis {
  instance: FlowShopInstance;
  start: { order: number[]; makespan: number };
  cds: CdsResult;
  neh: NehResult;
  optimum: ExhaustiveResult;
  bound: LowerBound;
  loads: number[];
  busiest: number;
  quickestToLast: { job: number; time: number };
  dominance: Dominance;
}

// Everything the bench prints that does not depend on the visitor's order.
// For small three-machine instances: exhaustive() caps n, and the dominance
// condition is stated for m = 3.
export function analyze(inst: FlowShopInstance): Analysis {
  const m = inst.machines.length;
  const startOrder = inst.jobs.map((_, j) => j);
  const loads = inst.machines.map((_, k) => inst.p.reduce((s, pj) => s + pj[k], 0));
  const busiest = loads.reduce((keep, load, k) => (load > loads[keep] ? k : keep), 0);
  const upstream = inst.p.map((pj) => pj.slice(0, m - 1).reduce((s, v) => s + v, 0));
  const quick = upstream.reduce((keep, t, j) => (t < upstream[keep] ? j : keep), 0);
  return {
    instance: inst,
    start: { order: startOrder, makespan: makespanOf(inst, startOrder) },
    cds: cds(inst),
    neh: neh(inst),
    optimum: exhaustive(inst),
    bound: lowerBound(inst),
    loads,
    busiest,
    quickestToLast: { job: quick, time: upstream[quick] },
    dominance: johnsonDominance(inst),
  };
}

const unit = (n: number) => (n === 1 ? 'unit' : 'units');
const list = (names: readonly string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// Two sentences about the LAST machine, because its waiting is the whole story:
// Cmax = load(Mm) + waiting(Mm). Every clause is true by construction — a gap
// before job j on Mm means j had not yet cleared M(m−1) when Mm went free.
export function explain(analysis: Analysis, schedule: Schedule): { headline: string; detail: string } {
  const inst = analysis.instance;
  const m = inst.machines.length;
  const L = inst.machines[m - 1];
  const line = schedule.machines[m - 1];
  const C = schedule.makespan;
  const headline = `Makespan ${C} = ${L}'s ${line.load} ${unit(line.load)} of work + ${line.waiting} ${unit(line.waiting)} of ${L} waiting.`;

  const first = schedule.order[0];
  const upstream = inst.machines.slice(0, m - 1);
  const Q = analysis.quickestToLast;
  let detail = `It waits ${line.leadIn} at the start while job ${inst.jobs[first]} clears ${list(upstream)} (${inst.p[first].slice(0, m - 1).join(' + ')})`;
  // Only when it is strictly quicker: on a tie the clause would be false.
  if (Q.time < line.leadIn) detail += `; job ${inst.jobs[Q.job]} would get there in ${Q.time}`;
  detail += '.';

  const before = inst.machines[m - 2] ?? inst.machines[0];
  const gaps = line.gaps;
  if (!gaps.length) detail += ' It never waits between jobs.';
  else if (gaps.length === 1) detail += ` Between jobs it waits ${line.gapTotal} more, for job ${inst.jobs[gaps[0].before]} to clear ${before}.`;
  else {
    const longest = gaps.reduce((keep, gap) => (gap.length > keep.length ? gap : keep), gaps[0]);
    detail += ` Between jobs it waits ${line.gapTotal} more — the longest, ${longest.length}, for job ${inst.jobs[longest.before]} to clear ${before}.`;
  }
  if (C === analysis.optimum.makespan) detail += ' No order finishes sooner.';
  return { headline, detail };
}

export function orderLabel(inst: FlowShopInstance, order: readonly number[], sep = ' '): string {
  return order.map((j) => inst.jobs[j]).join(sep);
}
