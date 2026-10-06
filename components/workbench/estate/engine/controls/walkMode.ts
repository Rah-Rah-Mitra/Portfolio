import type { PerspectiveCamera } from 'three';
import { cancelClimb, startClimb, stepClimb, type Climb, type ClimbPose } from '../../../../../lib/estate/climb';
import { headingToThreeYaw, threeYawToHeading } from '../../../../../lib/estate/frames';
import { ESTATE_SITE_IDS, type EstateSiteId, type EstateStoreyTag } from '../../../../../lib/estate/ids';
import type { HeldKeys } from '../../../../../lib/estate/input';
import type { EstateNav, NavLift } from '../../../../../lib/estate/nav';
import { nearestWalkable, type WalkPose } from '../../../../../lib/estate/walk';
import type { EstateLiftOffer, EstateStairOffer, EstateStep, EstateWalkLevel, EstateWalkStep, EstateWalkView } from '../../engineApi';
import type { EstateCore } from '../core';
import type { InteriorEntry, InteriorLocation } from '../interior';
import {
  fadeAt, liftArrival, liftChip, liftLabel, liftOffer, nearestLift, noRouteReason, planRoute, rideCaption, servedLevels, STAIR_CUT_REACH,
  stairChip, stairFor, stairLabel, stairOffer, stairPaths, stairStart, stairStartOnFoot, walkLevels, type Arrival, type FadeState, type RouteLeg,
  type StairChoice, type StairOfferState,
} from '../lifts';
import type { ViewAccess } from '../navigation';
import { STEP_TILT, STEP_TURN } from './motion';
import { walkBandStorey, WalkController, WALK_STEP, type WalkWorld } from './walk';

// Walk mode's session (plan §8.1, §8.4, §8.5): the walker (walk.ts), Take
// stairs (lib/estate/climb.ts along the nav file's walking lines), lift rides
// (lifts.ts, a fade to paper the engine draws itself), the storey strip's
// routes, and what the HUD is offered where the walker stands (view.walk). The
// controls (index.ts) own the mode switches and the Enter / Exit arcs, and
// hand the camera to this while the mode is Walk.
//
// Transitions (the view's `transition`, an Esc layer): 'climb' while a stair
// is followed, 'fade' while a ride's paper is up. Esc lands a climb at its
// nearer end and a fade at its nearer end (before the cut: back where it
// started; after: arrived). Any movement key, drag, wheel, step or stick
// stops a climb where it is. Holding PgUp / PgDn keeps climbing storey by
// storey. Under halted motion a climb is a cut to its end and a ride one cut,
// with no paper. Nothing here downloads: rides and climbs move within one
// building's resident interior and walk grid, so only the band moves.

/** The location chip and offers refresh at most this often while the walker moves, ms. */
export const WALK_CHECK_MS = 250;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Where a walk starts or Home returns to: estate frame, feet height, three yaw. */
export interface WalkSpawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Pack spawn name, for the record. */
  name: string;
}

interface Ride {
  startMs: number;
  /** The caption: 'LIFT 2 · L5 → L12'. */
  text: string;
  /** The announcement prefix at the cut ('Lift 2'), or undefined for a stair cut. */
  via: string | undefined;
  site: number;
  arrival: Arrival;
  cut: boolean;
  /** A routed cut to a stair line: the climb that follows it. */
  then: StairChoice | null;
}

interface RouteState {
  legs: readonly RouteLeg[];
  next: number;
  target: EstateStoreyTag;
}

const sameLevels = (a: readonly EstateWalkLevel[], b: readonly EstateWalkLevel[]) =>
  a.length === b.length && a.every((l, i) => l.tag === b[i].tag && l.route === b[i].route && l.reason === b[i].reason);

