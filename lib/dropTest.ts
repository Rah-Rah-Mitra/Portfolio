import type Matter from 'matter-js';
import type { CompetencyCluster } from '../types';

// Drop test — FIG. 05e in the Systems Lab window. The Smash / Gravity text
// physics of the retired field-test UI, rebuilt as a bounded test rig: six
// stacks of labelled blocks, one per competency cluster, struck or pulled
// inside a fixed frame instead of across the whole page.
//
// Everything that decides an outcome lives here — the layout, the units, both
// force models, the reset tween — and in lib/dropRig.ts, whose DropRig drives
// the matter-js module handed to it. The rig is its own module so it loads with
// matter-js instead of in the entry chunk. The component adds only DOM, pointer
// mapping and a rAF, so tests run the very same engine in node.
//
// Units are physical so the readouts mean something: 1 u = 1 cm, y grows
// downward (matter-js and SVG agree), and time advances in fixed 1/60 s steps,
// which is what makes a strike land the same way every time. The rig is
// 6.4 m x 2.8 m; a block is a 22 cm square-section timber beam.

export interface Vec { x: number; y: number }
export interface Pose extends Vec { angle: number }

export const DROP_FRAME = { w: 640, h: 280 } as const;
/** Top of the floor slab. The band below it carries the column labels. */
export const FLOOR_Y = 240;
export const BLOCK_H = 22;
export const BLOCKS_PER_STACK = 4;
/** Clear gap kept between the widest blocks of neighbouring stacks. */
const STACK_GAP = 14;

export const STEP_MS = 1000 / 60;
export const STEP_S = 1 / 60;
/** Standard gravity in rig units: 9.81 m/s² = 981 cm/s². */
export const G = 981;
// matter-js applies gravity as mass * gravity.y * gravity.scale, a force in
// kg·u/ms²; at the default scale of 0.001, gravity.y = 0.981 is exactly 981 u/s².
export const GRAVITY_SCALE = 0.001;
export const GRAVITY_Y = (G * 1e-6) / GRAVITY_SCALE;
/** Its Verlet step adds force/mass * dt_ms² per step, so a = F/m needs F = m·a·1e-6 for a in u/s². */
export const ACCEL_TO_FORCE = 1e-6;
/** matter's `density` is mass per unit area: 500 kg/m³ timber, 22 cm deep, in kg/cm². */
export const AREAL_DENSITY = 22 * 0.0005;
/** matter-js's own sleep test on speed² + angularSpeed² (per-step units); "moving" means above it. */
export const MOTION_THRESHOLD = 0.08;
export const SLEEP_STEPS = 60;
/** A keyboard pull, and a halted (no-animation) pointer hold, last 1.5 s. */
export const HOLD_STEPS = 90;
/** Anything still creeping after 20 s is declared at rest, so a loop can never run forever. */
export const SETTLE_LIMIT = 60 * 20;

