import { wrapAngle, type Vec3 } from '../../../../../lib/estate/frames';

// Camera poses and the flights between them (plan §8.1): pure maths on plain
// tuples in the three world (Y up), so node tests pin it and the controllers
// only apply the answers. No three here.
//
// An orbit pose is camera-controls' own spherical convention: the camera sits
// `distance` from `target`, `polar` radians from straight above it (+Y) and
// `azimuth` radians about +Y, measured as Math.atan2(dx, dz) of camera − target
// (three's Spherical.setFromVector3). Overview's limits (§8.1): distance 8–900
// m, at most 85° from straight down, target within the estate ± 50 m.
//
// A fly-to frames a building over 1.2 s, eased in and out: the target slides,
// the distance moves in log space (so zooming in from 600 m and out from 60 m
// feel alike), the azimuth turns the short way, and a long hop pulls back
// mid-flight so the camera arcs over the estate instead of skimming roofs.
// Halted motion (lib/motion) never animates: the caller cuts to t = 1.

export const FLY_TO_SECONDS = 1.2;
/** Home (the aerial view) flies like a fly-to. */
export const HOME_SECONDS = 1.2;
/** A mode switch's field-of-view change (Overview 45° ↔ Fly 60°). */
export const FOV_SECONDS = 0.25;

const DEG = Math.PI / 180;

export const ORBIT_LIMITS = Object.freeze({
  minDistance: 8,
  maxDistance: 900,
  /** ≤ 85° from straight down. */
  maxPolar: 85 * DEG,
  /** The orbit target stays within the estate's extent ± this, m. */
  targetMargin: 50,
});

/** Polar range a fly-to lands in: oblique enough to read the façades, never a plan view. */
export const FRAME_POLAR_MIN = 40 * DEG;
export const FRAME_POLAR_MAX = 68 * DEG;
/** How much of the frame's short side the building's bounding sphere fills. */
export const FRAME_FILL = 0.9;
/** The frame's target height as a share of the roof, capped: the middle of the façade, not the roof. */
export const FRAME_TARGET_SHARE = 0.4;
export const FRAME_TARGET_MAX = 25;
/** A hop pulls back by this share of the horizontal travel, at most HOP_MAX metres, at mid-flight. */
export const HOP_SHARE = 0.35;
export const HOP_MAX = 250;

export interface OrbitPose {
  target: Vec3;
  distance: number;
  azimuth: number;
  polar: number;
}

