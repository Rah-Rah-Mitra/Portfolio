import type { Vec2, Vec3 } from './frames';
import {
  ESTATE_SITE_STOREYS, ESTATE_STOREY_FFL, normaliseStoreyTag, type EstateSiteId, type EstateStoreyTag,
} from './ids';
import { pointInPolygon } from './storeys';

// The per-building navigation file (plan §6.2 step 11, §8.4–§8.6):
// nav/<ID>.<h8>.json.gz, gzipped `portfolio/estate-nav/1`, written by the pack
// tool (scripts/estate/lib/nav.mjs and lib/pure/navjson.mjs). The engine's
// loader gunzips it; parseNav turns the JSON into the structures the engine
// reads: rooms (the location chip's unit and room, Plan's room list), lift
// landings (the lift chip, arrivals), passable doors, stairs (with their
// walking path, for "take stairs") and the entrance spawns (Enter, the 2 key).
// Pure, so node tests and the engine run the same code.
//
// Frame: block-local, Z up, metres (the walk grid's and storeys.ts' frame).
// Rooms are polygons in plan with a floor `z` relative to their storey's FFL
// (0 unless stated) and a height `h` (the file's commonest unless stated).
//
// The file stores a typical storey's rooms once, with name templates ({S} for
// the storey number as L-tags spell it, {SS} for the two-digit form flat
// numbers use: '#{SS}-101' on L5 is '#05-101'), plus every other storey
// explicitly; doors are grouped the same way. parseNav expands both, so
// `rooms[s]` and `doors[s]` are storey s's own lists (s = the storey index of
// ids.ts, the walk layer, uStoreyMask's index). Expansion is the inverse of the
// tool's templateName, the same rule navjson.mjs expandRooms applies
// (tests/estate-nav.test.ts holds the two together). Polygons are shared,
// frozen arrays, never copied per storey.

export const NAV_SCHEMA = 'portfolio/estate-nav/1';
export const NAV_FRAME = 'block-local, Z up, m';

export interface NavRoom {
  /** As the data spells it: '#05-104 LIV', 'L1-STAIR1', 'L2-LOT-008'. */
  readonly name: string;
  /** The room label the chip shows: 'Living / Dining', 'Stair 1', 'Car lot L2-008 (S)'. */
  readonly label: string;
  /** The flat it belongs to, '#05-104', or null for common areas. */
  readonly flat: string | null;
  /** Floor above the storey's FFL, m (0 for most rooms). */
  readonly z: number;
  /** Clear height, m. */
  readonly h: number;
  /** Open to the air (a void deck, a roof deck). */
  readonly ext: boolean;
  /** Outline, block-local [x, y], open (no closing repeat). */
  readonly poly: readonly Vec2[];
  /** Plan area, m², and bounding box [minX, minY, maxX, maxY]: roomAt's quick reject and tie-break. */
  readonly area: number;
  readonly box: readonly [number, number, number, number];
}

/** One passable door: the doorway's centre on its wall line, the unit direction along the wall, the width. */
export interface NavDoor { readonly x: number; readonly y: number; readonly ax: number; readonly ay: number; readonly w: number }

export interface NavLanding {
  /** 0.4 m out from the landing door on the lobby side, block-local. */
  readonly xy: Vec2;
  /** Out of the car, unit plan direction. */
  readonly facing: Vec2;
}

export interface NavLift {
  /** 'Lift 1'. */
  readonly name: string;
  /** Storey tags served, bottom-up. */
  readonly served: readonly EstateStoreyTag[];
  readonly landings: Readonly<Partial<Record<EstateStoreyTag, NavLanding>>>;
}

export interface NavFlight {
  readonly start: Vec3;
  readonly end: Vec3;
  readonly width: number;
  readonly risers: number;
  readonly riser: number;
  readonly going: number;
}

export interface NavStair {
  /** 'L5 stair 2'. */
  readonly name: string;
  /** The stair room's name on `storey`: 'L5-STAIR2'. */
  readonly room: string;
  /** From this storey up to `to`. */
  readonly storey: EstateStoreyTag;
  readonly to: EstateStoreyTag;
  readonly fromFfl: number;
  readonly toFfl: number;
  readonly flights: readonly NavFlight[];
  readonly landings: readonly { readonly z: number; readonly polygon: readonly Vec2[] }[];
  /** Landing centre → flights → next landing centre, block-local Z up (climb.ts stairPath). Empty if upstream wrote none. */
  readonly path: readonly Vec3[];
}