export const STRIKE_CENTRE: Vec = { x: DROP_FRAME.w / 2, y: FLOOR_Y - 2 * BLOCK_H };
export const WELL_CENTRE: Vec = { x: DROP_FRAME.w / 2, y: 104 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** SVG transform for a block centred at (x, y); the prerender and every painted frame share it. */
export const poseTransform = (x: number, y: number, angle = 0): string => {
  const deg = round2((angle * 180) / Math.PI);
  return `translate(${round2(x)} ${round2(y)})${deg ? ` rotate(${deg})` : ''}`;
};

// — layout ———————————————————————————————————————————————————————————————

export interface StackColumn { id: string; title: string; short: string; x: number; labels: string[] }
export interface BlockSpec { id: string; label: string; column: string; layer: number; w: number; h: number; home: Vec }
export interface DropLayout { columns: StackColumn[]; blocks: BlockSpec[]; pitch: number }

// Barlow Condensed SemiBold caps at 9.5 u, tracked 0.04em, average about 5.1 u
// a glyph; 5.6 keeps a margin, and the component compresses a label with
// textLength if a fallback font still overruns its block.
const GLYPH_U = 5.6;
const LABEL_PAD = 14;
export const blockWidth = (label: string): number => Math.round(LABEL_PAD + GLYPH_U * label.length);

const SHORT_TITLES: Record<string, string> = {
  'software-systems': 'SOFTWARE',
  'solution-architecture': 'ARCHITECTURE',
  'ai-engineering': 'AI ENGINEERING',
  'operations-research': 'OPS RESEARCH',
  cybersecurity: 'SECURITY',
  'data-product': 'DATA & PRODUCT',
};

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * One stack per competency cluster, built from that cluster's own tool list in
 * order: the first BLOCKS_PER_STACK tools whose label fits the column pitch,
 * none repeated across stacks. Widest at the bottom, so every stack stands on
 * its own and it is the strike that topples it.
 */
export const buildLayout = (clusters: readonly CompetencyCluster[]): DropLayout => {
  const pitch = DROP_FRAME.w / Math.max(1, clusters.length);
  const maxChars = Math.floor((pitch - STACK_GAP - LABEL_PAD) / GLYPH_U);
  const seen = new Set<string>();
  const columns = clusters.map((cluster, index): StackColumn => {
    const labels: string[] = [];
    for (const tool of cluster.tools) {
      if (labels.length === BLOCKS_PER_STACK) break;
      const key = tool.toLowerCase();
      if (tool.length > maxChars || seen.has(key)) continue;
      seen.add(key);
      labels.push(tool);
    }
    return {
      id: cluster.id,
      title: cluster.title,
      short: SHORT_TITLES[cluster.id] ?? cluster.title.split(/\s+/)[0].toUpperCase(),
      x: pitch * (index + 0.5),
      labels,
    };
  });
  const blocks = columns.flatMap((column) => column.labels
    .map((label, order) => ({ label, order, w: blockWidth(label) }))
    .sort((a, b) => b.w - a.w || a.order - b.order)
    .map(({ label, w }, layer): BlockSpec => ({
      id: `${column.id}:${slug(label)}`,
      label,
      column: column.id,
      layer,
      w,
      h: BLOCK_H,
      home: { x: column.x, y: FLOOR_Y - BLOCK_H * (layer + 0.5) },
    })));
  return { columns, blocks, pitch };
};

// — controls → physical parameters ————————————————————————————————————————

export type DropMode = 'smash' | 'gravity';
export interface DropParams { intensity: number; radius: number }

export const SMASH_LIMITS = { intensity: [0, 100], radius: [60, 240] } as const;
export const WELL_LIMITS = { intensity: [0, 100], radius: [20, 120] } as const;
export const SMASH_DEFAULTS: DropParams = { intensity: 60, radius: 140 };
export const WELL_DEFAULTS: DropParams = { intensity: 45, radius: 60 };

/** Peak velocity change a smash gives a block at the blast centre, m/s (1.5–9). */
export const smashPeakSpeed = (intensity: number): number => 1.5 + 7.5 * (clamp(intensity, 0, 100) / 100);
/** The same in matter's per-step velocity units. */
export const smashPeakDv = (intensity: number): number => smashPeakSpeed(intensity) * 100 * STEP_S;
/** Peak pull of the well, in g (0.5–3). */
export const wellPeakG = (intensity: number): number => 0.5 + 2.5 * (clamp(intensity, 0, 100) / 100);

/** u/step → m/s. */
export const toMetresPerSecond = (perStep: number): number => perStep / STEP_S / 100;
/** Impulse of a velocity change dv (u/step) on a body of `mass` kg, in N·s. */
export const impulseNs = (mass: number, dv: number): number => mass * toMetresPerSecond(dv);

// — smash: a radial impulse with linear falloff ————————————————————————————

export interface BoxPose extends Pose { w: number; h: number }
export interface Kick { point: Vec; dv: Vec }

/** Closest point of an oriented w×h box to p — p itself when p is inside. */
export const nearestPointOnBox = (box: BoxPose, p: Vec): Vec => {
  const c = Math.cos(box.angle);
  const s = Math.sin(box.angle);
  const dx = p.x - box.x;
  const dy = p.y - box.y;
  const lx = clamp(dx * c + dy * s, -box.w / 2, box.w / 2);
  const ly = clamp(-dx * s + dy * c, -box.h / 2, box.h / 2);
  return { x: box.x + lx * c - ly * s, y: box.y + lx * s + ly * c };
};

/**
 * The velocity changes a strike at `at` gives one block. The shock reaches the
 * block's nearest point first, so that is where the impulse acts (off-centre
 * hits spin the block), falling off linearly to nothing at `radius`. The floor
 * is rigid and reflects the blast, modelled as an image source mirrored below
 * it: that is what lifts a block sitting beside a strike instead of sliding it.
 * The combined change is capped at the direct peak.
 */
export const smashKicks = (box: BoxPose, at: Vec, peakDv: number, radius: number, floorY = FLOOR_Y): Kick[] => {
  const kicks: Kick[] = [];
  for (const source of [at, { x: at.x, y: 2 * floorY - at.y }]) {
    const point = nearestPointOnBox(box, source);
    let dx = point.x - source.x;
    let dy = point.y - source.y;
    const d = Math.hypot(dx, dy);
    if (d >= radius) continue;
    if (d > 1e-9) {
      dx /= d; dy /= d;
    } else {
      // Struck from inside the block: push away through its centre, or straight up.
      const cx = box.x - source.x;
      const cy = box.y - source.y;
      const m = Math.hypot(cx, cy);
      dx = m > 1e-9 ? cx / m : 0;
      dy = m > 1e-9 ? cy / m : -1;
    }
    const s = peakDv * (1 - d / radius);
    kicks.push({ point, dv: { x: dx * s, y: dy * s } });
  }
  const total = sumKicks(kicks);
  const magnitude = Math.hypot(total.x, total.y);
  if (magnitude > peakDv) {
    const k = peakDv / magnitude;
    kicks.forEach((kick) => { kick.dv = { x: kick.dv.x * k, y: kick.dv.y * k }; });
  }
  return kicks;
};

export const sumKicks = (kicks: readonly Kick[]): Vec => kicks.reduce(
  (sum, kick) => ({ x: sum.x + kick.dv.x, y: sum.y + kick.dv.y }),
  { x: 0, y: 0 },
);

// — gravity well: a softened inverse square ——————————————————————————————

/** The maximum of r / (r² + 1)^(3/2), reached at r = 1/√2. */
export const PLUMMER_PEAK = 2 / (3 * Math.sqrt(3));

/**
 * Acceleration (u/s²) toward a point mass at `at`, Plummer-softened with core
 * radius ε: a = GM·r / (r² + ε²)^(3/2). Outside the core it is ordinary 1/r²
 * gravity; inside it falls linearly to zero, so there is no singularity to
 * fling a block through the wall. GM is chosen so the strongest pull — at
 * r = ε/√2 — is exactly `peak`.
 */
export const wellAcceleration = (p: Vec, at: Vec, peak: number, core: number): Vec => {
  const dx = at.x - p.x;
  const dy = at.y - p.y;
  const e2 = core * core;
  const gm = (peak * e2) / PLUMMER_PEAK;
  const k = gm / Math.pow(dx * dx + dy * dy + e2, 1.5);
  return { x: dx * k, y: dy * k };
};

// — reset tween ———————————————————————————————————————————————————————————

export const RESTORE_STEPS = 36;
export const RESTORE_STAGGER = 6;
export const restoreDuration = (layers: number): number => RESTORE_STEPS + RESTORE_STAGGER * Math.max(0, layers - 1);

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The angle equivalent to `angle` nearest zero, so an upside-down block turns the short way upright. */
export const uprightAngle = (angle: number): number => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));