export class WalkMode {
  readonly walker: WalkController;
  active = false;
  private readonly core: EstateCore;
  private readonly view: ViewAccess;
  private readonly host: HTMLElement;
  private readonly world: WalkWorld;
  private climb: Climb | null = null;
  private climbSite = -1;
  /** Holding PgUp / PgDn keeps climbing this way storey by storey. */
  private climbHold: 'up' | 'down' | null = null;
  private ride: Ride | null = null;
  private route: RouteState | null = null;
  private spawn: WalkSpawn | null = null;
  /** enter(site, { storey }): ride there once the walker stands on that building's grid. */
  private pendingStorey: { site: number; tag: EstateStoreyTag; untilMs: number } | null = null;
  private fade: HTMLElement | null = null;
  private lastCheck = -Infinity;
  private publishedSite = -2;
  private publishedLayer = -2;
  private hintSite = -2;
  private hintLayer = -2;
  private walkView: EstateWalkView | null = null;
  private liftLift: NavLift | null = null;
  private levels: readonly EstateWalkLevel[] = [];
  private levelsKey = '';
  private readonly cp: ClimbPose = { x: 0, y: 0, z: 0, heading: 0, done: false };
  private readonly fs: FadeState = { opacity: 0, cut: false, done: false };
  private readonly lp: WalkPose = { x: 0, y: 0, z: 0, layer: -1 };
  private readonly loc: InteriorLocation = { site: null, storey: null, unit: null, room: null };
  private readonly so: StairOfferState = { label: '', up: null, down: null, distance: 0 };
  private readonly choice: StairChoice = { stair: -1, dir: 'up', to: -1 };
  private readonly entry: InteriorEntry = { state: 'absent', reason: null };

  constructor(core: EstateCore, view: ViewAccess, host: HTMLElement) {
    this.core = core;
    this.view = view;
    this.host = host;
    const pack = core.pack!;
    const interiors = core.interiors!;
    this.world = {
      sites: pack.sites,
      extent: pack.estate.extent as unknown as readonly [number, number, number, number],
      floorQuery: (x, y, feetZ, out, hit) => interiors.floorQuery(x, y, feetZ, out, hit),
      walk: (index) => interiors.walk(index),
      ground: () => interiors.ground(),
      indexOf: (site) => interiors.indexOf(site),
      entryFailed: (index) => interiors.entry(index, this.entry).state === 'failed',
    };
    this.walker = new WalkController(this.world);
  }

  private get camera(): PerspectiveCamera { return this.core.camera; }
  private get halted(): boolean { return this.core.options.motionHalted(); }

  get transition(): 'climb' | 'fade' | null {
    return this.ride ? 'fade' : this.climb ? 'climb' : null;
  }

  get busy(): boolean {
    return this.ride !== null || this.climb !== null;
  }

  /** The building underfoot (its grid), or null. */
  get siteId(): EstateSiteId | null {
    return this.walker.site >= 0 ? ESTATE_SITE_IDS[this.walker.site] : null;
  }

  // ---- starting and stopping -----------------------------------------------------------

  /** Walk from `spawn` (a cut): the feet on its floor, facing its way. Remembered for Home. */
  start(spawn: WalkSpawn, storey?: { site: number; tag: EstateStoreyTag }): void {
    this.cancelAll();
    this.spawn = spawn;
    this.active = true;
    this.walker.place(spawn.x, spawn.y, spawn.z, spawn.yaw, 0);
    this.walker.apply(this.camera);
    this.pendingStorey = storey ? { ...storey, untilMs: now() + 30_000 } : null;
    this.lastCheck = -Infinity;
    this.publish();
  }

  /** Walk from the camera's own pose (Fly → Walk, a resume): feet under the eye; `holdSite` holds it for that building's grid (a resume inside). */
  startAt(x: number, y: number, feetZ: number, yaw: number, pitch: number, holdSite = -1): void {
    this.cancelAll();
    this.active = true;
    this.walker.place(x, y, feetZ, yaw, pitch, holdSite);
    this.walker.apply(this.camera);
    this.spawn = { x: this.walker.x, y: this.walker.y, z: this.walker.z, yaw, name: 'start' };
    this.lastCheck = -Infinity;
    this.publish();
  }

