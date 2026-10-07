import type { PerspectiveCamera } from 'three';
import { groundAt, nearestGround, type GroundGrid, type GroundHit } from '../../../../../lib/estate/ground';
import type { EstateSiteId } from '../../../../../lib/estate/ids';
import type { HeldKeys } from '../../../../../lib/estate/input';
import { EYE_HEIGHT, polygonDistance } from '../../../../../lib/estate/storeys';
import {
  axisFloor, floorAt, followFloor, moveWithCollision, nearestWalkable, walkBoundsContain, type FeetSpring, type FloorHit, type WalkFile, type WalkPose,
} from '../../../../../lib/estate/walk';
import type { FloorQuery } from '../interior';
import { LookState } from './firstPerson';
import { TURN_RATE } from './motion';

// Walk (plan §8.1, §8.4): the walker and its collision. The eye is 1.6 m above
// the feet, the lens 60°; W/S (↑/↓) walk at 1.6 m/s (4.0 with Shift), A/D
// strafe, ←/→ turn at 90°/s; the velocity closes on the keys' wish at up to
// 10 m/s² and coasts down at 12/s once they let go. Drag looks (LookState, the
// same rules as Fly's), a right- or Shift-drag strafes, the wheel and the step
// buttons take 0.5 m steps and 15° turns. Under halted motion there is no
// inertia (the walker moves exactly as the keys ask and stops dead) and the
// feet snap to the floor instead of following it on their spring.
//
// Which floor answers (§8.4), through interior.ts floorQuery:
//  - inside a building's walk bounds less 0.5 m, once its walk grid has
//    arrived: that grid (lib/estate/walk.ts moveWithCollision: substeps of
//    ≤ 0.1 m, slide on x or y, a one-cell nudge into a stamped doorway; the
//    grid is already shrunk by the walker's radius and has the opened door
//    leaves blocked, so a point test is the whole collision model);
//  - outdoors: the ground heights, always walkable (kerbs 0.15 m); trees, posts
//    and shelters do not block;
//  - inside walk bounds whose grid has not arrived: the ground, except that the
//    building's footprint (+ the walker's radius) blocks ("PREPARING
//    WALKWAY…", `preparing`).
// Stepping from the ground onto a grid (a void deck, the NC forecourt) is what
// walks the visitor into a building: the next substep simply lands on its grid.
// A walker leaves a grid only at ground level; at an upper storey the bounds'
// edge is a wall.
//
// The pose is in the estate frame (x east, y north, z up; block-local is
// estate − at, every site has rot 0 in v1.2). `z` is the logical floor under
// the walker (what the next floor search centres on), `spring.z` the drawn feet.

/** §8.1 walking speed and its Shift boost, m/s. */
export const WALK_SPEED = 1.6;
export const WALK_BOOST_SPEED = 4.0;
/** How fast the velocity may close on the keys' wish, m/s². */
export const WALK_ACCEL = 10;
/** How fast it coasts down with no key held, 1/s. */
export const WALK_DAMPING = 12;
/** Below this the walker counts as stopped, m/s. */
export const WALK_REST_SPEED = 0.01;
/** A step button's and a wheel notch's step, m; a step button's turn is STEP_TURN (motion.ts). */
export const WALK_STEP = 0.5;
/** A right- or Shift-drag strafes this far per CSS pixel, m. */
export const WALK_STRAFE_PER_PX = 0.01;
/** The walker's radius against a footprint whose grid has not arrived, m (the grid's own shrink, upstream r = 0.20). */
export const FOOTPRINT_PAD = 0.2;
/** How far past the estate's extent the walker may stray, m. */
export const WALK_ROAM = 20;
/** Largest rise or drop the floor search reaches from the ground onto a grid, m (SN5W step). */
const GROUND_STEP = 0.4;
/** A walker standing on no walkable cell of a grid that arrived under it is moved to the nearest one within this, m (§8.1's snap). */
export const WALK_SNAP = 1.5;
const SUBSTEP = 0.1;
const clamp1 = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v);
const MAX_SUBSTEPS = 64;
/** The drawn feet count as settled within this of the floor, m and m/s. */
const SPRING_REST = 1e-3;

