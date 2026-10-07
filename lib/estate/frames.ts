// Coordinate frames for the Estate window, and the camera's clip planes. Pure
// maths on plain tuples: no three, no DOM, so the engine and node tests share it.
//
// Four frames, all in metres:
//  - estate: Z up, origin at the estate's south-west corner, +x east, +y north
//    (upstream manifest `frame`). The pack's site `at`, bounds and spawns.
//  - block-local Z-up: the IfcBuilding placement of one site. Engine JSON, walk
//    grids and nav files. estate = Rz(rot) · local + (at.x, at.y, 0).
//  - glTF block-local Y-up: every GLB. A glb point (gx, gy, gz) is block-local
//    (gx, −gz, gy) (upstream manifest.py:418-420; glb.py:49-66 writes the inverse).
//  - three world: Y up, right-handed. Estate (x, y, z) is world (x, z, −y), so a
//    building root sits at (at.x, 0, −at.y) and its glTF content needs no
//    further conversion under it (pack.json `frame` states the same).
//
// Upstream's own `rot` is quarter turns counter-clockwise (config/estate.toml:3,
// estate/config.py placement_matrix). Every site has rot 0 in v1.1 and the pack
// tool refuses a rotated site without --allow-rot; rotation here is in radians
// about +Z, for safety, and is exact at quarter turns (quarterTurns()).
//
// Point functions read every input component before writing, so `out` may be
// the input. Pass a scratch `out` on per-frame paths to avoid allocation.

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** A site's placement in the estate. A pack site entry ({ at, … }) fits as is. */
export interface SitePlacement {
  at: ArrayLike<number>;
  /** Radians, counter-clockwise about +Z (estate) / +Y (three). Default 0. */
  rot?: number;
}

// ---- estate ↔ three ------------------------------------------------------------

/** Estate (x, y, z) Z-up → three world (x, z, −y). Linear, so it maps directions too. */
export const estateToThree = (p: ArrayLike<number>, out: Vec3 = [0, 0, 0]): Vec3 => {
  const x = p[0], y = p[1], z = p[2];
  out[0] = x; out[1] = z; out[2] = -y;
  return out;
};

/** Three world (X, Y, Z) → estate (X, −Z, Y). */
export const threeToEstate = (p: ArrayLike<number>, out: Vec3 = [0, 0, 0]): Vec3 => {
  const x = p[0], y = p[1], z = p[2];
  out[0] = x; out[1] = -z; out[2] = y;
  return out;
};

// ---- glTF Y-up ↔ block-local Z-up ------------------------------------------------

/** glTF block-local (gx, gy, gz) Y-up → block-local (gx, −gz, gy) Z-up. Linear. */
export const gltfToLocal = (p: ArrayLike<number>, out: Vec3 = [0, 0, 0]): Vec3 => {
  const x = p[0], y = p[1], z = p[2];
  out[0] = x; out[1] = -z; out[2] = y;
  return out;
};

/** Block-local (x, y, z) Z-up → glTF (x, z, −y) Y-up. */
export const localToGltf = (p: ArrayLike<number>, out: Vec3 = [0, 0, 0]): Vec3 => {
  const x = p[0], y = p[1], z = p[2];
  out[0] = x; out[1] = z; out[2] = -y;
  return out;
};

// ---- block-local ↔ estate ------------------------------------------------------

const HALF_PI = Math.PI / 2;
const QUARTER: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Upstream's quarter turns (CCW) → radians, the unit SitePlacement.rot takes. */
export const quarterTurns = (k: number): number => k * HALF_PI;

// cos and sin of rot, exact at multiples of π/2 as upstream's rotate_z is
// (Math.cos(π/2) is 6e-17, which would smear every coordinate of a quarter-
// turned site by ~1e-14 m and break exact comparisons with the pack tool).
const cosSin = (rot: number, out: Vec2): Vec2 => {
  const k = rot / HALF_PI;
  const nearest = Math.round(k);
  if (Math.abs(k - nearest) < 1e-12) {
    const q = QUARTER[((nearest % 4) + 4) % 4];
    out[0] = q[0]; out[1] = q[1];
  } else {
    out[0] = Math.cos(rot); out[1] = Math.sin(rot);
  }
  return out;
};

// Scratch for cosSin; no destructuring on these paths, which would build an
// iterator per call.
const CS: Vec2 = [1, 0];

/** Block-local Z-up → estate: rotate by `rot` about the local origin, then move to `at`. */
export const localToEstate = (p: ArrayLike<number>, site: SitePlacement, out: Vec3 = [0, 0, 0]): Vec3 => {
  const x = p[0], y = p[1], z = p[2];
  cosSin(site.rot ?? 0, CS);
  const c = CS[0], s = CS[1];
  out[0] = c * x - s * y + site.at[0];
  out[1] = s * x + c * y + site.at[1];
  out[2] = z;
  return out;
};

