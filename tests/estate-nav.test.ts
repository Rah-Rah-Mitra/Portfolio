import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ESTATE_SITE_IDS, ESTATE_SITE_STOREYS, ESTATE_STOREY_FFL } from '../lib/estate/ids';
import {
  expandName, liftNear, NAV_FRAME, NAV_SCHEMA, NavFormatError, parseNav, roomAt, stairsFrom, type LiftNear, type NavStair,
} from '../lib/estate/nav';
import { parsePack } from '../lib/estate/schema';
import * as navjson from '../scripts/estate/lib/pure/navjson.mjs';

// navjson.mjs is plain JS; its inferred types are narrower than its use here.
interface PackedRooms { typical: { storeys: string[]; rooms: Array<Record<string, unknown>> } | null; storeys: Record<string, Array<Record<string, unknown>>> }
interface PackedDoors { typical: { storeys: string[]; doors: number[][] } | null; storeys: Record<string, number[][]> }
const navRoom = navjson.navRoom as (room: unknown, ffl: number, roomHeight: number | null) => Record<string, unknown> & { name: string };
const navDoor = navjson.navDoor as (door: unknown) => number[];
const packRooms = navjson.packRooms as (byStorey: unknown) => PackedRooms;
const packDoors = navjson.packDoors as (byStorey: unknown) => PackedDoors;
const expandRooms = navjson.expandRooms as (packed: PackedRooms) => Record<string, Array<Record<string, unknown>>>;
const expandDoors = navjson.expandDoors as (packed: PackedDoors) => Record<string, number[][]>;
const templateName = navjson.templateName as (text: string, n: number) => string;

// The nav reader (lib/estate/nav.ts, plan §6.2 step 11): expands what the pack
// tool's navjson.mjs packs, exactly as its own expandRooms/expandDoors do, and
// answers the engine's room, lift and stair questions. Then every nav file of
// the pack under public/estate/v1.2, when one is there.

// MSCP_513: 8 storeys, L1 (0), L2…L7 (3 m apart), RF (21). A small synthetic file for it.
const SITE = 'MSCP_513' as const;
const TAGS = ESTATE_SITE_STOREYS[SITE];
const FFL = ESTATE_STOREY_FFL[SITE];

const engineRoom = (storey: string, name: string, room: string, polygon: number[][], extra: Record<string, unknown> = {}) => ({
  storey, name, room, polygon, floor_z: FFL[TAGS.indexOf(storey as (typeof TAGS)[number])] + ((extra.dz as number) ?? 0), height: (extra.height as number) ?? 2.8, ...extra,
});

const square = (x: number, y: number, w: number, h = w) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];

const synthetic = () => {
  const rooms: Array<ReturnType<typeof engineRoom>> = [];
  for (const tag of TAGS) {
    const n = tag === 'RF' ? null : Number(tag.slice(1));
    if (tag === 'L1') {
      rooms.push(engineRoom(tag, 'L1-LOBBY', 'Lift lobby', square(0, 0, 10)));
      rooms.push(engineRoom(tag, 'L1-KIOSK', 'Kiosk', square(2, 2, 2), { height: 3.4 }));
    } else if (tag === 'RF') {
      rooms.push(engineRoom(tag, 'RF-GARDEN', 'Roof garden', square(0, 0, 30), { external: true }));
      rooms.push(engineRoom(tag, 'RF-DECK', 'Viewing deck', square(5, 5, 4), { dz: 1.2, height: 2.2 }));
    } else {
      rooms.push(engineRoom(tag, `L${n}-LOT-008`, `Car lot L${n}-008 (S)`, square(0, 0, 5, 2.5)));
      rooms.push(engineRoom(tag, `#${String(n).padStart(2, '0')}-101 BED`, 'Bedroom', square(10, 0, 3), { flat: `#${String(n).padStart(2, '0')}-101` }));
      rooms.push(engineRoom(tag, `L${n}-AISLE`, 'Aisle', square(0, 0, 20)));
    }
  }
  const roomHeight = 2.8;
  const byStorey = TAGS.map((tag, i) => ({ tag, rooms: rooms.filter((r) => r.storey === tag).map((r) => navRoom(r, FFL[i], roomHeight)) }));
  const doorsBy = TAGS.map((tag) => ({ tag, doors: tag === 'RF' ? [] : [navDoor({ origin: [1, 0], along_wall: [1, 0], width: 1.0 }), ...(tag === 'L1' ? [navDoor({ origin: [5, 10], along_wall: [0, 1], width: 1.6 })] : [])] }));
  return {
    byStorey,
    doorsBy,
    json: {
      schema: NAV_SCHEMA,
      site: SITE,
      frame: NAV_FRAME,
      storeys: TAGS.map((tag, i) => ({ tag, ffl: FFL[i], geom: tag === 'L1' || tag === 'RF' ? 'special' : 'typical' })),
      roomHeight,
      rooms: packRooms(byStorey),
      lifts: [
        { name: 'Lift 1', served: [...TAGS], landings: Object.fromEntries(TAGS.map((t) => [t, { xy: [8, 1], facing: [0, -1] }])) },
        { name: 'Lift 2', served: ['L1', 'L2'], landings: { L1: { xy: [8, 2.2], facing: [0, 1] }, L2: { xy: [8, 2.2], facing: [0, 1] } } },
      ],
      doors: packDoors(doorsBy),
      spawns: [{ name: 'Entrance E', pos: [20, 1, 0], facing: [-1, 0] }],
      stairs: [
        { name: 'L1 stair 1', room: 'L1-STAIR1', storey: 'L1', to: 'L2', from_ffl: 0, to_ffl: 3, flights: [{ start: [1, 1, 0], end: [1, 3, 1.5], width: 1.2, risers: 9, riser: 0.167, going: 0.28 }], landings: [{ z: 1.5, polygon: square(0, 3, 2) }], path: [[1, 0.5, 0], [1, 3, 1.5], [1, 0.5, 3]] },
        { name: 'L2 stair 1', room: 'L2-STAIR1', storey: 'L2', to: 'L3', from_ffl: 3, to_ffl: 6, flights: [], landings: [], path: [] },
      ],
    },
  };
};