  /** Leave Walk: transitions dropped, the paper down, the storey hint cleared, view.walk null. */
  stop(): void {
    if (!this.active) return;
    this.cancelAll();
    this.active = false;
    this.walker.stop();
    this.setHint(-1, -1);
    this.walkView = null;
    this.liftLift = null;
    this.levels = [];
    this.levelsKey = '';
    // The lift popover belongs to Walk: it goes with it (help stays).
    this.view.set({ walk: null, transition: null, ...(this.view.get().popover === 'lift' ? { popover: null } : {}) });
  }

  /** Frozen: a climb or ride lands at its end now; keys and the stick let go. */
  freeze(): void {
    this.walker.stop();
    if (this.climb) this.finishClimbAt(this.climb.to);
    if (this.ride) this.finishRide();
    this.route = null;
  }

  dispose(): void {
    this.fade?.remove();
    this.fade = null;
    this.setHint(-1, -1);
  }

  private cancelAll() {
    this.climb = null;
    this.climbHold = null;
    this.route = null;
    if (this.ride) {
      this.ride = null;
      this.showFade(0);
    }
  }

  // ---- per frame ---------------------------------------------------------------------

  update(dt: number, held: HeldKeys, halted: boolean): boolean {
    if (!this.active) return false;
    const t = now();
    let moving = false;
    if (this.ride) {
      moving = true;
      this.stepRide(t, halted);
    } else if (this.climb) {
      moving = true;
      this.stepClimbFrame(dt, halted);
    } else {
      moving = this.walker.update(dt, held, halted, this.camera);
      if (this.pendingStorey && this.walker.site === this.pendingStorey.site && this.navOf(this.walker.site)) {
        const tag = this.pendingStorey.tag;
        this.pendingStorey = null;
        this.setStorey(tag);
        moving = true;
      } else if (this.pendingStorey && t > this.pendingStorey.untilMs) {
        this.pendingStorey = null;
      }
    }
    this.setHint(this.walker.site, this.walker.layer);
    // A new building or storey goes to the chip at once; the room and offers every WALK_CHECK_MS.
    const due = t - this.lastCheck >= WALK_CHECK_MS || this.walker.site !== this.publishedSite || this.walker.layer !== this.publishedLayer;
    if (!moving || due) this.publish();
    return moving;
  }

  /** A point 10 m along the level view from the eye (fog, far plane, resume). */
  target(out: { x: number; y: number; z: number }): void {
    const w = this.walker;
    out.x = w.x - Math.sin(w.look.yaw) * 10;
    out.y = w.y + Math.cos(w.look.yaw) * 10;
    out.z = w.spring.z + 1.6;
  }

  /** The interior's storey hint: the band's storey for the walker (walkBandStorey), or none off a grid. */
  private setHint(site: number, layer: number) {
    if (site >= 0 && layer >= 0) {
      const ffl = this.core.interiors?.table(site)?.ffl;
      if (ffl) layer = walkBandStorey(ffl, layer, this.walker.z);
    }
    if (site === this.hintSite && layer === this.hintLayer) return;
    this.hintSite = site;
    this.hintLayer = layer;
    this.core.interiors?.setStoreyHint(site >= 0 ? site : null, layer);
  }

  // ---- the view ----------------------------------------------------------------------

  private navOf(site: number): EstateNav | null {
    return site >= 0 ? this.core.interiors?.nav(site) ?? null : null;
  }