/** Estate → block-local Z-up; the inverse of localToEstate. */
export const estateToLocal = (p: ArrayLike<number>, site: SitePlacement, out: Vec3 = [0, 0, 0]): Vec3 => {
  const dx = p[0] - site.at[0], dy = p[1] - site.at[1], z = p[2];
  cosSin(site.rot ?? 0, CS);
  const c = CS[0], s = CS[1];
  out[0] = c * dx + s * dy;
  out[1] = -s * dx + c * dy;
  out[2] = z;
  return out;
};

/** A direction (no translation), block-local → estate. Stair headings. */
export const localDirToEstate = (d: ArrayLike<number>, site: SitePlacement, out: Vec3 = [0, 0, 0]): Vec3 => {
  const x = d[0], y = d[1], z = d[2];
  cosSin(site.rot ?? 0, CS);
  const c = CS[0], s = CS[1];
  out[0] = c * x - s * y;
  out[1] = s * x + c * y;
  out[2] = z;
  return out;
};

/** A direction, estate → block-local; the inverse of localDirToEstate. Spawn facings into the walk frame. */
export const estateDirToLocal = (d: ArrayLike<number>, site: SitePlacement, out: Vec3 = [0, 0, 0]): Vec3 => {
  const x = d[0], y = d[1], z = d[2];
  cosSin(site.rot ?? 0, CS);
  const c = CS[0], s = CS[1];
  out[0] = c * x + s * y;
  out[1] = -s * x + c * y;
  out[2] = z;
  return out;
};

// ---- headings and the three camera's yaw ----------------------------------------
//
// Two angles, never to be mixed:
//  - a heading: radians counter-clockwise from +x in plan, Math.atan2(dy, dx) of
//    a direction. climb.ts, stair paths and the walker use block-local headings;
//  - a yaw: the three camera's turn about +Y (Euler order YXZ, as camera-controls
//    and a first-person rig set it). Yaw 0 looks down three −Z, which is estate
//    +y, north; so yaw = estate heading − π/2, and estate heading = local + rot.

const TWO_PI = 2 * Math.PI;

/** An angle wrapped to (−π, π]. */
export const wrapAngle = (a: number): number => {
  let w = a % TWO_PI;
  if (w > Math.PI) w -= TWO_PI;
  else if (w <= -Math.PI) w += TWO_PI;
  return w;
};

/** A block-local heading → the yaw the three camera needs to look along it. */
export const headingToThreeYaw = (heading: number, site: SitePlacement): number =>
  wrapAngle(heading + (site.rot ?? 0) - HALF_PI);

/** The three camera's yaw → the block-local heading it looks along (startClimb's input). */
export const threeYawToHeading = (yaw: number, site: SitePlacement): number =>
  wrapAngle(yaw + HALF_PI - (site.rot ?? 0));

// ---- composites the engine uses --------------------------------------------------

/** Block-local Z-up straight to three world: (x, y, z) → estate → (ex, ez, −ey). */
export const localToThree = (p: ArrayLike<number>, site: SitePlacement, out: Vec3 = [0, 0, 0]): Vec3 =>
  estateToThree(localToEstate(p, site, out), out);

/** Three world → block-local Z-up (walk and nav lookups from the camera position). */
export const threeToLocal = (p: ArrayLike<number>, site: SitePlacement, out: Vec3 = [0, 0, 0]): Vec3 =>
  estateToLocal(threeToEstate(p, out), site, out);

/** glTF block-local Y-up → three world, which is what the building root's transform does. */
export const gltfToThree = (p: ArrayLike<number>, site: SitePlacement, out: Vec3 = [0, 0, 0]): Vec3 =>
  localToThree(gltfToLocal(p, out), site, out);

/**
 * The building root in three: position (at.x, 0, −at.y) and a turn about +Y.
 * An estate turn of θ about +Z is the same θ about three's +Y (x stays x and
 * z = −y, so the handedness carries over), hence yaw = rot.
 */
export const siteRootThree = (site: SitePlacement, out: Vec3 = [0, 0, 0]): { position: Vec3; yaw: number } => {
  out[0] = site.at[0]; out[1] = 0; out[2] = -site.at[1];
  return { position: out, yaw: site.rot ?? 0 };
};

// ---- distances -------------------------------------------------------------------

