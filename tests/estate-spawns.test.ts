import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeGround } from '../lib/estate/ground';
import { ESTATE_SITE_IDS } from '../lib/estate/ids';
import { parseNav, type EstateNav } from '../lib/estate/nav';
import { parsePack, type EstatePack } from '../lib/estate/schema';
import { polygonDistance } from '../lib/estate/storeys';
import { decodeWalk, nearestWalkable, type WalkFile, type WalkPose } from '../lib/estate/walk';
import { InteriorSystem, type FloorQuery } from '../components/workbench/estate/engine/interior';
import {
  LIFT_ARRIVAL_OUT, liftArrival, servedLevels, stairChip, stairOffer, stairPaths, stairStart, type Arrival, type StairOfferState,
} from '../components/workbench/estate/engine/lifts';
import { WalkController, type WalkWorld } from '../components/workbench/estate/engine/controls/walk';

// Plan §10.2 estate-spawns, on the real pack (public/estate/v1.2 or
// ESTATE_PACK_DIR; skipped without walk grids, nav files and the ground):
//  - every entrance spawn (pack.json, estate frame) is within 0.4 m of a
//    walkable L1 cell of its own building, and the Walk controller placed
//    there stands on that grid;
//  - every bus stop stands on the open ground, clear of every footprint;
//  - every lift arrival (LIFT_ARRIVAL_OUT out from each served landing, as a
//    ride lands) and both ends of every stair line snap within 0.5 m to a
//    walkable cell of the right storey.
// Frames: pack spawns are estate; walk grids and nav files block-local
// (estate − at; every site has rot 0).

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

const SCHEDULER = { isResident: () => true, residentMask: () => 7, entryBlocked: () => false, seen: () => undefined };
const SPAWN_REACH = 0.4;
const ARRIVAL_REACH = 0.5;