/**
 * The band follows the storey underfoot, except near the top of a tall
 * flight: once the eye stands this far over the next storey's floor, m, the
 * band centres on that storey. On the 3.6 m void-deck storeys the second-last
 * tread of L1 → L2 puts the eye 1.26 m over L2 with nothing of L2 overhead, only
 * L3's landing, which a band about L1 at k = 1 would leave out
 * (tests/estate-storeys.test.ts walks every real stair to hold this).
 */
export const WALK_EYE_LEAD = 1.0;

/** The storey the interior's band centres on while walking (interior.ts setStoreyHint): see WALK_EYE_LEAD. */
export const walkBandStorey = (ffl: readonly number[], layer: number, feetZ: number): number =>
  layer >= 0 && layer + 1 < ffl.length && feetZ + EYE_HEIGHT - ffl[layer + 1] >= WALK_EYE_LEAD ? layer + 1 : layer;

/** What the walker needs of the world: interior.ts InteriorSystem and the pack fit. */
export interface WalkWorld {
  /** pack.sites, index-aligned with ESTATE_SITE_IDS. */
  readonly sites: readonly WalkSite[];
  /** The estate's extent, [x0, y0, x1, y1]. */
  readonly extent: readonly [number, number, number, number];
  floorQuery(x: number, y: number, feetZ: number, out: FloorQuery, hit?: FloorHit): FloorQuery;
  walk(index: number): WalkFile | null;
  ground(): GroundGrid | null;
  indexOf(site: EstateSiteId): number;
  /**
   * Entering building `index` failed for good (its interior, walk grid or nav
   * file, §7.5): walk-in is off, so its grid takes nobody on from outside and
   * its footprint blocks as before the grid came. A walker already on it stays.
   */
  entryFailed?(index: number): boolean;
}

export interface WalkSite {
  readonly id: EstateSiteId;
  readonly at: readonly [number, number] | ArrayLike<number>;
  readonly footprint: ReadonlyArray<ArrayLike<number>>;
}

export class WalkController {
  readonly mode = 'walk' as const;
  readonly look = new LookState();
  /**
   * The viewer's walking pace over WALK_SPEED (settings walkSpeed): the walk,
   * its Shift run and the acceleration scale together, so the time to reach
   * speed stays the same. Step buttons, the wheel and drags keep their metres.
   */
  speedScale = 1;
  /** Estate frame, m. */
  x = 0;
  y = 0;
  /** The logical floor under the walker, m. */
  z = 0;
  /** Storey index of that floor on a building grid, or −1 on the ground. */
  layer = -1;
  /** Index of the building whose grid is underfoot, or −1 on the ground. */
  site = -1;
  /** The drawn feet (eye = spring.z + 1.6). */
  readonly spring: FeetSpring = { z: 0, v: 0 };
  vx = 0;
  vy = 0;
  /** The touch stick, each −1…1 (x strafe, y forward). */
  stickX = 0;
  stickY = 0;
  /** After update or a move: the walker stands within a building's walk bounds whose grid has not arrived. */
  preparing = false;
  /**
   * A walker placed inside a building before its grid arrived (a resume on
   * L5): held where it is, not dropped to the ground, until that grid is here;
   * then snapped to the nearest walkable cell of its storey. −1 when not held.
   */
  holdSite = -1;
  private readonly world: WalkWorld;
  private readonly query: FloorQuery = { kind: 'none', z: Number.NaN, site: null, layer: -1 };
  private readonly hit: FloorHit = { z: 0, layer: -1 };
  private readonly local: WalkPose = { x: 0, y: 0, z: 0, layer: -1 };
  private readonly ground: GroundHit = { z: 0, x: 0, y: 0, distance: 0 };
  private dirty = true;

  constructor(world: WalkWorld) {
    this.world = world;
  }

  // ---- placing -----------------------------------------------------------------------

