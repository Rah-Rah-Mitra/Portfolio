// The per-building navigation file, nav/<ID>.<h8>.json (plan §6.2 step 11).
// Imports only sibling pure modules.
//
// Block-local, Z up, metres, rounded to 0.01 m, no GUIDs. A typical storey's
// rooms are stored once with name templates — {S} for the storey number as the
// L-tags spell it (L5), {SS} for the two-digit form flat numbers use (#05-103)
// — and expandRooms() reproduces every storey's list exactly; buildNav refuses
// to write a file that does not.

import { storeyNumber } from './storeys.mjs';

export const NAV_SCHEMA = 'portfolio/estate-nav/1';

/** Round to 0.01 m, with no negative zero. */
export const r2 = (v) => { const r = Math.round(v * 100) / 100; return r === 0 ? 0 : r; };
const r2v = (p) => p.map(r2);

const pad2 = (n) => String(n).padStart(2, '0');

/** A room name with its storey number replaced by template tokens. */
export const templateName = (text, n) => {
  if (text === null || text === undefined || n === null) return text ?? null;
  return text.replaceAll(`#${pad2(n)}-`, '#{SS}-').replace(new RegExp(`\\bL${n}(?![0-9])`, 'g'), 'L{S}');
};

/** The inverse of templateName for storey number n. */
export const expandName = (text, n) => (text === null || text === undefined ? null : text.replaceAll('{SS}', pad2(n)).replaceAll('{S}', String(n)));

// The polygon without its closing repeat, rounded.
const ring = (polygon) => {
  const pts = polygon.map(r2v);
  const last = pts[pts.length - 1];
  if (pts.length > 1 && last[0] === pts[0][0] && last[1] === pts[0][1]) pts.pop();
  return pts;
};

/**
 * One engine room as stored (concrete names). `z` is the floor relative to the
 * storey's FFL and is left out when 0; `h` is left out when it equals the
 * file's `roomHeight` (the commonest), which keeps a car park's 1,339 lots
 * inside the 48 KB nav cap.
 */
export const navRoom = (room, ffl, roomHeight = null) => {
  const out = { name: room.name, label: room.room ?? room.name };
  if (room.flat) out.flat = room.flat;
  const z = r2(room.floor_z - ffl);
  if (z !== 0) out.z = z;
  const h = r2(room.height);
  if (h !== roomHeight) out.h = h;
  if (room.external) out.ext = true;
  out.poly = ring(room.polygon);
  return out;
};

/** The commonest rounded room height (ties: the lower), or null with no rooms. */
export const commonHeight = (rooms) => {
  const counts = new Map();
  for (const r of rooms) { const h = r2(r.height); counts.set(h, (counts.get(h) ?? 0) + 1); }
  let best = null; let most = 0;
  for (const [h, n] of counts) if (n > most || (n === most && h < best)) { best = h; most = n; }
  return best;
};

const signature = (room) => JSON.stringify(room);
const sortRooms = (rooms) => rooms.slice().sort((a, b) => (signature(a) < signature(b) ? -1 : signature(a) > signature(b) ? 1 : 0));

const templated = (room, n) => {
  const out = { ...room, name: templateName(room.name, n), label: templateName(room.label, n) };
  if (room.flat) out.flat = templateName(room.flat, n);
  return out;
};

const expanded = (room, n) => {
  const out = { ...room, name: expandName(room.name, n), label: expandName(room.label, n) };
  if (room.flat) out.flat = expandName(room.flat, n);
  return out;
};

/**
 * Groups storeys' rooms: the largest set of numbered storeys (two or more)
 * whose templated rooms are identical becomes `typical`; every other storey is
 * listed explicitly. `byStorey`: [{ tag, rooms: navRoom[] }] bottom-up.
 */
export const packRooms = (byStorey) => {
  const groups = new Map();
  for (const { tag, rooms } of byStorey) {
    const n = storeyNumber(tag);
    if (n === null) continue;
    const key = JSON.stringify(sortRooms(rooms.map((r) => templated(r, n))));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tag);
  }
  let typicalKey = null; let typicalTags = [];
  for (const [key, tags] of groups) {
    if (tags.length >= 2 && tags.length > typicalTags.length) { typicalKey = key; typicalTags = tags; }
  }
  const out = { typical: null, storeys: {} };
  if (typicalKey !== null) out.typical = { storeys: typicalTags, rooms: JSON.parse(typicalKey) };
  for (const { tag, rooms } of byStorey) {
    if (!typicalTags.includes(tag)) out.storeys[tag] = sortRooms(rooms);
  }
  return out;
};

/** Every storey's concrete rooms from a packed `rooms` object, as { tag: navRoom[] }. */
export const expandRooms = (packed) => {
  const out = {};
  if (packed.typical) {
    for (const tag of packed.typical.storeys) {
      const n = storeyNumber(tag);
      out[tag] = sortRooms(packed.typical.rooms.map((r) => expanded(r, n)));
    }
  }
  for (const [tag, rooms] of Object.entries(packed.storeys)) out[tag] = sortRooms(rooms);
  return out;
};