describe('parseNav', () => {
  it('expands typical rooms and doors exactly as the pack tool’s expandRooms and expandDoors do', () => {
    const { json, byStorey, doorsBy } = synthetic();
    expect(json.rooms.typical?.storeys).toEqual(['L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
    const nav = parseNav(JSON.parse(JSON.stringify(json)), SITE);
    const tool = expandRooms(json.rooms) as Record<string, Array<Record<string, unknown>>>;
    TAGS.forEach((tag, s) => {
      const mine = nav.rooms[s].map((r) => r.name).sort();
      expect(mine, tag).toEqual(tool[tag].map((r) => r.name as string).sort());
      expect(mine, tag).toEqual(byStorey[s].rooms.map((r: { name: string }) => r.name).sort());
      // Labels and flats expand too.
      for (const r of nav.rooms[s]) {
        const t = tool[tag].find((x) => x.name === r.name)!;
        expect(r.label).toBe(t.label);
        expect(r.flat).toBe(t.flat ?? null);
      }
    });
    const doors = expandDoors(json.doors) as Record<string, number[][]>;
    TAGS.forEach((tag, s) => {
      expect(nav.doors[s].map((d) => [d.x, d.y, d.ax, d.ay, d.w])).toEqual(doors[tag] ?? []);
      expect(doors[tag] ?? []).toEqual(doorsBy[s].doors);
    });
    // L5's templated names: {S} = 5, {SS} = 05.
    const l5 = nav.rooms[TAGS.indexOf('L5')];
    expect(l5.map((r) => r.name).sort()).toEqual(['#05-101 BED', 'L5-AISLE', 'L5-LOT-008']);
    expect(l5.find((r) => r.name === 'L5-LOT-008')!.label).toBe('Car lot L5-008 (S)');
    expect(l5.find((r) => r.name === '#05-101 BED')!.flat).toBe('#05-101');
    // Polygons are shared between storeys, not copied.
    expect(nav.rooms[1].find((r) => r.name.endsWith('AISLE'))!.poly).toBe(nav.rooms[2].find((r) => r.name.endsWith('AISLE'))!.poly);
  });

  it('keeps every field the engine reads: heights, floors, open air, landings, stairs, spawns', () => {
    const nav = parseNav(synthetic().json, SITE);
    expect(nav.site).toBe(SITE);
    expect(nav.storeys.map((s) => s.tag)).toEqual([...TAGS]);
    expect(nav.roomHeight).toBe(2.8);
    const l1 = nav.rooms[0];
    expect(l1.find((r) => r.name === 'L1-KIOSK')).toMatchObject({ h: 3.4, z: 0, ext: false, flat: null, label: 'Kiosk', area: 4 });
    const rf = nav.rooms[TAGS.indexOf('RF')];
    expect(rf.find((r) => r.name === 'RF-GARDEN')).toMatchObject({ ext: true, h: 2.8 });
    expect(rf.find((r) => r.name === 'RF-DECK')).toMatchObject({ z: 1.2, h: 2.2 });
    expect(rf.find((r) => r.name === 'RF-GARDEN')!.poly).toHaveLength(4); // closing repeat dropped
    expect(nav.lifts.map((l) => [l.name, l.served.length])).toEqual([['Lift 1', 8], ['Lift 2', 2]]);
    expect(nav.lifts[0].landings.RF).toEqual({ xy: [8, 1], facing: [0, -1] });
    expect(nav.stairs[0]).toMatchObject({ name: 'L1 stair 1', room: 'L1-STAIR1', storey: 'L1', to: 'L2', fromFfl: 0, toFfl: 3 });
    expect(nav.stairs[0].path).toEqual([[1, 0.5, 0], [1, 3, 1.5], [1, 0.5, 3]]);
    expect(nav.stairs[0].landings[0].polygon).toHaveLength(4);
    expect(nav.spawns).toEqual([{ name: 'Entrance E', pos: [20, 1, 0], facing: [-1, 0] }]);
    expect(Object.isFrozen(nav.rooms[0])).toBe(true);
  });

  it('agrees with the tool’s templating in both directions', () => {
    for (const [text, n] of [['#05-101 BED', 5], ['L12-LOT-001', 12], ['Car lot L7-008 (S)', 7], ['#12-205', 12]] as const) {
      expect(expandName(templateName(text, n), n)).toBe(text);
    }
    expect(expandName('#{SS}-1{S}', 3)).toBe('#03-13');
  });

  it('refuses a file the engine could not use, naming the JSON path', () => {
    const at = (edit: (j: ReturnType<typeof synthetic>['json']) => void, path: string, site: typeof SITE | undefined = SITE) => {
      const j = JSON.parse(JSON.stringify(synthetic().json));
      edit(j);
      let error: unknown = null;
      try { parseNav(j, site); } catch (e) { error = e; }
      expect(error, path).toBeInstanceOf(NavFormatError);
      expect((error as NavFormatError).path).toBe(path);
    };
    at((j) => { (j as Record<string, unknown>).schema = 'portfolio/estate-nav/2'; }, 'schema');
    at((j) => { (j as Record<string, unknown>).frame = 'estate'; }, 'frame');
    at((j) => { (j as Record<string, unknown>).site = 'BLK_599'; }, 'site');
    at((j) => { (j as Record<string, unknown>).site = 'NC_514'; }, 'site');
    at((j) => { j.storeys.pop(); }, 'storeys');
    at((j) => { j.storeys[2].ffl = 6.5; }, 'storeys[2].ffl');
    at((j) => { j.storeys[1].tag = 'L02'; }, 'storeys[1].tag');
    at((j) => { j.rooms.typical!.storeys.push('RF'); }, 'rooms.typical.storeys[6]');
    at((j) => { (j.rooms.storeys as Record<string, unknown>).L3 = []; }, 'rooms.storeys.L3');
    at((j) => { (j.rooms.storeys as Record<string, unknown>).L9 = []; }, 'rooms.storeys.L9');
    at((j) => { (j.rooms.typical!.rooms[0] as Record<string, unknown>).poly = [[0, 0], [1, 1]]; }, 'rooms.typical.rooms[0].poly');
    at((j) => { j.lifts[1].served.push('L9'); }, 'lifts[1].served[2]');
    at((j) => { j.stairs[0].to = 'L1'; }, 'stairs[0].to');
    at((j) => { (j.stairs[0].path as unknown[]).push([1, 2]); }, 'stairs[0].path[3]');
    at((j) => { ((j.doors.typical!.doors as unknown[][])[0])[4] = 0; }, 'doors.typical.doors[0][4]');
    expect(() => parseNav(null)).toThrow(NavFormatError);
    // Without a site, any estate site's own file is fine.
    expect(parseNav(synthetic().json).site).toBe(SITE);
  });
});

describe('nav queries', () => {
  const nav = parseNav(synthetic().json, SITE);
  const L2 = TAGS.indexOf('L2');
  const RF = TAGS.indexOf('RF');

  it('names the smallest room holding a point, and respects a raised floor with feet given', () => {
    expect(roomAt(nav, L2, 1, 1)?.name).toBe('L2-LOT-008'); // the lot inside the aisle
    expect(roomAt(nav, L2, 15, 15)?.name).toBe('L2-AISLE');
    expect(roomAt(nav, L2, 11, 1)?.label).toBe('Bedroom');
    expect(roomAt(nav, L2, 25, 1)).toBeNull();
    expect(roomAt(nav, 99, 1, 1)).toBeNull();
    expect(roomAt(nav, 0, 3, 3)?.name).toBe('L1-KIOSK');
    // The roof deck is 1.2 m up: standing on the roof (z 21) under it is the garden.
    expect(roomAt(nav, RF, 6, 6, 21)?.name).toBe('RF-GARDEN');
    expect(roomAt(nav, RF, 6, 6, 22.2)?.name).toBe('RF-DECK');
    expect(roomAt(nav, RF, 6, 6)?.name).toBe('RF-DECK');
  });

  it('offers the nearest landing serving the storey within 1.5 m', () => {
    const out = {} as LiftNear;
    expect(liftNear(nav, L2, 8, 2, out)?.lift.name).toBe('Lift 2'); // 0.2 m from Lift 2's, 1 m from Lift 1's
    expect(out.distance).toBeCloseTo(0.2, 9);
    expect(liftNear(nav, TAGS.indexOf('L3'), 8, 2, out)?.lift.name).toBe('Lift 1'); // Lift 2 stops at L2
    expect(liftNear(nav, L2, 12, 2, out)).toBeNull();
    expect(liftNear(nav, L2, 12, 2, out, 5)?.lift.name).toBe('Lift 2');
    expect(liftNear(nav, 42, 8, 2, out)).toBeNull();
  });

  it('lists the stairs up from and down to a storey', () => {
    const up: NavStair[] = [];
    const down: NavStair[] = [];
    stairsFrom(nav, 0, up, down);
    expect([up.map((s) => s.name), down.length]).toEqual([['L1 stair 1'], 0]);
    stairsFrom(nav, L2, up, down);
    expect([up.map((s) => s.name), down.map((s) => s.name)]).toEqual([['L2 stair 1'], ['L1 stair 1']]);
  });
});

// ---- the real files -----------------------------------------------------------------------

const root = fileURLToPath(new URL('..', import.meta.url));
const packDir = join(root, 'public', 'estate', 'v1.2');
const packFile = existsSync(packDir) ? readdirSync(packDir).find((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f)) : undefined;
const hasNav = packFile !== undefined
  && (JSON.parse(readFileSync(join(packDir, packFile), 'utf8')) as { classes: string[] }).classes.includes('nav');

describe.skipIf(!hasNav)('the pack’s nav files (public/estate/v1.2)', () => {
  it('parses all 14 against their sites, with rooms on every storey that has any and spawns matching pack.json', () => {
    const pack = parsePack(JSON.parse(readFileSync(join(packDir, packFile as string), 'utf8')));
    const counts: Record<string, number> = {};
    for (const site of pack.sites) {
      const raw = JSON.parse(gunzipSync(readFileSync(join(packDir, site.nav!.path))).toString('utf8'));
      const nav = parseNav(raw, site.id);
      expect(nav.storeys.map((s) => s.tag)).toEqual(site.storeys.map((s) => s.tag));
      counts[site.id] = nav.rooms.reduce((n, list) => n + list.length, 0);
      // Same spawns as pack.json, block-local (pack: estate frame = local + at).
      expect(nav.spawns.length).toBe(site.spawns.length);
      nav.spawns.forEach((s, i) => {
        expect(s.pos[0] + site.at[0]).toBeCloseTo(site.spawns[i].pos[0], 1);
        expect(s.pos[1] + site.at[1]).toBeCloseTo(site.spawns[i].pos[1], 1);
      });
      // Every lift landing is on a storey the lift serves.
      for (const lift of nav.lifts) for (const tag of Object.keys(lift.landings)) expect(lift.served).toContain(tag);
      // Every stair has a walking path that starts on its storey and ends on the next.
      for (const stair of nav.stairs) {
        expect(stair.path.length, stair.name).toBeGreaterThan(1);
        expect(stair.path[0][2]).toBeCloseTo(stair.fromFfl, 1);
        expect(stair.path[stair.path.length - 1][2]).toBeCloseTo(stair.toFfl, 1);
      }
    }
    expect(Object.keys(counts)).toEqual([...ESTATE_SITE_IDS]);
    for (const id of ESTATE_SITE_IDS) expect(counts[id], id).toBeGreaterThan(0);
  });

  it('names a corridor on BLK 509 L5 and a hawker stall in the NC 514 hall', () => {
    const pack = parsePack(JSON.parse(readFileSync(join(packDir, packFile as string), 'utf8')));
    const navOf = (id: string) => {
      const site = pack.sites.find((s) => s.id === id)!;
      return parseNav(JSON.parse(gunzipSync(readFileSync(join(packDir, site.nav!.path))).toString('utf8')), site.id);
    };
    const b509 = navOf('BLK_509');
    const l5 = b509.storeys.findIndex((s) => s.tag === 'L5');
    const corridor = b509.rooms[l5].find((r) => /corridor/i.test(r.label));
    expect(corridor, 'BLK 509 L5 has a corridor').toBeDefined();
    const [x0, y0, x1, y1] = corridor!.box;
    // Some point of its box lies in it, and roomAt names it there (or a smaller room inside it).
    let named = false;
    for (let t = 0.05; t < 1 && !named; t += 0.05) {
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) / 2;
      const room = roomAt(b509, l5, x, y);
      if (room?.name === corridor!.name) named = true;
    }
    expect(named).toBe(true);
    const nc = navOf('NC_514');
    expect(nc.rooms[0].some((r) => /^Hawker stall #01-/.test(r.label))).toBe(true);
    expect(nc.lifts.map((l) => l.served)).toEqual([['L1', 'L2']]);
  });
});