export interface NavSpawn { readonly name: string; readonly pos: Vec3; readonly facing: Vec2 }

export interface NavStorey { readonly tag: EstateStoreyTag; readonly ffl: number; readonly geom: 'typical' | 'special' }

export interface EstateNav {
  readonly site: EstateSiteId;
  readonly storeys: readonly NavStorey[];
  /** The commonest room height, m. */
  readonly roomHeight: number;
  /** Per storey index: that storey's rooms, expanded. */
  readonly rooms: readonly (readonly NavRoom[])[];
  /** Per storey index: that storey's passable doors, expanded. */
  readonly doors: readonly (readonly NavDoor[])[];
  readonly lifts: readonly NavLift[];
  readonly stairs: readonly NavStair[];
  /** Entrance spawns, block-local (the pack's `spawns` carry the same points in the estate frame). */
  readonly spawns: readonly NavSpawn[];
}

export class NavFormatError extends Error {
  /** JSON path of the value at fault: 'rooms.typical.rooms[3].poly'. */
  readonly path: string;
  constructor(path: string, problem: string) {
    super(`nav ${path}: ${problem}`);
    this.name = 'NavFormatError';
    this.path = path;
  }
}

const fail = (path: string, problem: string): never => {
  throw new NavFormatError(path, problem);
};

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown, path: string): Json => (isObject(v) ? v : fail(path, 'is not an object'));
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(path, 'is not an array'));
const num = (v: unknown, path: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail(path, 'is not a finite number'));
const str = (v: unknown, path: string): string => (typeof v === 'string' ? v : fail(path, 'is not a string'));
const vec = (v: unknown, n: number, path: string): number[] => {
  const a = arr(v, path);
  if (a.length !== n) fail(path, `has ${a.length} numbers, not ${n}`);
  return a.map((x, i) => num(x, `${path}[${i}]`));
};
const tagOf = (v: unknown, path: string): EstateStoreyTag => {
  const tag = normaliseStoreyTag(v);
  return tag !== null && tag === v ? tag : fail(path, `${JSON.stringify(v)} is not a canonical storey tag`);
};

/** 'L5' → 5; 'RF' → null (the roof has no number and no template). */
const storeyNumber = (tag: EstateStoreyTag): number | null => (tag === 'RF' ? null : Number(tag.slice(1)));
const pad2 = (n: number) => String(n).padStart(2, '0');

/** The inverse of the pack tool's templateName for storey number n ({SS} first: it contains {S}'s braces). */
export const expandName = (text: string, n: number): string => text.split('{SS}').join(pad2(n)).split('{S}').join(String(n));

const ringOf = (v: unknown, path: string): Vec2[] => {
  const pts = arr(v, path).map((p, i) => vec(p, 2, `${path}[${i}]`) as Vec2);
  // Tolerate a closing repeat (the tool strips it; landings keep theirs).
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  if (pts.length < 3) fail(path, `has ${pts.length} distinct points; a polygon needs 3`);
  return pts;
};

const areaOf = (ring: readonly Vec2[]): number => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a) / 2;
};

const boxOf = (ring: readonly Vec2[]): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
};

interface RawRoom { name: string; label: string; flat: string | null; z: number; h: number; ext: boolean; poly: readonly Vec2[]; area: number; box: readonly [number, number, number, number] }

const rawRoom = (v: unknown, path: string, roomHeight: number): RawRoom => {
  const o = obj(v, path);
  const poly = Object.freeze(ringOf(o.poly, `${path}.poly`).map((p) => Object.freeze(p) as Vec2));
  return {
    name: str(o.name, `${path}.name`),
    label: o.label === undefined ? str(o.name, `${path}.name`) : str(o.label, `${path}.label`),
    flat: o.flat === undefined || o.flat === null ? null : str(o.flat, `${path}.flat`),
    z: o.z === undefined ? 0 : num(o.z, `${path}.z`),
    h: o.h === undefined ? roomHeight : num(o.h, `${path}.h`),
    ext: o.ext === undefined ? false : o.ext === true ? true : fail(`${path}.ext`, 'is not true'),
    poly,
    area: areaOf(poly),
    box: Object.freeze(boxOf(poly)),
  };
};