  /**
   * Stand at estate (x, y) on whatever floor answers there for feet near
   * `feetZ` (§8.4), facing yaw/pitch (three yaw, LookState's). The feet snap
   * (no spring), the velocity stops. On a grid that arrived, a point on no
   * walkable cell moves to the nearest one within WALK_SNAP.
   */
  place(x: number, y: number, feetZ: number, yaw: number, pitch = 0, holdSite = -1): void {
    this.x = x;
    this.y = y;
    this.z = feetZ;
    this.site = -1;
    this.layer = -1;
    this.vx = 0;
    this.vy = 0;
    this.look.yaw = yaw;
    this.look.pitch = pitch;
    this.look.turn(0, 0);
    this.holdSite = holdSite;
    if (!this.releaseHold()) this.resolveHere(true);
    this.spring.z = this.z;
    this.spring.v = 0;
    this.dirty = true;
  }

  /**
   * A held walker (holdSite) whose grid has arrived: snapped to its storey's
   * nearest walkable cell, or let go to the ground rules if none is in reach.
   * True while still held (nothing else may move it) or when it just landed.
   */
  releaseHold(): boolean {
    const index = this.holdSite;
    if (index < 0) return false;
    const walk = this.world.walk(index);
    if (!walk) { this.preparing = true; return true; }
    this.holdSite = -1;
    const at = this.world.sites[index].at;
    if (!nearestWalkable(walk, this.x - at[0], this.y - at[1], this.z, WALK_SNAP, this.local)) return false;
    this.x = this.local.x + at[0];
    this.y = this.local.y + at[1];
    this.z = this.local.z;
    this.layer = this.local.layer;
    this.site = index;
    this.preparing = false;
    this.dirty = true;
    return true;
  }

  /** Stand exactly at a known floor (a lift arrival, a stair landing): block-local pose on building `site`. */
  placeOn(site: number, pose: WalkPose, yaw: number): void {
    const s = this.world.sites[site];
    this.x = pose.x + s.at[0];
    this.y = pose.y + s.at[1];
    this.z = pose.z;
    this.layer = pose.layer;
    this.site = site;
    this.vx = 0;
    this.vy = 0;
    this.look.yaw = yaw;
    this.look.turn(0, 0);
    this.spring.z = this.z;
    this.spring.v = 0;
    this.preparing = false;
    this.holdSite = -1;
    this.dirty = true;
  }

  /** The walker's block-local pose on its building's grid (into `out`), or null on the ground. */
  localPose(out: WalkPose): WalkPose | null {
    if (this.site < 0) return null;
    const at = this.world.sites[this.site].at;
    out.x = this.x - at[0];
    out.y = this.y - at[1];
    out.z = this.z;
    out.layer = this.layer;
    return out;
  }

  /**
   * Re-read the floor where the walker stands: a grid that arrived under a
   * walker held on the ground (it steps onto the grid, or is moved to the
   * nearest walkable cell within WALK_SNAP), the ground under one outdoors.
   * Called every frame; cheap when nothing changed. True if the pose moved.
   */
  resolveHere(snap = true): boolean {
    if (this.site >= 0) {
      if (this.world.walk(this.site) !== null) return false;
      // The grid went (never in practice: files stay decoded); stand on the ground.
      this.site = -1;
      this.layer = -1;
    }
    const q = this.world.floorQuery(this.x, this.y, this.z, this.query, this.hit);
    this.preparing = this.pendingHere(q);
    const failed = q.site !== null && this.world.entryFailed?.(this.world.indexOf(q.site)) === true;
    if (failed && (q.kind === 'building' || q.kind === 'blocked')) {
      // Walk-in is off for it: stand on the ground there.
      const g = this.groundZ(this.x, this.y);
      if (g !== null && Math.abs(g - this.z) > 1e-6) { this.z = g; return true; }
      return false;
    }
    switch (q.kind) {
      case 'building':
        this.site = this.world.indexOf(q.site!);
        this.layer = q.layer;
        this.z = q.z;
        return true;
      case 'blocked': {
        if (!snap) return false;
        const index = this.world.indexOf(q.site!);
        const walk = index >= 0 ? this.world.walk(index) : null;
        if (!walk) return false;
        const at = this.world.sites[index].at;
        if (!nearestWalkable(walk, this.x - at[0], this.y - at[1], this.z, WALK_SNAP, this.local)) return false;
        this.x = this.local.x + at[0];
        this.y = this.local.y + at[1];
        this.z = this.local.z;
        this.layer = this.local.layer;
        this.site = index;
        this.dirty = true;
        return true;
      }
      case 'ground':
        if (Math.abs(q.z - this.z) > 1e-6) { this.z = q.z; return true; }
        return false;
      case 'pending': {
        const g = this.groundZ(this.x, this.y);
        if (g !== null && Math.abs(g - this.z) > 1e-6) { this.z = g; return true; }
        return false;
      }
      default:
        return false;
    }
  }