export interface OrbitLimits {
  minDistance: number;
  maxDistance: number;
  maxPolar: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const blankPose = (): OrbitPose => ({ target: [0, 0, 0], distance: 1, azimuth: 0, polar: Math.PI / 2 });

/** easeInOutCubic on [0, 1]; inputs outside are clamped. */
export const easeInOutCubic = (t: number): number => {
  const x = clamp(Number.isFinite(t) ? t : 1, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
};

/** The orbit pose of a camera at `position` looking at `target`. */
export const orbitFromLookAt = (position: ArrayLike<number>, target: ArrayLike<number>, out: OrbitPose = blankPose()): OrbitPose => {
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];
  const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
  out.target[0] = target[0];
  out.target[1] = target[1];
  out.target[2] = target[2];
  out.distance = r;
  out.azimuth = r === 0 ? 0 : Math.atan2(dx, dz);
  // atan2 rather than acos(dy / r): exact near straight down, where acos loses digits.
  out.polar = r === 0 ? 0 : Math.atan2(Math.hypot(dx, dz), dy);
  return out;
};

/** The camera position of an orbit pose. */
export const positionFromOrbit = (pose: OrbitPose, out: Vec3 = [0, 0, 0]): Vec3 => {
  const s = Math.sin(pose.polar) * pose.distance;
  out[0] = pose.target[0] + s * Math.sin(pose.azimuth);
  out[1] = pose.target[1] + Math.cos(pose.polar) * pose.distance;
  out[2] = pose.target[2] + s * Math.cos(pose.azimuth);
  return out;
};

/** A pose brought inside Overview's distance and polar limits (target untouched). */
export const clampOrbit = (pose: OrbitPose, limits: OrbitLimits = ORBIT_LIMITS): OrbitPose => {
  pose.distance = clamp(pose.distance, limits.minDistance, limits.maxDistance);
  pose.polar = clamp(pose.polar, 0, limits.maxPolar);
  return pose;
};

/**
 * The pose that frames a building (estate-frame bounds, its bounding-sphere
 * radius and roof height) from where the camera is now: same azimuth (no spin),
 * the polar brought into the oblique band, the sphere fitted to the frame's
 * short side at `vfovDeg` and `aspect`, within the distance limits.
 */
export const frameBuilding = (
  bounds: readonly [ArrayLike<number>, ArrayLike<number>],
  radius: number,
  roofTop: number,
  current: OrbitPose,
  vfovDeg: number,
  aspect: number,
  limits: OrbitLimits = ORBIT_LIMITS,
  out: OrbitPose = blankPose(),
): OrbitPose => {
  const [lo, hi] = bounds;
  const cx = (lo[0] + hi[0]) / 2;
  const cy = (lo[1] + hi[1]) / 2;
  out.target[0] = cx;
  out.target[1] = Math.min(Math.max(0, roofTop) * FRAME_TARGET_SHARE, FRAME_TARGET_MAX);
  out.target[2] = -cy;
  const halfV = (clamp(vfovDeg, 10, 120) * DEG) / 2;
  const halfH = Math.atan(Math.tan(halfV) * (aspect > 0 ? aspect : 1));
  const half = Math.min(halfV, halfH);
  out.distance = clamp((Math.max(radius, 1) / Math.sin(half)) * FRAME_FILL, limits.minDistance, limits.maxDistance);
  out.azimuth = current.azimuth;
  out.polar = clamp(current.polar, FRAME_POLAR_MIN, Math.min(FRAME_POLAR_MAX, limits.maxPolar));
  return out;
};

export interface Flight {
  from: OrbitPose;
  to: OrbitPose;
  /** Extra distance at mid-flight, m. */
  hop: number;
  seconds: number;
}

/** A flight between two orbit poses (copied, so the caller may reuse its own). */
export const planFlight = (from: OrbitPose, to: OrbitPose, seconds = FLY_TO_SECONDS): Flight => {
  const travel = Math.hypot(to.target[0] - from.target[0], to.target[2] - from.target[2]);
  return {
    from: { target: [from.target[0], from.target[1], from.target[2]], distance: from.distance, azimuth: from.azimuth, polar: from.polar },
    to: { target: [to.target[0], to.target[1], to.target[2]], distance: to.distance, azimuth: to.azimuth, polar: to.polar },
    hop: clamp(travel * HOP_SHARE, 0, HOP_MAX),
    seconds: seconds > 0 ? seconds : 0,
  };
};

/** Where a flight is at `elapsedSeconds` (eased). At or past the end it is exactly `to`. */
export const flightPose = (flight: Flight, elapsedSeconds: number, limits: OrbitLimits = ORBIT_LIMITS, out: OrbitPose = blankPose()): OrbitPose => {
  const { from, to } = flight;
  const t = flight.seconds > 0 ? elapsedSeconds / flight.seconds : 1;
  if (!(t < 1)) {
    out.target[0] = to.target[0];
    out.target[1] = to.target[1];
    out.target[2] = to.target[2];
    out.distance = to.distance;
    out.azimuth = to.azimuth;
    out.polar = to.polar;
    return out;
  }
  const e = easeInOutCubic(t);
  out.target[0] = lerp(from.target[0], to.target[0], e);
  out.target[1] = lerp(from.target[1], to.target[1], e);
  out.target[2] = lerp(from.target[2], to.target[2], e);
  const d0 = Math.max(from.distance, 1e-3);
  const d1 = Math.max(to.distance, 1e-3);
  const base = Math.exp(lerp(Math.log(d0), Math.log(d1), e));
  out.distance = clamp(base + flight.hop * Math.sin(Math.PI * e), limits.minDistance, limits.maxDistance);
  out.azimuth = from.azimuth + wrapAngle(to.azimuth - from.azimuth) * e;
  out.polar = clamp(lerp(from.polar, to.polar, e), 0, limits.maxPolar);
  return out;
};

/** True once `elapsedSeconds` reaches the flight's end. */
export const flightDone = (flight: Flight, elapsedSeconds: number): boolean => !(elapsedSeconds < flight.seconds);