  /**
   * Location, offers and the strip into the view (update() calls it at once on
   * a building or storey change, else at most every WALK_CHECK_MS while moving
   * and on every frame at rest; commands call it after they move the walker).
   * `via` prefixes the storey announcement ('Lift 3').
   */
  private publish(via?: string) {
    this.lastCheck = now();
    const w = this.walker;
    this.publishedSite = w.site;
    this.publishedLayer = w.layer;
    const interiors = this.core.interiors;
    const site = w.site;
    const nav = this.navOf(site);
    const loc = this.loc;
    if (interiors) interiors.locate(w.x, w.y, w.z, loc, site >= 0 ? w.layer : -1);
    else { loc.site = null; loc.storey = null; loc.unit = null; loc.room = null; }
    const siteId = loc.site ?? (site >= 0 ? ESTATE_SITE_IDS[site] : null);
    const storeyTag = site >= 0 && w.layer >= 0 ? interiors?.table(site)?.tags[w.layer] ?? null : loc.storey;

    const quiet = this.transition === null;
    let lift: NavLift | null = null;
    let stair: StairOfferState | null = null;
    if (nav && quiet && w.layer >= 0) {
      const at = this.world.sites[site].at;
      const lx = w.x - at[0];
      const ly = w.y - at[1];
      lift = liftOffer(nav, w.layer, lx, ly);
      stair = stairOffer(nav, w.layer, lx, ly, w.z, this.so, interiors?.walk(site) ?? null);
    }
    this.liftLift = lift;

    const key = nav ? `${site}:${w.layer}` : '';
    if (key !== this.levelsKey) {
      this.levelsKey = key;
      const levels: EstateWalkLevel[] = nav && w.layer >= 0 ? walkLevels(nav, w.layer).map((l) => Object.freeze({ ...l })) : [];
      if (!sameLevels(levels, this.levels)) this.levels = Object.freeze(levels);
    }

    const liftView: EstateLiftOffer | null = lift && storeyTag
      ? { name: lift.name, text: liftChip(lift), current: storeyTag, served: Object.freeze(servedLevels(lift)) }
      : null;
    const stairView: EstateStairOffer | null = stair && nav
      ? {
        label: stair.label,
        up: stair.up ? nav.storeys[stair.up.to].tag : null,
        down: stair.down ? nav.storeys[stair.down.to].tag : null,
        text: stairChip(stair.label, stair.up ? nav.storeys[stair.up.to].tag : null, stair.down ? nav.storeys[stair.down.to].tag : null),
      }
      : null;
    const next: EstateWalkView = {
      site: site >= 0 ? ESTATE_SITE_IDS[site] : null,
      storey: site >= 0 ? storeyTag : null,
      preparing: w.preparing,
      lift: liftView,
      stair: stairView,
      ride: this.ride ? this.ride.text : null,
      levels: this.levels,
    };
    const prev = this.walkView;
    const same = prev !== null && prev.site === next.site && prev.storey === next.storey && prev.preparing === next.preparing
      && prev.ride === next.ride && prev.levels === next.levels
      && (prev.lift === null) === (next.lift === null) && (!prev.lift || (prev.lift.name === next.lift!.name && prev.lift.current === next.lift!.current))
      && (prev.stair === null) === (next.stair === null) && (!prev.stair || prev.stair.text === next.stair!.text);
    if (!same) {
      this.walkView = Object.freeze({
        ...next,
        lift: next.lift ? Object.freeze(next.lift) : null,
        stair: next.stair ? Object.freeze(next.stair) : null,
      });
    }
    // The lift popover answers the offer: walked away from the landing (or a ride
    // under way), it closes, so Esc never peels a popover no one can see.
    const closeLift = this.view.get().popover === 'lift' && this.walkView?.lift == null;
    this.view.set({
      location: { site: siteId, storey: storeyTag, unit: loc.unit, room: loc.room, mode: 'walk' },
      walk: this.walkView,
      transition: this.transition,
      ...(closeLift ? { popover: null } : {}),
    }, via);
  }

  // ---- lifts ---------------------------------------------------------------------------

  /** takeLift(level): the offered lift, to one of its served levels other than this one. */
  takeLift(level: EstateStoreyTag): boolean {
    if (!this.active || this.busy) return false;
    const w = this.walker;
    const nav = this.navOf(w.site);
    if (!nav || w.layer < 0) return false;
    const at = this.world.sites[w.site].at;
    const lift = liftOffer(nav, w.layer, w.x - at[0], w.y - at[1]);
    if (!lift) return false;
    const to = nav.storeys.findIndex((s) => s.tag === level);
    if (to < 0 || to === w.layer || !lift.served.includes(level) || !lift.landings[level]) return false;
    this.route = null;
    return this.rideLift(lift, w.layer, to, null);
  }

