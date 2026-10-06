import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { startClimb, stepClimb, stairPath, type ClimbPose } from '../lib/estate/climb';
import { decodeGround } from '../lib/estate/ground';
import { ESTATE_SITE_IDS, type EstateSiteId } from '../lib/estate/ids';
import { parseNav, type EstateNav } from '../lib/estate/nav';
import { parsePack, type EstatePack } from '../lib/estate/schema';
import { pointInPolygon, polygonEdgeDistance } from '../lib/estate/storeys';
import { decodeWalk, floorAt, type FloorHit, type WalkFile } from '../lib/estate/walk';
import { InteriorSystem, type FloorQuery } from '../components/workbench/estate/engine/interior';
import { liftArrival, type Arrival } from '../components/workbench/estate/engine/lifts';
import { WalkController, type WalkWorld } from '../components/workbench/estate/engine/controls/walk';

// Plan §10.2 estate-walk-sweep: the Walk controller (engine/controls/walk.ts,
// the very code the engine runs) driven by a seeded random walker over the real
// walk grids, 10,000 steps each on BLK_509 L5, MSCP_513 L1 → L2 and NC_514 L1.
// After every step the walker must stand on a walkable cell of its grid (or on
// the open ground, never inside a footprint), and no step may cross an opened
// door leaf: upstream bakes the leaves open and rasterises them as blocked
// (plan §5.2), and their footprints, from the release's own web.json, are
// tests/fixtures/estate/walk_leaves.json. The MSCP ramp and every stair that
// touches the swept storeys are climbed: the ramp by walking it, the stairs by
// Take stairs (lib/estate/climb.ts) along their walking lines.
//
// Runs on the pack in public/estate/v1.2 (or ESTATE_PACK_DIR), skipped without
// one that carries walk grids, nav files and the ground.

const root = path.join(__dirname, '..');
const named = process.env.ESTATE_PACK_DIR ? path.resolve(process.env.ESTATE_PACK_DIR) : null;
const candidates = [named, path.join(root, 'public', 'estate', 'v1.2')].filter((d): d is string => d !== null);
const packFile = (dir: string) => (existsSync(dir) ? readdirSync(dir).find((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f)) : undefined);
const dir = candidates.find((d) => {
  const f = packFile(d);
  if (f === undefined) return false;
  const json = JSON.parse(readFileSync(path.join(d, f), 'utf8')) as { classes: string[]; source?: { dev?: boolean } };
  return ['w', 'nav', 'ground'].every((k) => json.classes.includes(k)) && (d === named || json.source?.dev !== true);
}) ?? null;

const read = (rel: string) => {
  const bytes = readFileSync(path.join(dir!, ...rel.split('/')));
  return rel.endsWith('.gz') ? gunzipSync(bytes) : bytes;
};

type Ring = [number, number][];
const LEAVES = JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'estate', 'walk_leaves.json'), 'utf8')) as {
  sites: Record<string, Record<string, Ring[]>>;
};

/** Mulberry32: the same 10,000 steps on every run. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const STEPS = 10_000;
/** A walker point stays at least this clear of a leaf's footprint (the grid is shrunk by 0.20 m around it). */
const LEAF_CLEARANCE = 0.1;

const SCHEDULER = { isResident: () => true, residentMask: () => 7, entryBlocked: () => false, seen: () => undefined };

