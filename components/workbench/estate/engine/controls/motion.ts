// Numbers the controllers move by (plan §8.1, §8.2): pure, so node tests pin
// them. No three, no DOM.

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---- Overview keys and step buttons -------------------------------------------------------

/** ←/→ held in Overview, rad/s. */
export const ORBIT_ROTATE_RATE = 60 * DEG;
/** W/S (↑/↓) held in Overview, rad/s. */
export const ORBIT_TILT_RATE = 40 * DEG;
/** A step button's turn (Overview orbit, Fly and Walk turn), rad. */
export const STEP_TURN = 15 * DEG;
/** An Overview step button's zoom: the distance times this (in) or divided by it (out). */
export const STEP_ZOOM = 0.8;

// ---- Fly ----------------------------------------------------------------------------------

/** Fly never goes lower than this above the ground, m. */
export const FLY_CLEARANCE = 0.3;
export const FLY_SPEED_MIN = 2;
export const FLY_SPEED_MAX = 60;
/** Shift's multiplier. */
export const FLY_BOOST = 3;
/** ←/→ held in Fly (and Walk), rad/s: 90°/s. */
export const TURN_RATE = 90 * DEG;
/** How fast Fly's velocity closes on the keys' wish, 1/s (a time constant of 1/8 s). */
export const FLY_RESPONSE = 8;
/** The wheel's speed multiplier in Fly: its range and its factor per notch. */
export const FLY_MULTIPLIER_MIN = 0.25;
export const FLY_MULTIPLIER_MAX = 4;
export const FLY_MULTIPLIER_STEP = 1.15;
/** Fly's pitch limit, so the view never flips over the pole. */
export const PITCH_LIMIT = 85 * DEG;
/** Drag-to-look and pointer-lock look, rad per CSS pixel at a 60° FOV. */
export const LOOK_RATE = 0.0035;
/** Below this speed (m/s) Fly's camera counts as stopped. */
export const FLY_REST_SPEED = 0.01;
/** How far past the estate's extent Fly may roam, m, and how high. */
export const FLY_ROAM = 400;
export const FLY_CEILING = 1200;

/** §8.1: 2 + 0.5 × height, 2–60 m/s, Shift × 3, times the wheel's multiplier. */
export const flySpeed = (heightAboveGround: number, boost: boolean, multiplier = 1): number => {
  const h = Number.isFinite(heightAboveGround) ? Math.max(0, heightAboveGround) : 0;
  const base = clamp(FLY_SPEED_MIN + 0.5 * h, FLY_SPEED_MIN, FLY_SPEED_MAX);
  return base * (boost ? FLY_BOOST : 1) * clamp(multiplier, FLY_MULTIPLIER_MIN, FLY_MULTIPLIER_MAX);
};

/** The share of the gap an exponential approach closes in `dt` seconds at `rate` 1/s. */
export const approachShare = (rate: number, dt: number): number => (dt > 0 ? 1 - Math.exp(-rate * dt) : 0);

/** The wheel's Fly multiplier after `steps` notches (positive: faster), within its range. */
export const nextFlyMultiplier = (multiplier: number, steps: number): number =>
  clamp(multiplier * FLY_MULTIPLIER_STEP ** steps, FLY_MULTIPLIER_MIN, FLY_MULTIPLIER_MAX);

// ---- the wheel ----------------------------------------------------------------------------

/**
 * A wheel event as camera-controls' own wheel handler scales it (its handler is
 * off here: it would zoom the lens on Ctrl+wheel, where a pinch should dolly):
 * positive is towards the scene (scroll up, pinch out). Lines count a notch
 * each third; pixels and a pinch's Ctrl+wheel a tenth as much; macOS reports
 * deltas three times finer. Pages count as many lines.
 */
export const wheelSteps = (deltaY: number, deltaMode: number, ctrl: boolean, mac: boolean): number => {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  const factor = mac ? 1 : 3;
  const lines = deltaMode === 2 ? deltaY * 30 : deltaY;
  return -(deltaMode !== 0 && !ctrl ? lines / factor : lines / (factor * 10));
};

// ---- the compass ---------------------------------------------------------------------------

/**
 * The north arrow's clockwise screen rotation, radians, from the camera's
 * forward and up axes in the three world (north is three −Z, estate +y). The
 * screen's "up" on the ground is forward plus up projected onto the ground,
 * which holds whether the camera looks level or straight down. Returns null
 * when both vanish (a camera rolled onto its side, which no controller makes).
 */
export const northRotation = (fx: number, fz: number, ux: number, uz: number): number | null => {
  const gx = fx + ux;
  const gz = fz + uz;
  if (Math.abs(gx) < 1e-9 && Math.abs(gz) < 1e-9) return null;
  // Facing north (−Z) the arrow points up (0); facing west (−X) north is to the right (+90° clockwise).
  return Math.atan2(-gx, -gz);
};