  /**
   * Ride `lift` from storey `from` to `to`. With `toStair`, the route climbs on
   * from there: the ride lands at the start of that way's nearest stair line
   * instead of out of the car (the climb is the route's next leg).
   */
  private rideLift(lift: NavLift, from: number, to: number, toStair: 'up' | 'down' | null): boolean {
    const w = this.walker;
    const nav = this.navOf(w.site);
    const walk = this.core.interiors?.walk(w.site);
    if (!nav || !walk) return false;
    const arrival: Arrival = { x: 0, y: 0, z: 0, layer: -1, heading: 0 };
    let ok = false;
    if (toStair) {
      const landing = lift.landings[nav.storeys[to].tag];
      const choice = landing ? stairFor(nav, to, toStair, landing.xy[0], landing.xy[1], this.choice) : null;
      ok = choice !== null && stairStart(nav, walk, choice, arrival);
    }
    if (!ok) ok = liftArrival(nav, walk, lift, to, arrival);
    if (!ok) return false;
    this.ride = {
      startMs: now(), text: rideCaption(liftLabel(lift), nav.storeys[from].tag, nav.storeys[to].tag), via: lift.name,
      site: w.site, arrival, cut: false, then: null,
    };
    this.walker.stop();
    if (this.view.get().popover === 'lift') this.view.set({ popover: null });
    this.publish();
    this.core.invalidate();
    return true;
  }

  private stepRide(t: number, halted: boolean) {
    const ride = this.ride;
    if (!ride) return;
    const f = fadeAt(halted ? Infinity : t - ride.startMs, this.fs);
    if (f.cut && !ride.cut) this.cutRide(ride);
    // Halted: one cut, no paper.
    this.showFade(halted ? 0 : f.opacity);
    if (f.done) this.endRide(ride);
  }

  private cutRide(ride: Ride) {
    ride.cut = true;
    const a = ride.arrival;
    this.walker.placeOn(ride.site, a, headingToThreeYaw(a.heading, this.world.sites[ride.site]));
    this.walker.look.pitch = 0;
    this.walker.apply(this.camera);
    this.setHint(this.walker.site, this.walker.layer);
    this.publish(ride.via);
  }

  private endRide(ride: Ride) {
    this.ride = null;
    this.showFade(0);
    if (ride.then) this.beginClimb(ride.then);
    else this.nextLeg();
    this.publish();
  }

  /** Land a ride now: before its cut it never happened, after it the walker has arrived. */
  private finishRide(nearest = false) {
    const ride = this.ride;
    if (!ride) return;
    if (!ride.cut && !nearest) this.cutRide(ride);
    if (!ride.cut && nearest && now() - ride.startMs >= 125) this.cutRide(ride);
    this.ride = null;
    this.showFade(0);
    this.route = null;
    this.publish();
  }

  private showFade(opacity: number) {
    let el = this.fade;
    if (!el) {
      if (opacity <= 0) return;
      el = this.host.ownerDocument.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.dataset.estateFade = '';
      // Between the canvas (z 1, earlier in the stage) and the HUD (z 2): paper, the stage's own ground.
      Object.assign(el.style, {
        position: 'absolute', inset: '0', zIndex: '1', background: 'var(--paper-75)', pointerEvents: 'none', opacity: '0', display: 'none',
      });
      this.host.appendChild(el);
      this.fade = el;
    }
    if (opacity <= 0) {
      el.style.display = 'none';
      el.style.opacity = '0';
    } else {
      el.style.display = 'block';
      el.style.opacity = opacity.toFixed(3);
    }
  }

  // ---- stairs ----------------------------------------------------------------------------

  /** takeStairs(dir): the offered stair core, one storey up or down. */
  takeStairs(direction: EstateStep, hold = false): boolean {
    if (!this.active || this.busy) return false;
    const stair = this.currentStairOffer();
    const choice = stair ? (direction > 0 ? stair.up : stair.down) : null;
    if (!choice) return false;
    this.route = null;
    this.climbHold = hold ? (direction > 0 ? 'up' : 'down') : null;
    return this.beginClimb(choice);
  }