  // ---- moving ------------------------------------------------------------------------

  /** Ground height at estate (x, y): its own cell, or the nearest covered one within 1.5 m; null with no data near. */
  groundZ(x: number, y: number): number | null {
    const g = this.world.ground();
    if (!g) return null;
    const own = groundAt(g, x, y);
    if (own !== null) return own;
    return nearestGround(g, x, y, 1.5, this.ground) ? this.ground.z : null;
  }

  /** A grid on its way (not one that failed for good: that is the interior's reason, not a wait). */
  private pendingHere(q: FloorQuery): boolean {
    return q.kind === 'pending' && q.site !== null && this.world.entryFailed?.(this.world.indexOf(q.site)) !== true;
  }

  private insideFootprint(site: EstateSiteId, x: number, y: number): boolean {
    const index = this.world.indexOf(site);
    const s = index >= 0 ? this.world.sites[index] : undefined;
    if (!s) return false;
    return polygonDistance(x - s.at[0], y - s.at[1], s.footprint) < FOOTPRINT_PAD;
  }

  private clampRoam(v: number, axis: 0 | 1): number {
    const e = this.world.extent;
    const lo = e[axis] - WALK_ROAM;
    const hi = e[axis + 2] + WALK_ROAM;
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** One substep of ≤ 0.1 m (estate frame). True when it went through. */
  private stepOnce(sx: number, sy: number): boolean {
    const world = this.world;
    if (this.site >= 0) {
      const walk = world.walk(this.site);
      const at = world.sites[this.site].at;
      if (walk) {
        const p = this.local;
        p.x = this.x - at[0]; p.y = this.y - at[1]; p.z = this.z; p.layer = this.layer;
        if (moveWithCollision(walk, p, sx, sy) === 'blocked') return false;
        if (walkBoundsContain(walk, p.x, p.y)) {
          this.x = p.x + at[0]; this.y = p.y + at[1]; this.z = p.z; this.layer = p.layer;
          return true;
        }
        // Off the grid's inner edge: onto the ground, but only at ground level.
        const nx = p.x + at[0];
        const ny = p.y + at[1];
        const g = this.groundZ(nx, ny);
        if (Math.abs((g ?? 0) - p.z) > GROUND_STEP) return false;
        const q = world.floorQuery(nx, ny, p.z, this.query, this.hit);
        if (q.kind === 'blocked') return false;
        if (q.kind === 'pending' && q.site !== null && this.insideFootprint(q.site, nx, ny)) return false;
        this.x = nx; this.y = ny;
        if (q.kind === 'building') {
          this.site = world.indexOf(q.site!); this.z = q.z; this.layer = q.layer;
        } else {
          this.site = -1; this.layer = -1; this.z = q.kind === 'ground' ? q.z : g ?? p.z;
        }
        return true;
      }
      this.site = -1;
      this.layer = -1;
    }
    const tx = this.clampRoam(this.x + sx, 0);
    const ty = this.clampRoam(this.y + sy, 1);
    if (tx === this.x && ty === this.y) return false;
    const q = world.floorQuery(tx, ty, this.z, this.query, this.hit);
    switch (q.kind) {
      case 'building': {
        const index = world.indexOf(q.site!);
        if (world.entryFailed?.(index)) {
          // Walk-in is off: the footprint blocks, the rest is ground.
          if (this.insideFootprint(q.site!, tx, ty)) return false;
          this.z = this.groundZ(tx, ty) ?? this.z;
          break;
        }
        this.site = index;
        this.layer = q.layer;
        this.z = q.z;
        break;
      }
      case 'blocked':
        if (q.site !== null && world.entryFailed?.(world.indexOf(q.site))) {
          if (this.insideFootprint(q.site, tx, ty)) return false;
          this.z = this.groundZ(tx, ty) ?? this.z;
          break;
        }
        return false;
      case 'pending':
        if (q.site !== null && this.insideFootprint(q.site, tx, ty)) {
          this.preparing = this.pendingHere(q);
          return false;
        }
        this.z = this.groundZ(tx, ty) ?? this.z;
        break;
      case 'ground':
        this.z = q.z;
        break;
      default:
        // Off the ground data (a nodata patch, the estate's edge): level.
    }
    this.x = tx;
    this.y = ty;
    return true;
  }

  /**
   * Move by (dx, dy) m in the estate frame through collision: substeps of
   * ≤ 0.1 m, each tried whole, then on x, then on y; the first that is refused
   * on every axis ends the move. Returns the distance actually moved.
   */
  moveBy(dx: number, dy: number): number {
    const length = Math.hypot(dx, dy);
    if (!(length > 0) || !Number.isFinite(length)) return 0;
    let n = Math.ceil(length / SUBSTEP - 1e-9);
    let scale = 1;
    if (n > MAX_SUBSTEPS) { scale = (MAX_SUBSTEPS * SUBSTEP) / length; n = MAX_SUBSTEPS; }
    const sx = (dx * scale) / n;
    const sy = (dy * scale) / n;
    const x0 = this.x;
    const y0 = this.y;
    this.preparing = false;
    // As moveWithCollision: an axis with only float noise on it is no slide.
    const minAxis = axisFloor(sx, sy);
    for (let k = 0; k < n; k += 1) {
      if (this.stepOnce(sx, sy)) continue;
      if (sx !== 0 && sy !== 0
        && ((Math.abs(sx) >= minAxis && this.stepOnce(sx, 0)) || (Math.abs(sy) >= minAxis && this.stepOnce(0, sy)))) continue;
      break;
    }
    if (!this.preparing && this.site < 0) {
      // Standing in bounds whose grid is still on its way shows the chip too.
      this.preparing = this.pendingHere(this.world.floorQuery(this.x, this.y, this.z, this.query, this.hit));
    }
    const moved = Math.hypot(this.x - x0, this.y - y0);
    if (moved > 0) this.dirty = true;
    return moved;
  }

  /** Level forward and right, estate frame (yaw 0 looks north, +y). */
  forward(out: { x: number; y: number }): { x: number; y: number } {
    out.x = -Math.sin(this.look.yaw);
    out.y = Math.cos(this.look.yaw);
    return out;
  }

  right(out: { x: number; y: number }): { x: number; y: number } {
    out.x = Math.cos(this.look.yaw);
    out.y = Math.sin(this.look.yaw);
    return out;
  }

  private readonly f = { x: 0, y: 1 };
  private readonly r = { x: 1, y: 0 };

  /** A step through collision: `ahead` m along the level view, `side` m to the right. */
  stepBy(ahead: number, side: number): number {
    const f = this.forward(this.f);
    const r = this.right(this.r);
    return this.moveBy(f.x * ahead + r.x * side, f.y * ahead + r.y * side);
  }

  /** Drag-to-look (or a locked mouse), scaled to the lens. */
  dragLook(dx: number, dy: number, fovDeg: number): void {
    this.look.dragLook(dx, dy, fovDeg);
    this.dirty = true;
  }

  /** Right- or Shift-drag: the world follows the pointer, sideways and along the view. */
  dragStrafe(dx: number, dy: number): number {
    return this.stepBy(dy * WALK_STRAFE_PER_PX, -dx * WALK_STRAFE_PER_PX);
  }

  turn(dYaw: number, dPitch: number): void {
    this.look.turn(dYaw, dPitch);
    this.dirty = true;
  }

  stop(): void {
    this.vx = 0;
    this.vy = 0;
    this.stickX = 0;
    this.stickY = 0;
  }

  /** Is any walking input down (keys or stick)? */
  driving(held: HeldKeys): boolean {
    return held.axis('back', 'forward') !== 0 || held.axis('strafe-left', 'strafe-right') !== 0
      || held.axis('turn-right', 'turn-left') !== 0 || this.stickX !== 0 || this.stickY !== 0;
  }

  /**
   * One frame: turn keys, keys and stick → velocity (accelerated, damped) →
   * collision → the feet spring → the camera. True while anything moves or a
   * key is held (the frame loop keeps running, §7.8).
   */
  update(dt: number, held: HeldKeys, halted: boolean, camera: PerspectiveCamera): boolean {
    if (this.holdSite >= 0) {
      // Held for a grid on its way: only the view turns.
      const wasHeld = this.holdSite;
      this.releaseHold();
      if (this.holdSite === wasHeld) {
        if (this.dirty) this.apply(camera);
        return false;
      }
      this.spring.z = this.z;
      this.spring.v = 0;
      this.apply(camera);
      return true;
    }
    const turn = held.axis('turn-right', 'turn-left');
    if (turn !== 0 && dt > 0) {
      this.look.turn(turn * TURN_RATE * dt, 0);
      this.dirty = true;
    }
    const fwd = clamp1(held.axis('back', 'forward') + this.stickY);
    const side = clamp1(held.axis('strafe-left', 'strafe-right') + this.stickX);
    const f = this.forward(this.f);
    const r = this.right(this.r);
    let wx = f.x * fwd + r.x * side;
    let wy = f.y * fwd + r.y * side;
    const wl = Math.hypot(wx, wy);
    if (wl > 1) { wx /= wl; wy /= wl; }
    const speed = (held.has('boost') ? WALK_BOOST_SPEED : WALK_SPEED) * this.speedScale;
    wx *= speed;
    wy *= speed;
    if (halted) {
      this.vx = wx;
      this.vy = wy;
    } else if (wl === 0) {
      const k = dt > 0 ? Math.exp(-WALK_DAMPING * dt) : 1;
      this.vx *= k;
      this.vy *= k;
    } else if (dt > 0) {
      const dvx = wx - this.vx;
      const dvy = wy - this.vy;
      const m = Math.hypot(dvx, dvy);
      const most = WALK_ACCEL * this.speedScale * dt;
      if (m <= most) { this.vx = wx; this.vy = wy; } else { this.vx += (dvx / m) * most; this.vy += (dvy / m) * most; }
    }
    if (wl === 0 && Math.hypot(this.vx, this.vy) < WALK_REST_SPEED) { this.vx = 0; this.vy = 0; }

    let moved = false;
    if ((this.vx !== 0 || this.vy !== 0) && dt > 0) {
      const want = Math.hypot(this.vx, this.vy) * dt;
      const got = this.moveBy(this.vx * dt, this.vy * dt);
      moved = got > 0;
      // Against a wall the velocity is what actually moved, so nothing builds up behind it.
      if (got < want * 0.5) {
        const k = want > 0 ? got / want : 0;
        this.vx *= k;
        this.vy *= k;
      }
    } else if (this.site < 0 || this.preparing) {
      // At rest: a grid that arrived under the walker takes over, the ground under it settles.
      if (this.resolveHere(true)) moved = true;
    }

    followFloor(this.spring, this.z, dt, halted);
    const settling = Math.abs(this.spring.z - this.z) > SPRING_REST || Math.abs(this.spring.v) > SPRING_REST;
    if (!settling) { this.spring.z = this.z; this.spring.v = 0; }
    if (moved || settling || this.dirty) this.apply(camera);
    return moved || settling || turn !== 0 || wl > 0 || this.vx !== 0 || this.vy !== 0;
  }

  /** Put the camera at the eye and look along the look state. */
  apply(camera: PerspectiveCamera): void {
    camera.position.set(this.x, this.spring.z + EYE_HEIGHT, -this.y);
    this.look.apply(camera);
    this.dirty = false;
  }

  /** The floor under the walker on its grid, re-read (a teleport within the grid). */
  floorHere(): boolean {
    if (this.site < 0) return false;
    const walk = this.world.walk(this.site);
    if (!walk) return false;
    const at = this.world.sites[this.site].at;
    const z = floorAt(walk, this.x - at[0], this.y - at[1], this.z, this.hit);
    if (z === null) return false;
    this.z = z;
    this.layer = this.hit.layer;
    return true;
  }
}