/** Where a block is `step` steps into a reset: bottom layer first, so the stacks rebuild upward. */
export const restorePose = (from: Pose, home: Vec, layer: number, step: number): Pose => {
  const e = easeInOutCubic(clamp((step - layer * RESTORE_STAGGER) / RESTORE_STEPS, 0, 1));
  return { x: lerp(from.x, home.x, e), y: lerp(from.y, home.y, e), angle: uprightAngle(from.angle) * (1 - e) };
};

// — the rig ———————————————————————————————————————————————————————————————

export type DropPhase = 'rest' | 'moving' | 'held' | 'restoring';

export interface DropReadout {
  phase: DropPhase;
  /** Blocks above matter's motion threshold right now. */
  moving: number;
  /** Blocks more than 3 cm or 3° from their home pose. */
  displaced: number;
  total: number;
  /** The largest impulse the last action gave a single block, N·s. */
  peakImpulse: number | null;
  /** Seconds on the settle clock while it is running. */
  elapsed: number | null;
  /** Seconds from the strike (or the well's release) until the last block stopped moving. */
  settle: number | null;
}

export const IDLE_READOUT = (total: number): DropReadout => ({
  phase: 'rest', moving: 0, displaced: 0, total, peakImpulse: null, elapsed: null, settle: null,
});

export const isMoving = (body: Matter.Body): boolean => (
  !body.isSleeping && body.speed * body.speed + body.angularSpeed * body.angularSpeed > MOTION_THRESHOLD
);