const expandRoom = (room: RawRoom, n: number): NavRoom => Object.freeze({
  ...room,
  name: expandName(room.name, n),
  label: expandName(room.label, n),
  flat: room.flat === null ? null : expandName(room.flat, n),
});

const door = (v: unknown, path: string): NavDoor => {
  const [x, y, ax, ay, w] = vec(v, 5, path);
  if (!(w > 0)) fail(`${path}[4]`, `width ${w} m`);
  return Object.freeze({ x, y, ax, ay, w });
};

/**
 * Turn a parsed nav JSON into an EstateNav. Throws NavFormatError (with the
 * JSON path) on anything the engine could not use: another schema or frame,
 * storeys that are not the site's own (ids.ts tags, FFLs within 0.5 mm), a
 * typical group naming a storey without a number or one listed explicitly too,
 * a room, door, lift landing, stair or spawn that is malformed, or names a
 * storey the building does not have. With `site` the file must be that site's.
 */
export const parseNav = (input: unknown, site?: EstateSiteId): EstateNav => {
  const root = obj(input, '$');
  if (root.schema !== NAV_SCHEMA) fail('schema', `${JSON.stringify(root.schema)} is not ${NAV_SCHEMA}`);
  if (root.frame !== NAV_FRAME) fail('frame', `${JSON.stringify(root.frame)} is not "${NAV_FRAME}"`);
  const id = str(root.site, 'site');
  const tags = ESTATE_SITE_STOREYS[id as EstateSiteId];
  if (!tags) fail('site', `${JSON.stringify(id)} is not an estate site`);
  if (site !== undefined && id !== site) fail('site', `is ${id}, expected ${site}`);
  const siteId = id as EstateSiteId;
  const ffls = ESTATE_STOREY_FFL[siteId];

  const storeysIn = arr(root.storeys, 'storeys');
  if (storeysIn.length !== tags.length) fail('storeys', `${siteId} has ${tags.length} storeys; the file lists ${storeysIn.length}`);
  const storeys: NavStorey[] = storeysIn.map((v, i) => {
    const o = obj(v, `storeys[${i}]`);
    const tag = tagOf(o.tag, `storeys[${i}].tag`);
    if (tag !== tags[i]) fail(`storeys[${i}].tag`, `is ${tag}; ${siteId} storey ${i} is ${tags[i]}`);
    const ffl = num(o.ffl, `storeys[${i}].ffl`);
    if (Math.abs(ffl - ffls[i]) > 0.0005) fail(`storeys[${i}].ffl`, `is ${ffl}; ${siteId} ${tag} is at ${ffls[i]}`);
    const geom = o.geom === 'typical' || o.geom === 'special' ? o.geom : fail(`storeys[${i}].geom`, 'is not typical or special');
    return Object.freeze({ tag, ffl: ffls[i], geom });
  });
  const indexOf = new Map<string, number>(storeys.map((s, i) => [s.tag, i]));
  const storeyAt = (v: unknown, path: string): number => {
    const tag = tagOf(v, path);
    const i = indexOf.get(tag);
    return i === undefined ? fail(path, `${siteId} has no storey ${tag}`) : i;
  };

  const roomHeight = num(root.roomHeight, 'roomHeight');

  // Rooms: typical (templated, once) + explicit storeys.
  const roomsByStorey: NavRoom[][] = storeys.map(() => []);
  const roomsIn = obj(root.rooms, 'rooms');
  const typicalTags = new Set<number>();
  if (roomsIn.typical !== null && roomsIn.typical !== undefined) {
    const t = obj(roomsIn.typical, 'rooms.typical');
    const raw = arr(t.rooms, 'rooms.typical.rooms').map((r, i) => rawRoom(r, `rooms.typical.rooms[${i}]`, roomHeight));
    arr(t.storeys, 'rooms.typical.storeys').forEach((v, k) => {
      const path = `rooms.typical.storeys[${k}]`;
      const s = storeyAt(v, path);
      const n = storeyNumber(storeys[s].tag);
      if (n === null) fail(path, `${storeys[s].tag} has no number to expand templates with`);
      if (typicalTags.has(s)) fail(path, `${storeys[s].tag} repeats`);
      typicalTags.add(s);
      roomsByStorey[s] = raw.map((room) => expandRoom(room, n as number));
    });
  }
  const explicitRooms = obj(roomsIn.storeys ?? {}, 'rooms.storeys');
  for (const [tag, list] of Object.entries(explicitRooms)) {
    const path = `rooms.storeys.${tag}`;
    const s = storeyAt(tag, path);
    if (typicalTags.has(s)) fail(path, `${tag} is both typical and explicit`);
    roomsByStorey[s] = arr(list, path).map((r, i) => Object.freeze(rawRoom(r, `${path}[${i}]`, roomHeight)) as NavRoom);
  }

  // Doors: grouped the same way, no templates.
  const doorsByStorey: NavDoor[][] = storeys.map(() => []);
  const doorsIn = obj(root.doors ?? { typical: null, storeys: {} }, 'doors');
  const typicalDoors = new Set<number>();
  if (doorsIn.typical !== null && doorsIn.typical !== undefined) {
    const t = obj(doorsIn.typical, 'doors.typical');
    const list = arr(t.doors, 'doors.typical.doors').map((d, i) => door(d, `doors.typical.doors[${i}]`));
    arr(t.storeys, 'doors.typical.storeys').forEach((v, k) => {
      const s = storeyAt(v, `doors.typical.storeys[${k}]`);
      typicalDoors.add(s);
      doorsByStorey[s] = list;
    });
  }
  for (const [tag, list] of Object.entries(obj(doorsIn.storeys ?? {}, 'doors.storeys'))) {
    const path = `doors.storeys.${tag}`;
    const s = storeyAt(tag, path);
    if (typicalDoors.has(s)) fail(path, `${tag} is both typical and explicit`);
    doorsByStorey[s] = arr(list, path).map((d, i) => door(d, `${path}[${i}]`));
  }

  const lifts: NavLift[] = arr(root.lifts ?? [], 'lifts').map((v, i) => {
    const path = `lifts[${i}]`;
    const o = obj(v, path);
    const served = arr(o.served, `${path}.served`).map((t, k) => storeys[storeyAt(t, `${path}.served[${k}]`)].tag);
    const landings: Partial<Record<EstateStoreyTag, NavLanding>> = {};
    for (const [tag, l] of Object.entries(obj(o.landings ?? {}, `${path}.landings`))) {
      const lp = `${path}.landings.${tag}`;
      const s = storeyAt(tag, lp);
      const lo = obj(l, lp);
      landings[storeys[s].tag] = Object.freeze({ xy: vec(lo.xy, 2, `${lp}.xy`) as Vec2, facing: vec(lo.facing, 2, `${lp}.facing`) as Vec2 });
    }
    return Object.freeze({ name: str(o.name, `${path}.name`), served: Object.freeze(served), landings: Object.freeze(landings) });
  });

  const stairs: NavStair[] = arr(root.stairs ?? [], 'stairs').map((v, i) => {
    const path = `stairs[${i}]`;
    const o = obj(v, path);
    const from = storeyAt(o.storey, `${path}.storey`);
    const to = storeyAt(o.to, `${path}.to`);
    if (to === from) fail(`${path}.to`, 'is the storey it starts on');
    const flights = arr(o.flights ?? [], `${path}.flights`).map((f, k) => {
      const fp = `${path}.flights[${k}]`;
      const fo = obj(f, fp);
      return Object.freeze({
        start: vec(fo.start, 3, `${fp}.start`) as Vec3,
        end: vec(fo.end, 3, `${fp}.end`) as Vec3,
        width: num(fo.width, `${fp}.width`),
        risers: num(fo.risers, `${fp}.risers`),
        riser: num(fo.riser, `${fp}.riser`),
        going: num(fo.going, `${fp}.going`),
      });
    });
    const landings = arr(o.landings ?? [], `${path}.landings`).map((l, k) => {
      const lp = `${path}.landings[${k}]`;
      const lo = obj(l, lp);
      return Object.freeze({ z: num(lo.z, `${lp}.z`), polygon: Object.freeze(ringOf(lo.polygon, `${lp}.polygon`)) });
    });
    const pathPts = arr(o.path ?? [], `${path}.path`).map((p, k) => Object.freeze(vec(p, 3, `${path}.path[${k}]`)) as Vec3);
    return Object.freeze({
      name: str(o.name, `${path}.name`),
      room: str(o.room, `${path}.room`),
      storey: storeys[from].tag,
      to: storeys[to].tag,
      fromFfl: num(o.from_ffl, `${path}.from_ffl`),
      toFfl: num(o.to_ffl, `${path}.to_ffl`),
      flights: Object.freeze(flights),
      landings: Object.freeze(landings),
      path: Object.freeze(pathPts),
    });
  });

  const spawns: NavSpawn[] = arr(root.spawns ?? [], 'spawns').map((v, i) => {
    const path = `spawns[${i}]`;
    const o = obj(v, path);
    return Object.freeze({ name: str(o.name, `${path}.name`), pos: vec(o.pos, 3, `${path}.pos`) as Vec3, facing: vec(o.facing, 2, `${path}.facing`) as Vec2 });
  });

  return Object.freeze({
    site: siteId,
    storeys: Object.freeze(storeys),
    roomHeight,
    rooms: Object.freeze(roomsByStorey.map((list) => Object.freeze(list))),
    doors: Object.freeze(doorsByStorey.map((list) => Object.freeze(list))),
    lifts: Object.freeze(lifts),
    stairs: Object.freeze(stairs),
    spawns: Object.freeze(spawns),
  });
};