describe.skipIf(dir === null)('spawns, lift arrivals and stair ends on the real pack (§10.2)', () => {
  let pack: EstatePack;
  let system: InteriorSystem;
  let world: WalkWorld;
  const walks: WalkFile[] = [];
  const navs: EstateNav[] = [];
  const pose = (): WalkPose => ({ x: 0, y: 0, z: 0, layer: -1 });

  beforeAll(() => {
    pack = parsePack(JSON.parse(readFileSync(path.join(dir!, packFile(dir!)!), 'utf8')));
    system = new InteriorSystem(pack, SCHEDULER);
    pack.sites.forEach((site, i) => {
      walks[i] = decodeWalk(read(site.walk!.path), site.id);
      navs[i] = parseNav(JSON.parse(read(site.nav!.path).toString('utf8')), site.id);
      system.addWalk(i, walks[i]);
      system.addNav(i, navs[i]);
    });
    system.addGround(decodeGround(read(pack.site!.ground!.path)));
    world = {
      sites: pack.sites,
      extent: pack.estate.extent as unknown as [number, number, number, number],
      floorQuery: (x, y, z, out, hit) => system.floorQuery(x, y, z, out, hit),
      walk: (i) => system.walk(i),
      ground: () => system.ground(),
      indexOf: (id) => system.indexOf(id),
    };
  }, 120_000);

  it('puts every entrance spawn within 0.4 m of a walkable L1 cell, and the walker on its building’s grid', () => {
    const bad: string[] = [];
    let spawns = 0;
    pack.sites.forEach((site, i) => {
      expect(site.spawns.length, `${site.id} has entrances`).toBeGreaterThan(0);
      for (const sp of site.spawns) {
        spawns += 1;
        expect(sp.kind).toBe('entrance');
        const p = pose();
        const lx = sp.pos[0] - site.at[0], ly = sp.pos[1] - site.at[1];
        if (!nearestWalkable(walks[i], lx, ly, sp.pos[2], SPAWN_REACH, p) || p.layer !== 0) {
          bad.push(`${site.id} ${sp.name}: no walkable L1 cell within ${SPAWN_REACH} m`);
          continue;
        }
        // The engine's own placing: the walker lands on that building's grid at L1, facing the spawn's way.
        const walker = new WalkController(world);
        const yaw = Math.atan2(-sp.facing[0], sp.facing[1]);
        walker.place(sp.pos[0], sp.pos[1], sp.pos[2], yaw);
        if (walker.site !== i || walker.layer !== 0) bad.push(`${site.id} ${sp.name}: the walker stood on ${walker.site < 0 ? 'the ground' : ESTATE_SITE_IDS[walker.site]} layer ${walker.layer}`);
        else if (Math.hypot(walker.x - sp.pos[0], walker.y - sp.pos[1]) > SPAWN_REACH + 0.08) bad.push(`${site.id} ${sp.name}: the walker moved ${Math.hypot(walker.x - sp.pos[0], walker.y - sp.pos[1]).toFixed(2)} m`);
      }
    });
    expect(bad).toEqual([]);
    // 45 entrances: twelve blocks, the car park's Entrance E and the hawker centre's eight.
    expect(spawns).toBe(45);
    expect(pack.sites[ESTATE_SITE_IDS.indexOf('NC_514')].spawns).toHaveLength(8);
    expect(pack.sites[ESTATE_SITE_IDS.indexOf('MSCP_513')].spawns.map((s) => s.name)).toEqual(['Entrance E']);
  });

  it('stands every bus stop on the open ground, clear of every footprint (Start at BS1)', () => {
    const stops = pack.site?.spawns ?? [];
    expect(stops.map((s) => s.name)).toEqual(['Bus stop BS1', 'Bus stop BS2', 'Bus stop BS3', 'Bus stop BS4']);
    const q: FloorQuery = { kind: 'none', z: Number.NaN, site: null, layer: -1 };
    for (const s of stops) {
      expect(s.kind).toBe('bus');
      system.floorQuery(s.pos[0], s.pos[1], s.pos[2], q);
      expect(q.kind, s.name).toBe('ground');
      for (const site of pack.sites) expect(polygonDistance(s.pos[0] - site.at[0], s.pos[1] - site.at[1], site.footprint), `${s.name} vs ${site.id}`).toBeGreaterThan(1);
      const walker = new WalkController(world);
      walker.place(s.pos[0], s.pos[1], s.pos[2], 0);
      expect(walker.site).toBe(-1);
      expect(walker.z).toBeCloseTo(q.z, 9);
    }
  });

  it('lands every lift ride within 0.5 m of 1.2 m out from its landing, on that storey', () => {
    const bad: string[] = [];
    let arrivals = 0;
    pack.sites.forEach((site, i) => {
      const nav = navs[i];
      for (const lift of nav.lifts) {
        for (const tag of servedLevels(lift)) {
          arrivals += 1;
          const to = nav.storeys.findIndex((s) => s.tag === tag);
          const out: Arrival = { x: 0, y: 0, z: 0, layer: -1, heading: 0 };
          const landing = lift.landings[tag]!;
          const ideal = [landing.xy[0] + landing.facing[0] * LIFT_ARRIVAL_OUT, landing.xy[1] + landing.facing[1] * LIFT_ARRIVAL_OUT];
          if (!liftArrival(nav, walks[i], lift, to, out)) { bad.push(`${site.id} ${lift.name} ${tag}: no arrival`); continue; }
          const off = Math.hypot(out.x - ideal[0], out.y - ideal[1]);
          if (out.layer !== to || off > ARRIVAL_REACH) bad.push(`${site.id} ${lift.name} ${tag}: lands ${off.toFixed(2)} m off on layer ${out.layer}`);
          // Facing out of the car.
          expect(Math.cos(out.heading) * landing.facing[0] + Math.sin(out.heading) * landing.facing[1]).toBeCloseTo(1, 9);
        }
      }
    });
    expect(bad).toEqual([]);
    expect(arrivals).toBeGreaterThan(200);
  });

  it('snaps both ends of every stair line within 0.5 m to a walkable cell of its storey', () => {
    const bad: string[] = [];
    let ends = 0;
    pack.sites.forEach((site, i) => {
      const nav = navs[i];
      const tags = nav.storeys.map((s) => s.tag);
      stairPaths(nav).forEach((path, k) => {
        const stair = nav.stairs[k];
        if (!path) { bad.push(`${site.id} ${stair.name}: no walking line`); return; }
        for (const dir of ['up', 'down'] as const) {
          ends += 1;
          const out: Arrival = { x: 0, y: 0, z: 0, layer: -1, heading: 0 };
          const want = dir === 'up' ? stair.storey : stair.to;
          const choice = { stair: k, dir, to: tags.indexOf(dir === 'up' ? stair.to : stair.storey) };
          const p = dir === 'up' ? stair.path[0] : stair.path[stair.path.length - 1];
          if (!stairStart(nav, walks[i], choice, out)) { bad.push(`${site.id} ${stair.name} ${dir}: no floor`); continue; }
          const off = Math.hypot(out.x - p[0], out.y - p[1]);
          if (tags[out.layer] !== want || off > ARRIVAL_REACH) bad.push(`${site.id} ${stair.name} ${dir} end: ${off.toFixed(2)} m off on ${tags[out.layer]}, not ${want}`);
        }
      });
    });
    expect(bad).toEqual([]);
    expect(ends).toBeGreaterThan(500);
  });

  it('offers every stair core at both ends of its line, and never through a wall (§8.5, the P5 review)', () => {
    // Both ends, as stairStart lands a walker there: the walking-distance gate keeps every real offer.
    const missing: string[] = [];
    const so: StairOfferState = { label: '', up: null, down: null, distance: 0 };
    pack.sites.forEach((site, i) => {
      const nav = navs[i];
      const tags = nav.storeys.map((s) => s.tag);
      stairPaths(nav).forEach((path, k) => {
        if (!path) return;
        const stair = nav.stairs[k];
        for (const dir of ['up', 'down'] as const) {
          const at: Arrival = { x: 0, y: 0, z: 0, layer: -1, heading: 0 };
          const to = tags.indexOf(dir === 'up' ? stair.to : stair.storey);
          if (!stairStart(nav, walks[i], { stair: k, dir, to }, at)) continue; // pinned by the test above
          const offer = stairOffer(nav, at.layer, at.x, at.y, at.z, so, walks[i]);
          const way = dir === 'up' ? offer?.up : offer?.down;
          if (!way || way.to !== to) missing.push(`${site.id} ${stair.name} ${dir}: ${offer ? stairChip(offer.label, offer.up ? tags[offer.up.to] : null, offer.down ? tags[offer.down.to] : null) : 'no offer'}`);
          // Never a way out to the storey underfoot.
          if (offer && (offer.up?.to === at.layer || offer.down?.to === at.layer)) missing.push(`${site.id} ${stair.name} ${dir}: offers ${tags[at.layer]} on ${tags[at.layer]}`);
        }
      });
    });
    expect(missing).toEqual([]);
    // Where the 3-D reach alone offered a stair behind a wall (estate frame), 4–30 m away on foot: nothing now.
    const THROUGH_WALLS: ReadonlyArray<readonly [string, string, number, number]> = [
      ['BLK_509', 'L5', 164.88, 51.35], // #05-110 Bedroom 2, beside stair 5
      ['BLK_509', 'L5', 45.35, 52.8], // #05-101 Living / Dining, beside stair 1 ("▲ L5" on L5)
      ['BLK_501', 'L2', 258.2, 339.5], // #02-105 Household Shelter
      ['BLK_501', 'L1', 258.2, 340.3], // Residents' Committee centre
      ['BLK_511', 'L2', 316.0, 180.6], // #02-109 Bedroom 2
      ['BLK_512', 'L2', 254.2, 50.4], // #02-101 Bedroom 2
      ['MSCP_513', 'L1', 179.4, 250.7], // motorcycle lot L1-M24
      ['NC_514', 'L1', 152.5, 338.7], // M&E / refuse room
      ['NC_514', 'L2', 148.7, 338.7], // shop unit #02-10
    ];
    const offered: string[] = [];
    for (const [id, tag, x, y] of THROUGH_WALLS) {
      const i = ESTATE_SITE_IDS.indexOf(id as (typeof ESTATE_SITE_IDS)[number]);
      const site = pack.sites[i];
      const s = navs[i].storeys.findIndex((st) => st.tag === tag);
      const p = pose();
      expect(nearestWalkable(walks[i], x - site.at[0], y - site.at[1], navs[i].storeys[s].ffl, 0.3, p), `${id} ${tag} (${x}, ${y}) stands on floor`).toBe(true);
      expect(p.layer, `${id} ${tag} (${x}, ${y})`).toBe(s);
      const offer = stairOffer(navs[i], s, p.x, p.y, p.z, so, walks[i]);
      if (offer) offered.push(`${id} ${tag} (${x}, ${y}): ${offer.label}`);
      // The 3-D reach alone still finds one there: the gate is what turns it away.
      expect(stairOffer(navs[i], s, p.x, p.y, p.z, so, null), `${id} ${tag} (${x}, ${y}) is near a flight`).not.toBeNull();
    }
    expect(offered).toEqual([]);
  });
});
