// The drawing set's effects vocabulary (docs/portfolio/desk-drawing-set.md §2):
// the easings and the named effects' timings. The film (drawingFilm.ts) runs them;
// the sequence (sequence.ts) composes them into acts. Pure.

export const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

export const ease = {
  linear: (t: number) => clamp01(t),
  sine: (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t)),
  cubic: (t: number) => {
    const x = clamp01(t);
    return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  },
  outCubic: (t: number) => 1 - (1 - clamp01(t)) ** 3,
  outQuart: (t: number) => 1 - (1 - clamp01(t)) ** 4,
  outQuad: (t: number) => 1 - (1 - clamp01(t)) ** 2,
} as const;

/** The progress of a sub-interval [a, b] of an act at t (all in ms or all in 0–1). */
export const window01 = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));

/** Named effects and their timings (ms). Ids follow the spec's E1–E19. */
export const EFFECT_MS = {
  /** E1 RULE-IN: the estate's extent frame, by arc length from the corner nearest the title plate. */
  ruleIn: 600,
  /** E2 DRAW-IN on the site plan; plans use drawInMs(rooms). */
  drawInSite: 2700,
  drawInReading: 2000,
  /** E4 FADE. */
  fadeIn: 400,
  fadeInReading: 900,
  fadeOut: 400,
  /** E5 SCAN WIPE. */
  scanWipe: 1100,
  scanWipeReading: 1600,
  /** E6 POCHÉ FLOOD. */
  pocheFlood: 900,
  /** E7 DIMENSION TICK-IN, per dimension, staggered. */
  dimension: 400,
  dimensionStagger: 200,
  /** E8 TREAD TICK-IN, per riser. */
  riser: 30,
  /** E9 DOLLY (plan). */
  dolly: 1400,
  /** E10 TILT. */
  tilt: 2400,
  /** E11 EXPLODE / CLOSE. */
  explode: 1600,
  close: 1000,
  /** E12 LINK, and its retract. */
  link: 900,
  retract: 250,
  /** E13 EXTRUDE. */
  extrude: 600,
  /** E14 STACK, per storey, at most stackMax. */
  stackStorey: 70,
  stackMax: 1400,
  /** E15 SILHOUETTE. */
  silhouette: 400,
  /** E16 DOLLY-ZOOM to the poster camera. */
  dollyZoom: 3000,
  /** E17 CUT IN PLACE. */
  cutInPlace: 1200,
  /** E18 LIFT TO PLAN. */
  liftToPlan: 2200,
  /** E19 RE-ISSUE: out, then in at the new place. */
  reissueOut: 250,
  reissueIn: 400,
} as const;

/** E2 on a plan: longer for more rooms, within 2.4–3.2 s. */
export const drawInMs = (rooms: number): number => Math.min(3200, Math.max(2400, 1600 + 18 * rooms));

/** E2's pens: one per 0.9 px/ms of line, 1–8, so a long sheet draws with several hands at once. */
export const penCount = (lengthPx: number, ms: number): number => Math.min(8, Math.max(1, Math.ceil(lengthPx / (ms * 0.9))));

/** Holds between arrivals (ms): every hold at least 2.5× its arrival. */
export const HOLD_MS = {
  site: 8000,
  l1: 8000,
  typical: 10000,
  roof: 6000,
  exploded: 10000,
  block: 10500,
  aerial: 12000,
  welcome: 12000,
  reading: 24000,
} as const;

/** After this long without input the drawing rests on its finished sheet. */
export const REST_AFTER_MS = 240_000;