  private currentStairOffer(): StairOfferState | null {
    const w = this.walker;
    const nav = this.navOf(w.site);
    if (!nav || w.layer < 0) return null;
    const at = this.world.sites[w.site].at;
    return stairOffer(nav, w.layer, w.x - at[0], w.y - at[1], w.z, this.so, this.core.interiors?.walk(w.site) ?? null);
  }

  private beginClimb(choice: StairChoice): boolean {
    const w = this.walker;
    const nav = this.navOf(w.site);
    const path = nav ? stairPaths(nav)[choice.stair] : null;
    if (!nav || !path || !w.localPose(this.lp)) return false;
    const site = this.world.sites[w.site];
    const heading = threeYawToHeading(w.look.yaw, site);
    const from = [this.lp.x, this.lp.y, this.lp.z];
    this.climb = startClimb(path, from, heading, choice.dir, this.halted);
    this.climbSite = w.site;
    this.walker.stop();
    this.publish();
    this.core.invalidate();
    return true;
  }

  private stepClimbFrame(dt: number, halted: boolean) {
    const climb = this.climb;
    if (!climb) return;
    const pose = stepClimb(climb, dt, halted, this.cp);
    this.applyClimbPose(pose);
    if (pose.done) this.endClimb();
  }

  private applyClimbPose(pose: ClimbPose) {
    const w = this.walker;
    const site = this.world.sites[this.climbSite];
    w.x = pose.x + site.at[0];
    w.y = pose.y + site.at[1];
    w.z = pose.z;
    w.spring.z = pose.z;
    w.spring.v = 0;
    w.site = this.climbSite;
    w.floorHere();
    w.look.yaw = headingToThreeYaw(pose.heading, site);
    w.apply(this.camera);
  }

  /** A climb ended (arrived, cut, or landed by Esc): stand on the floor there, then chain on. */
  private endClimb() {
    const climb = this.climb;
    this.climb = null;
    const w = this.walker;
    const walk = this.core.interiors?.walk(this.climbSite);
    if (walk && w.localPose(this.lp) && nearestWalkable(walk, this.lp.x, this.lp.y, this.lp.z, 0.6, this.lp)) {
      w.placeOn(this.climbSite, this.lp, w.look.yaw);
      w.apply(this.camera);
    }
    this.setHint(w.site, w.layer);
    if (climb && climb.state === 'done') {
      if (this.route && this.nextLeg()) return;
      if (this.climbHold && this.chainClimb(this.climbHold)) return;
    }
    this.climbHold = null;
    this.publish();
  }

  /** Holding PgUp / PgDn: the next flight of the same core from the storey just reached. */
  private chainClimb(dir: 'up' | 'down'): boolean {
    const w = this.walker;
    const nav = this.navOf(w.site);
    if (!nav || w.layer < 0) return false;
    const at = this.world.sites[w.site].at;
    const choice = stairFor(nav, w.layer, dir, w.x - at[0], w.y - at[1], this.choice);
    if (!choice) return false;
    const path = stairPaths(nav)[choice.stair];
    if (!path) return false;
    const k = dir === 'up' ? 0 : 3 * (path.count - 1);
    if (Math.hypot(path.xyz[k] - (w.x - at[0]), path.xyz[k + 1] - (w.y - at[1])) > STAIR_CUT_REACH) return false;
    if (!stairStartOnFoot(nav, this.core.interiors?.walk(w.site) ?? null, choice, w.x - at[0], w.y - at[1], w.z, STAIR_CUT_REACH + 0.5)) return false;
    return this.beginClimb({ ...choice });
  }

  private finishClimbAt(s: number) {
    const climb = this.climb;
    if (!climb) return;
    climb.s = s;
    climb.state = 'done';
    this.applyClimbPose(stepClimb(climb, 0, false, this.cp));
    this.climbHold = null;
    this.route = null;
    this.endClimb();
  }

  // ---- the storey strip and PgUp / PgDn ---------------------------------------------------