// ---- queries ----------------------------------------------------------------------
//
// All block-local (the walk grid's frame). Allocation-free.

/**
 * The room on storey `storey` (index) that holds plan point (x, y): the smallest
 * by area when outlines nest or touch (a flat's foyer inside its hall's
 * outline reads as the foyer). With `feetZ` (block-local m) a room whose floor
 * band [FFL + z − 0.5, FFL + z + h) misses it is skipped, so a mezzanine does
 * not claim the floor under it. null on an unknown storey or outside every room.
 */
export const roomAt = (nav: EstateNav, storey: number, x: number, y: number, feetZ?: number): NavRoom | null => {
  const rooms = nav.rooms[storey];
  if (!rooms || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const ffl = nav.storeys[storey].ffl;
  let best: NavRoom | null = null;
  for (let i = 0; i < rooms.length; i += 1) {
    const room = rooms[i];
    const b = room.box;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    if (feetZ !== undefined && Number.isFinite(feetZ) && (feetZ < ffl + room.z - 0.5 || feetZ >= ffl + room.z + room.h)) continue;
    if (best !== null && room.area >= best.area) continue;
    if (pointInPolygon(x, y, room.poly)) best = room;
  }
  return best;
};

export interface LiftNear {
  lift: NavLift;
  landing: NavLanding;
  /** Plan distance from the point to the landing point, m. */
  distance: number;
}

/** Within this of a landing point the lift chip offers its levels (§8.5), m. */
export const LIFT_REACH = 1.5;

/**
 * The lift whose landing on storey `storey` (index) is nearest plan point
 * (x, y), within `reach` m (LIFT_REACH by default); fills `out` and returns it,
 * or null. Lifts not serving the storey are skipped.
 */
export const liftNear = (nav: EstateNav, storey: number, x: number, y: number, out: LiftNear, reach = LIFT_REACH): LiftNear | null => {
  const tag = nav.storeys[storey]?.tag;
  if (tag === undefined) return null;
  let found = false;
  let best = reach;
  for (let i = 0; i < nav.lifts.length; i += 1) {
    const lift = nav.lifts[i];
    const landing = lift.landings[tag];
    if (!landing) continue;
    const d = Math.hypot(landing.xy[0] - x, landing.xy[1] - y);
    if (d <= best) {
      best = d;
      out.lift = lift;
      out.landing = landing;
      out.distance = d;
      found = true;
    }
  }
  return found ? out : null;
};

/**
 * The stairs leaving storey `storey` (index): `up` are the flights from it to
 * the storey above, `down` those arriving at it from below (walked in reverse).
 * Pushes into the two arrays (cleared first) and returns them.
 */
export const stairsFrom = (nav: EstateNav, storey: number, up: NavStair[], down: NavStair[]): { up: NavStair[]; down: NavStair[] } => {
  up.length = 0;
  down.length = 0;
  const tag = nav.storeys[storey]?.tag;
  if (tag === undefined) return { up, down };
  for (let i = 0; i < nav.stairs.length; i += 1) {
    const stair = nav.stairs[i];
    if (stair.storey === tag) up.push(stair);
    if (stair.to === tag) down.push(stair);
  }
  return { up, down };
};
