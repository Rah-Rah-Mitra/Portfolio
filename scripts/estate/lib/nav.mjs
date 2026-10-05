// The per-building navigation file (plan §6.2 step 11) from the engine JSON
// slice the pack reads (§6.1: storeys, rooms, lifts, portals of kind lift or
// stair, spawns) and, when upstream exported it, <ID>_web.json's stairs.

import { NAV_SCHEMA, commonHeight, liftLandings, navRoom, navSpawn, navStairs, packRooms, roomsProblem } from './pure/navjson.mjs';

/**
 * Returns { nav, warnings }. `storeys`: [{ tag, ffl, geom }] bottom-up, from
 * the interior analysis; `web`: parsed web.json or null.
 */
export const buildNav = ({ id, engine, storeys, web }) => {
  const warnings = [];
  const fflOf = new Map(storeys.map((s) => [s.tag, s.ffl]));
  const roomHeight = commonHeight(engine.rooms ?? []);
  const byStorey = storeys.map(({ tag, ffl }) => ({ tag, rooms: (engine.rooms ?? []).filter((r) => r.storey === tag).map((r) => navRoom(r, ffl, roomHeight)) }));
  const stray = (engine.rooms ?? []).filter((r) => !fflOf.has(r.storey));
  if (stray.length) throw new Error(`${id}: ${stray.length} rooms sit on storeys the building does not have (first: ${stray[0].storey})`);
  const rooms = packRooms(byStorey);
  const problem = roomsProblem(rooms, byStorey);
  if (problem) throw new Error(`${id}: nav rooms: ${problem}`);

  const portalsByNode = new Map();
  for (const p of engine.portals ?? []) if (p.kind === 'lift' || p.kind === 'stair') portalsByNode.set(p.node, p);
  const lifts = [];
  for (const lift of engine.lifts ?? []) {
    const { lift: out, problems } = liftLandings(lift, portalsByNode);
    for (const t of out.served) if (!fflOf.has(t)) throw new Error(`${id}: ${lift.name} serves ${t}, which the building does not have`);
    warnings.push(...problems.map((p) => `${id}: ${p}`));
    lifts.push(out);
  }

  const nav = {
    schema: NAV_SCHEMA,
    site: id,
    frame: 'block-local, Z up, m',
    storeys: storeys.map(({ tag, ffl, geom }) => ({ tag, ffl, geom })),
    roomHeight,
    rooms,
    lifts,
    spawns: (engine.spawns ?? []).map(navSpawn),
  };
  if (web) nav.stairs = navStairs(web.stairs ?? []);
  else warnings.push(`${id}: no ${id}_web.json, so the nav file has no stairs`);
  return { nav, warnings };
};