  /** setStorey: one storey (±1) or a tag, by the offered stair for a neighbour, else the strip's route. */
  setStorey(target: EstateStep | EstateStoreyTag): boolean {
    if (!this.active || this.busy) return false;
    const w = this.walker;
    const nav = this.navOf(w.site);
    if (!nav || w.layer < 0) return false;
    const to = typeof target === 'number' ? w.layer + target : nav.storeys.findIndex((s) => s.tag === target);
    if (to < 0 || to >= nav.storeys.length || to === w.layer) return false;
    const tag = nav.storeys[to].tag;
    // A neighbour through the stair core the walker is in: climb it.
    if (Math.abs(to - w.layer) === 1) {
      const offer = this.currentStairOffer();
      const choice = offer ? (to > w.layer ? offer.up : offer.down) : null;
      if (choice && choice.to === to) { this.route = null; return this.beginClimb(choice); }
    }
    const route = planRoute(nav, w.layer, to);
    if (!route) {
      this.view.announce(false, noRouteReason(tag));
      return false;
    }
    this.route = { legs: route.legs, next: 0, target: tag };
    if (!this.nextLeg()) {
      this.route = null;
      this.view.announce(false, noRouteReason(tag));
      return false;
    }
    return true;
  }

  /** Run the route's next leg: a ride (landing at the next stair's start when stairs follow), or a climb. False if it cannot start. */
  private nextLeg(): boolean {
    const route = this.route;
    if (!route) return false;
    const leg = route.legs[route.next];
    if (!leg) { this.route = null; return false; }
    route.next += 1;
    const w = this.walker;
    const nav = this.navOf(w.site);
    if (!nav) { this.route = null; return false; }
    const at = this.world.sites[w.site].at;
    const lx = w.x - at[0];
    const ly = w.y - at[1];
    if (leg.kind === 'lift') {
      const lift = nearestLift(nav, leg.from, lx, ly, leg.to);
      if (!lift) { this.route = null; return false; }
      const following = route.legs[route.next];
      const toStair = following && following.kind === 'stairs' ? (following.to > following.from ? 'up' : 'down') : null;
      if (!this.rideLift(lift, leg.from, leg.to, toStair)) { this.route = null; return false; }
      return true;
    }
    const dir = leg.to > leg.from ? 'up' : 'down';
    const choice = stairFor(nav, leg.from, dir, lx, ly, { stair: -1, dir, to: -1 });
    if (!choice) { this.route = null; return false; }
    const path = stairPaths(nav)[choice.stair]!;
    const k = dir === 'up' ? 0 : 3 * (path.count - 1);
    if (Math.hypot(path.xyz[k] - lx, path.xyz[k + 1] - ly) > STAIR_CUT_REACH
      || !stairStartOnFoot(nav, this.core.interiors?.walk(w.site) ?? null, choice, lx, ly, w.z, STAIR_CUT_REACH + 0.5)) {
      // Too far to walk onto the line, or near but behind a wall: a paper cut to its start, then the climb.
      const walk = this.core.interiors?.walk(w.site);
      const arrival: Arrival = { x: 0, y: 0, z: 0, layer: -1, heading: 0 };
      if (!walk || !stairStart(nav, walk, choice, arrival)) { this.route = null; return false; }
      const stair = nav.stairs[choice.stair];
      this.ride = {
        startMs: now(), text: rideCaption(stairLabel(stair), nav.storeys[leg.from].tag, nav.storeys[leg.to].tag), via: undefined,
        site: w.site, arrival, cut: false, then: { ...choice },
      };
      this.walker.stop();
      this.publish();
      this.core.invalidate();
      return true;
    }
    return this.beginClimb({ ...choice });
  }

  /** PgUp / PgDn pressed (a hold): a lift in the lobby rides one level; a stair core climbs, and keeps climbing while held. */
  storeyKey(direction: EstateStep): boolean {
    if (!this.active || this.busy) return false;
    const w = this.walker;
    const nav = this.navOf(w.site);
    if (!nav || w.layer < 0) return false;
    const at = this.world.sites[w.site].at;
    const lift = liftOffer(nav, w.layer, w.x - at[0], w.y - at[1]);
    if (lift) {
      const served = servedLevels(lift).map((tag) => nav.storeys.findIndex((s) => s.tag === tag)).filter((i) => i >= 0);
      const next = direction > 0 ? served.find((i) => i > w.layer) : [...served].reverse().find((i) => i < w.layer);
      if (next !== undefined) { this.route = null; return this.rideLift(lift, w.layer, next, null); }
    }
    return this.takeStairs(direction, true);
  }