/** Euclidean distance from p to an axis-aligned box (any one frame); 0 inside or on it. */
export const pointBoxDistance = (p: ArrayLike<number>, min: ArrayLike<number>, max: ArrayLike<number>): number => {
  const dx = Math.max(min[0] - p[0], 0, p[0] - max[0]);
  const dy = Math.max(min[1] - p[1], 0, p[1] - max[1]);
  const dz = Math.max(min[2] - p[2], 0, p[2] - max[2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

// ---- clip planes (plan §7.2) -----------------------------------------------------

export type EstateViewMode = 'overview' | 'plan' | 'walk' | 'fly';

// Walk's near plane. The walker's radius is 0.20 m, so no wall comes nearer the
// eye than that; the near rectangle's corners sit k · near from the eye,
// k = √(1 + tan²(hfov/2) + tan²(vfov/2)) = √(1 + tan²(vfov/2)·(1 + aspect²))
// (nearCornerFactor), so it stays clear of every wall while near ≤ 0.20 / k.
// 0.08 m holds up to k = 2.5, which the default 60° vertical FOV reaches only
// past a 3.8 : 1 window; a wider lens from the viewer's settings (up to 90°)
// passes it sooner (at 16:9 past 96.6°, at 21:9 past 84°), so near follows k
// below 0.08, never under 3 cm. Far is where the walk fog ends.
export const WALK_NEAR = 0.08;
export const WALK_FAR = 600;
/** The walker's radius: the walk grids are shrunk by it, so no wall comes nearer the eye. */
export const WALK_CLEARANCE = 0.2;
/** Walk's near plane never closes in further than this, m (depth precision). */
export const WALK_NEAR_MIN = 0.03;
/** Elsewhere the near rectangle's corners stay within this share of the gap. */
export const NEAR_CORNER_SHARE = 0.9;

/** How far the near rectangle's corners sit from the eye, in near-plane distances: √(1 + tan²(vfov/2)·(1 + aspect²)). */
export const nearCornerFactor = (vfovDeg: number, aspect: number): number => {
  const t = Math.tan((vfovDeg * Math.PI) / 360);
  return Math.sqrt(1 + t * t * (1 + aspect * aspect));
};
// Elsewhere near follows the scene: half the gap to the nearest thing that can
// be in front of the lens, clamped. 5 cm floor (inside a box the gap is 0),
// 20 m ceiling (beyond it depth precision is already ample). With a reversed-Z
// depth buffer (EXT_clip_control) far reaches 900 m past the orbit target (the
// estate is 400 m across) but never past 2 km; without one, depth precision is
// scarce, so far stops where the fog does, 800 m past the target (§7.2, §7.3;
// Firefox has no EXT_clip_control, R26). Past the fog end everything is
// background colour anyway, so the tighter plane hides nothing.
export const NEAR_MIN = 0.05;
export const NEAR_MAX = 20;
export const FAR_PAST_TARGET = 900;
export const FOG_END_PAST_TARGET = 800;
export const FAR_MAX = 2000;

export interface ClipPose {
  /** Eye to the nearest visible building box, m (pointBoxDistance; 0 inside one, Infinity if none). */
  nearestBoxDistance: number;
  /** Eye height above the current floor, or the ground outside, m. */
  heightAboveFloor: number;
  /** Eye to the orbit (or fly) target, m. */
  orbitDistance: number;
  /** The renderer has a reversed-Z depth buffer (EXT_clip_control). Walk ignores it. */
  reversedDepth: boolean;
  /** The camera's vertical field of view, degrees, and aspect (width / height): the near rectangle's size. Without them the 60° defaults' planes. */
  vfovDeg?: number;
  aspect?: number;
}

export interface ClipPlanes { near: number; far: number }

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/**
 * Near and far for a camera mode and pose. A NaN or negative gap reads as 0 and
 * so yields NEAR_MIN: a near plane too close only costs depth precision, one too
 * far cuts into the building in front of the lens. Far is always ≥ 800 > NEAR_MAX.
 */
export const clipPlanes = (mode: EstateViewMode, pose: ClipPose, out: ClipPlanes = { near: 0, far: 0 }): ClipPlanes => {
  const lens = pose.vfovDeg !== undefined && pose.aspect !== undefined && pose.vfovDeg > 0 && pose.aspect > 0;
  const k = lens ? nearCornerFactor(pose.vfovDeg as number, pose.aspect as number) : 0;
  if (mode === 'walk') {
    out.near = k > 0 ? Math.max(WALK_NEAR_MIN, Math.min(WALK_NEAR, WALK_CLEARANCE / k)) : WALK_NEAR;
    out.far = WALK_FAR;
    return out;
  }
  // Half the gap, or less where a wide lens would put the near rectangle's
  // corners past NEAR_CORNER_SHARE of it (from k ≈ 1.8: 60° past a 2.4 : 1 window).
  const share = k > 0 ? Math.min(0.5, NEAR_CORNER_SHARE / k) : 0.5;
  const gap = Math.min(pose.nearestBoxDistance, pose.heightAboveFloor);
  out.near = gap > 0 ? clamp(share * gap, NEAR_MIN, NEAR_MAX) : NEAR_MIN;
  const orbit = pose.orbitDistance > 0 ? pose.orbitDistance : 0;
  out.far = Math.min(FAR_MAX, orbit + (pose.reversedDepth ? FAR_PAST_TARGET : FOG_END_PAST_TARGET));
  return out;
};