describe.skipIf(dir === null)('Walk sweeps on the real walk grids (§10.2)', () => {
  let pack: EstatePack;
  let system: InteriorSystem;
  let world: WalkWorld;
  const walks = new Map<number, WalkFile>();
  const navs = new Map<number, EstateNav>();
  const index = (id: EstateSiteId) => ESTATE_SITE_IDS.indexOf(id);

  beforeAll(() => {
    pack = parsePack(JSON.parse(readFileSync(path.join(dir!, packFile(dir!)!), 'utf8')));
    system = new InteriorSystem(pack, SCHEDULER);
    for (const id of ['BLK_509', 'MSCP_513', 'NC_514'] as const) {
      const i = index(id);
      const site = pack.sites[i];
      const walk = decodeWalk(read(site.walk!.path), site.id);
      const nav = parseNav(JSON.parse(read(site.nav!.path).toString('utf8')), site.id);
      walks.set(i, walk);
      navs.set(i, nav);
      system.addWalk(i, walk);
      system.addNav(i, nav);
    }
    system.addGround(decodeGround(read(pack.site!.ground!.path)));
    world = {
      sites: pack.sites,
      extent: pack.estate.extent as unknown as [number, number, number, number],
      floorQuery: (x, y, z, out, hit) => system.floorQuery(x, y, z, out, hit),
      walk: (i) => system.walk(i),
      ground: () => system.ground(),
      indexOf: (id) => system.indexOf(id),
    };
  }, 60_000);

  interface SweepResult { steps: number; moved: number; cells: number; storeys: Set<string>; outdoors: number; resets: number }

  /**
   * 10,000 seeded steps of 0.05–0.4 m, each taken as ≤ 0.1 m moves (one
   * collision substep each, so a check per move sees every chord the walker
   * travels). Headings drift, and turn at random one step in ten. With
   * `keep` (storey tags), a walker that leaves those storeys or the building's
   * grid starts again where it began; without, it may walk out onto the ground.
   */
  const sweep = (id: EstateSiteId, start: { x: number; y: number; z: number; yaw: number }, seed: number, keep: Set<string> | null): SweepResult => {
    const i = index(id);
    const site = pack.sites[i];
    const walk = walks.get(i)!;
    const tags = site.storeys.map((s) => s.tag);
    const leaves = LEAVES.sites[id] ?? {};
    const walker = new WalkController(world);
    walker.place(start.x, start.y, start.z, start.yaw);
    expect(walker.site, `${id} start lands on its grid`).toBe(i);
    const random = rng(seed);
    const q: FloorQuery = { kind: 'none', z: Number.NaN, site: null, layer: -1 };
    const hit: FloorHit = { z: 0, layer: -1 };
    const cells = new Set<string>();
    const storeys = new Set<string>();
    const bad: string[] = [];
    let heading = random() * 2 * Math.PI;
    let moved = 0;
    let outdoors = 0;
    let resets = 0;
    for (let k = 0; k < STEPS; k += 1) {
      heading += random() < 0.1 ? (random() - 0.5) * 2 * Math.PI : (random() - 0.5) * 0.6;
      let left = 0.05 + random() * 0.35;
      while (left > 1e-9) {
        const d = Math.min(0.1, left);
        left -= d;
        const x0 = walker.x, y0 = walker.y;
        moved += walker.moveBy(Math.cos(heading) * d, Math.sin(heading) * d);
        if (walker.site === i) {
          const lx = walker.x - site.at[0], ly = walker.y - site.at[1];
          const f = floorAt(walk, lx, ly, walker.z, hit);
          if (f === null || Math.abs(f - walker.z) > 1e-6 || hit.layer !== walker.layer) {
            if (bad.length < 6) bad.push(`step ${k}: (${lx.toFixed(2)}, ${ly.toFixed(2)}) z ${walker.z} layer ${walker.layer} is not a walkable floor (floorAt ${f})`);
          }
          const tag = tags[walker.layer];
          storeys.add(tag);
          cells.add(`${Math.floor(lx * 10)},${Math.floor(ly * 10)},${walker.layer}`);
          for (const ring of leaves[tag] ?? []) {
            const clear = pointInPolygon(lx, ly, ring) ? 0 : polygonEdgeDistance(lx, ly, ring);
            if (clear < LEAF_CLEARANCE && bad.length < 6) bad.push(`step ${k}: (${lx.toFixed(2)}, ${ly.toFixed(2)}) on ${tag} is ${clear.toFixed(3)} m from an opened leaf (from ${(x0 - site.at[0]).toFixed(2)}, ${(y0 - site.at[1]).toFixed(2)})`);
          }
        } else {
          outdoors += 1;
          expect(walker.site, 'only the swept building has its grid loaded').toBe(-1);
          world.floorQuery(walker.x, walker.y, walker.z, q);
          // Outdoors is the ground: never a building's bounds with a grid (that walker would be on it), never a footprint.
          if (q.kind === 'building' || q.kind === 'blocked') {
            if (bad.length < 6) bad.push(`step ${k}: outdoors at (${walker.x.toFixed(2)}, ${walker.y.toFixed(2)}) inside ${q.site}'s walk bounds (${q.kind})`);
          }
        }
      }
      if (keep && (walker.site !== i || !keep.has(tags[walker.layer]))) {
        resets += 1;
        walker.place(start.x, start.y, start.z, heading);
      }
    }
    expect(bad).toEqual([]);
    if (process.env.ESTATE_SWEEP_LOG) console.log(id, { moved: Math.round(moved), cells: cells.size, storeys: [...storeys], outdoors, resets });
    return { steps: STEPS, moved, cells: cells.size, storeys, outdoors, resets };
  };

  /** Where a ride on `lift` to `tag` lands (a walkable start on that storey), as an estate pose. */
  const liftStart = (id: EstateSiteId, liftName: string, tag: string) => {
    const i = index(id);
    const nav = navs.get(i)!;
    const lift = nav.lifts.find((l) => l.name === liftName)!;
    const to = nav.storeys.findIndex((s) => s.tag === tag);
    const out: Arrival = { x: 0, y: 0, z: 0, layer: -1, heading: 0 };
    expect(liftArrival(nav, walks.get(i)!, lift, to, out)).toBe(true);
    const at = pack.sites[i].at;
    return { x: out.x + at[0], y: out.y + at[1], z: out.z, yaw: Math.atan2(-Math.cos(out.heading), Math.sin(out.heading)) };
  };

  it('BLK_509 L5: 10,000 steps from Lift 3’s landing stay on walkable cells and clear of every opened leaf', () => {
    const r = sweep('BLK_509', liftStart('BLK_509', 'Lift 3', 'L5'), 509, new Set(['L4', 'L5', 'L6']));
    // It really walked: hundreds of metres over thousands of distinct cells, not a walker pinned to a wall.
    expect(r.moved).toBeGreaterThan(400);
    expect(r.cells).toBeGreaterThan(3000);
    expect(r.storeys.has('L5')).toBe(true);
  });

  it('MSCP_513: 10,000 steps from Entrance E stay on walkable cells and clear of every opened leaf', () => {
    const spawn = pack.sites[index('MSCP_513')].spawns.find((s) => s.name === 'Entrance E')!;
    // Kept to the car park: a walker out on the street starts again at the entrance.
    const r = sweep('MSCP_513', { x: spawn.pos[0], y: spawn.pos[1], z: spawn.pos[2], yaw: 0 }, 513, new Set(pack.sites[index('MSCP_513')].storeys.map((s) => s.tag)));
    expect(r.moved).toBeGreaterThan(400);
    expect(r.cells).toBeGreaterThan(3000);
  });

  it('NC_514 L1: 10,000 steps from Entrance E stay on walkable cells or the open ground, clear of every opened leaf', () => {
    const spawn = pack.sites[index('NC_514')].spawns.find((s) => s.name === 'Entrance E')!;
    const r = sweep('NC_514', { x: spawn.pos[0], y: spawn.pos[1], z: spawn.pos[2], yaw: 0 }, 514, null);
    expect(r.moved).toBeGreaterThan(400);
    expect(r.cells).toBeGreaterThan(3000);
    expect(r.storeys.has('L1')).toBe(true);
  });

  it('MSCP_513 L1 → L2: the walker climbs the 1:8 ramp on foot', () => {
    // A shortest cell path from Entrance E to L2's deck over what floorAt hands
    // over (the real-data test's search), walked with the controller.
    const i = index('MSCP_513');
    const site = pack.sites[i];
    const walk = walks.get(i)!;
    const nav = navs.get(i)!;
    const h = walk.header;
    const spawn = site.spawns.find((s) => s.name === 'Entrance E')!;
    const walker = new WalkController(world);
    walker.place(spawn.pos[0], spawn.pos[1], spawn.pos[2], 0);
    expect(walker.layer).toBe(0);
    const hit: FloorHit = { z: 0, layer: -1 };
    const cx = (x: number) => Math.floor((x - site.at[0] - h.originX) / h.cell);
    const cy = (y: number) => Math.floor((y - site.at[1] - h.originY) / h.cell);
    // The stair rooms of L1 and L2 (rectangular cores), by their boxes.
    const stairBoxes = [0, 1].flatMap((s) => nav.rooms[s].filter((r) => r.name.includes('STAIR')).map((r) => r.box));
    expect(stairBoxes.length).toBeGreaterThan(0);
    const startKey = `${cx(walker.x)},${cy(walker.y)},${Math.round(walker.z * 100)}`;
    const parent = new Map<string, string | null>([[startKey, null]]);
    const queue: [number, number, number][] = [[cx(walker.x), cy(walker.y), walker.z]];
    let goal: string | null = null;
    for (let head = 0; head < queue.length && goal === null; head += 1) {
      const [ix, iy, z] = queue[head];
      const from = `${ix},${iy},${Math.round(z * 100)}`;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = h.originX + (ix + dx + 0.5) * h.cell, y = h.originY + (iy + dy + 0.5) * h.cell;
        if (floorAt(walk, x, y, z, hit) === null || hit.layer > 1) continue;
        // On foot up the ramp: the stair cores are off this route.
        if (stairBoxes.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) continue;
        const key = `${ix + dx},${iy + dy},${Math.round(hit.z * 100)}`;
        if (parent.has(key)) continue;
        parent.set(key, from);
        if (hit.layer === 1 && Math.abs(hit.z - site.storeys[1].ffl) < 0.05) { goal = key; break; }
        queue.push([ix + dx, iy + dy, hit.z]);
      }
    }
    expect(goal).not.toBeNull();
    const chain: [number, number][] = [];
    for (let k: string | null = goal; k !== null; k = parent.get(k) ?? null) {
      const [ix, iy] = k.split(',').map(Number);
      chain.push([ix, iy]);
    }
    chain.reverse();
    // Walk it cell centre to cell centre, as a visitor holding W along it would.
    for (const [ix, iy] of chain.slice(1)) {
      const tx = site.at[0] + h.originX + (ix + 0.5) * h.cell;
      const ty = site.at[1] + h.originY + (iy + 0.5) * h.cell;
      walker.moveBy(tx - walker.x, ty - walker.y);
    }
    expect(walker.site).toBe(i);
    expect(site.storeys[walker.layer].tag).toBe('L2');
    expect(walker.z).toBeCloseTo(site.storeys[1].ffl, 1);
    // Up 3 m on a 1:8 ramp is at least 24 m of walking.
    expect(chain.length).toBeGreaterThan(240);
  }, 30_000);

  it('climbs every stair touching the swept storeys, up and down, on walkable treads, ending on the next storey', () => {
    const cases: [EstateSiteId, Set<string>][] = [['BLK_509', new Set(['L4', 'L5'])], ['MSCP_513', new Set(['L1'])], ['NC_514', new Set(['L1'])]];
    const bad: string[] = [];
    let climbs = 0;
    const pose: ClimbPose = { x: 0, y: 0, z: 0, heading: 0, done: false };
    const hit: FloorHit = { z: 0, layer: -1 };
    for (const [id, from] of cases) {
      const i = index(id);
      const nav = navs.get(i)!;
      const walk = walks.get(i)!;
      const tags = nav.storeys.map((s) => s.tag);
      for (const stair of nav.stairs) {
        if (!from.has(stair.storey) || stair.path.length < 2) continue;
        const path = stairPath(stair.path);
        for (const dir of ['up', 'down'] as const) {
          climbs += 1;
          const start = dir === 'up' ? stair.path[0] : stair.path[stair.path.length - 1];
          const climb = startClimb(path, start, 0, dir, false);
          let frames = 0;
          for (;;) {
            stepClimb(climb, 1 / 60, false, pose);
            frames += 1;
            if (floorAt(walk, pose.x, pose.y, pose.z) === null && bad.length < 6) bad.push(`${id} ${stair.name} ${dir}: off the floor at (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}, ${pose.z.toFixed(2)})`);
            if (pose.done || frames > 60 * 30) break;
          }
          const end = floorAt(walk, pose.x, pose.y, pose.z, hit);
          const want = dir === 'up' ? stair.to : stair.storey;
          if (!pose.done || end === null || tags[hit.layer] !== want) bad.push(`${id} ${stair.name} ${dir}: ended on ${end === null ? 'nothing' : tags[hit.layer]}, not ${want}`);
          // 2.0 m/s along the line: a storey takes seconds, not a frame and not half a minute.
          if (frames < 60 || frames > 60 * 15) bad.push(`${id} ${stair.name} ${dir}: ${frames} frames`);
        }
      }
    }
    expect(bad).toEqual([]);
    // BLK_509 has five cores (two storeys × five × two ways); MSCP three; NC two.
    expect(climbs).toBe(2 * (10 + 3 + 2));
  });
});