  /** PgUp / PgDn let go: the climb in hand finishes its storey and stops there. */
  storeyKeyUp(): void {
    this.climbHold = null;
  }

  /** Enter in Walk: the offered lift opens its popover; otherwise the offered stair, up if it goes up. */
  activate(): 'lift' | boolean {
    if (!this.active || this.busy) return false;
    if (this.liftLift) return 'lift';
    const offer = this.currentStairOffer();
    if (offer?.up) return this.takeStairs(1);
    if (offer?.down) return this.takeStairs(-1);
    return false;
  }

  // ---- input -------------------------------------------------------------------------------

  /** Esc's cancel-transition: a climb lands at its nearer end, a ride at its nearer end. */
  cancelTransition(): boolean {
    if (this.ride) {
      this.finishRide(true);
      return true;
    }
    const climb = this.climb;
    if (climb) {
      cancelClimb(climb, 'nearest-end', this.cp);
      this.applyClimbPose(this.cp);
      this.climbHold = null;
      this.route = null;
      this.endClimb();
      return true;
    }
    return false;
  }

  /** A movement key, drag, wheel, step or the stick: a climb stops where it is (a ride runs on). */
  interrupt(): void {
    const climb = this.climb;
    if (!climb) return;
    cancelClimb(climb, 'here', this.cp);
    this.applyClimbPose(this.cp);
    this.climbHold = null;
    this.route = null;
    this.endClimb();
  }

  step(kind: EstateWalkStep): boolean {
    if (!this.active || this.ride) return false;
    this.interrupt();
    const w = this.walker;
    switch (kind) {
      case 'forward': w.stepBy(WALK_STEP, 0); break;
      case 'back': w.stepBy(-WALK_STEP, 0); break;
      case 'left': w.stepBy(0, -WALK_STEP); break;
      case 'right': w.stepBy(0, WALK_STEP); break;
      case 'turn-left': w.turn(STEP_TURN, 0); break;
      case 'turn-right': w.turn(-STEP_TURN, 0); break;
      case 'look-up': w.turn(0, STEP_TILT); break;
      case 'look-down': w.turn(0, -STEP_TILT); break;
      default: return false;
    }
    this.afterNudge();
    return true;
  }

  /** The wheel: ±0.5 m per notch along the level view, at most three notches at once. */
  wheel(steps: number): boolean {
    if (!this.active || this.ride || steps === 0) return false;
    this.interrupt();
    const n = Math.max(-3, Math.min(3, steps));
    this.walker.stepBy(n * WALK_STEP, 0);
    this.afterNudge();
    return true;
  }

  dragLook(dx: number, dy: number): void {
    if (!this.active || this.ride) return;
    this.interrupt();
    this.walker.dragLook(dx, dy, this.camera.fov);
    this.walker.apply(this.camera);
  }

  dragStrafe(dx: number, dy: number): void {
    if (!this.active || this.ride) return;
    this.interrupt();
    this.walker.dragStrafe(dx, dy);
    this.afterNudge();
  }

  setStick(x: number, y: number): boolean {
    if (!this.active) return false;
    const clamp = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
    const sx = clamp(x);
    const sy = clamp(y);
    if (sx !== 0 || sy !== 0) this.interrupt();
    if (sx === this.walker.stickX && sy === this.walker.stickY) return false;
    this.walker.stickX = sx;
    this.walker.stickY = sy;
    this.core.invalidate();
    return true;
  }

  /** Home in Walk: back to where this walk began (a cut). */
  respawn(): boolean {
    if (!this.active || !this.spawn) return false;
    const s = this.spawn;
    this.start(s);
    this.core.invalidate();
    return true;
  }

  private afterNudge() {
    this.walker.apply(this.camera);
    this.setHint(this.walker.site, this.walker.layer);
    this.publish();
    this.core.invalidate();
  }
}