/** null when the packed rooms expand back to exactly `byStorey`, else the first storey that differs. */
export const roomsProblem = (packed, byStorey) => {
  const got = expandRooms(packed);
  for (const { tag, rooms } of byStorey) {
    if (JSON.stringify(got[tag] ?? []) !== JSON.stringify(sortRooms(rooms))) return `rooms of ${tag} do not round-trip`;
  }
  const tags = new Set(byStorey.map((s) => s.tag));
  for (const tag of Object.keys(got)) if (!tags.has(tag)) return `rooms expand to a storey ${tag} the building does not have`;
  return null;
};

/**
 * Lift landings from the engine JSON: for each served level, the point 0.4 m
 * out from the landing door on the lobby side (the portal's resolved side), and
 * the facing out of the car. Returns { name, served, landings: { tag: { xy, facing } } }.
 */
export const liftLandings = (lift, portalsByNode) => {
  const landings = {};
  const problems = [];
  for (const tag of lift.served_levels) {
    const node = lift.landing_door_by_level?.[tag];
    const portal = node ? portalsByNode.get(node) : undefined;
    if (!portal) { problems.push(`${lift.name} ${tag}: no landing portal`); continue; }
    const side = portal.spaces?.[0] ? 0 : portal.spaces?.[1] ? 1 : -1;
    if (side < 0) { problems.push(`${lift.name} ${tag}: neither side of the landing door is a room`); continue; }
    const lobby = portal.link[side]; const shaft = portal.link[1 - side];
    const fx = lobby[0] - shaft[0], fy = lobby[1] - shaft[1]; const l = Math.hypot(fx, fy) || 1;
    landings[tag] = { xy: [r2(lobby[0]), r2(lobby[1])], facing: [r2(fx / l), r2(fy / l)] };
  }
  return { lift: { name: lift.name, served: [...lift.served_levels], landings }, problems };
};

/** A spawn point, block-local: { name, pos, facing [x, y] }. */
export const navSpawn = (spawn) => ({ name: spawn.name, pos: r2v(spawn.position), facing: [r2(spawn.facing[0]), r2(spawn.facing[1])] });

const GUID_KEYS = new Set(['guid', 'door', 'leaf_node', 'node', 'host_wall', 'spaces']);

const r3 = (v) => { const r = Math.round(v * 1000) / 1000; return r === 0 ? 0 : r; };

/**
 * Upstream web.json stairs with GUID-bearing keys dropped. Rounded to the
 * millimetre, not the centimetre: a 0.175 m riser must not read 0.18.
 */
export const navStairs = (stairs) => {
  const clean = (v) => {
    if (Array.isArray(v)) return v.map(clean);
    if (typeof v === 'number') return r3(v);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !GUID_KEYS.has(k)).map(([k, x]) => [k, clean(x)]));
    return v;
  };
  return stairs.map(clean);
};

/**
 * One passable door, for the walk checks of plan §6.7 ("every passable door
 * connects"): [x, y, ax, ay, w] — the doorway's centre on its wall line
 * (block-local, Z up, 0.01 m), the unit direction along the wall and the
 * width. The engine JSON's `origin` is the jamb the width is measured from.
 */
export const navDoor = (door) => {
  const { origin, along_wall: along, width } = door;
  if (!Array.isArray(origin) || !Array.isArray(along) || typeof width !== 'number') throw new Error(`door ${door.name ?? '?'} has no origin, along_wall and width`);
  return [r2(origin[0] + (along[0] * width) / 2), r2(origin[1] + (along[1] * width) / 2), r2(along[0]), r2(along[1]), r2(width)];
};

const sortDoors = (doors) => doors.slice().sort((a, b) => { for (let k = 0; k < a.length; k += 1) if (a[k] !== b[k]) return a[k] - b[k]; return 0; });

/**
 * Groups storeys' doors like packRooms: the largest set (two or more) of
 * numbered storeys with identical door lists is stored once as `typical`.
 * `byStorey`: [{ tag, doors: navDoor[] }] bottom-up.
 */
export const packDoors = (byStorey) => {
  const groups = new Map();
  for (const { tag, doors } of byStorey) {
    if (storeyNumber(tag) === null) continue;
    const key = JSON.stringify(sortDoors(doors));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tag);
  }
  let typicalKey = null; let typicalTags = [];
  for (const [key, tags] of groups) if (tags.length >= 2 && tags.length > typicalTags.length) { typicalKey = key; typicalTags = tags; }
  const out = { typical: typicalKey === null ? null : { storeys: typicalTags, doors: JSON.parse(typicalKey) }, storeys: {} };
  for (const { tag, doors } of byStorey) if (!typicalTags.includes(tag) && doors.length) out.storeys[tag] = sortDoors(doors);
  return out;
};

/** Every storey's doors from a packed `doors` object, as { tag: navDoor[] }. */
export const expandDoors = (packed) => {
  const out = {};
  if (packed.typical) for (const tag of packed.typical.storeys) out[tag] = packed.typical.doors.map((d) => d.slice());
  for (const [tag, doors] of Object.entries(packed.storeys)) out[tag] = doors.map((d) => d.slice());
  return out;
};

/** null when packed doors expand back to exactly `byStorey`, else the first storey that differs. */
export const doorsProblem = (packed, byStorey) => {
  const got = expandDoors(packed);
  for (const { tag, doors } of byStorey) if (JSON.stringify(sortDoors(got[tag] ?? [])) !== JSON.stringify(sortDoors(doors))) return `doors of ${tag} do not round-trip`;
  return null;
};
