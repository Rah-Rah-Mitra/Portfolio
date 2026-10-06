import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ESTATE_SITE_IDS, ESTATE_SITE_STOREYS } from '../lib/estate/ids';
import { parseNav, roomAt } from '../lib/estate/nav';
import {
  cutSpoken, cutText, cycleRoom, defaultPlanStorey, PLAN_CUT_DEFAULT, PLAN_CUT_MAX, PLAN_CUT_MIN, PLAN_ELEVATION_DEG, PLAN_POLAR,
  rayFloor, ringCentroid, roomAnchor, roomSpoken, roomText, stepCut, walkInPoint,
} from '../lib/estate/plan';
import { parsePack } from '../lib/estate/schema';
import { pointInPolygon, siteStoreyTable } from '../lib/estate/storeys';
import { decodeWalk, type WalkPose } from '../lib/estate/walk';
import { blankPose, ORBIT_LIMITS, PLAN_FILL, planFrame, positionFromOrbit } from '../components/workbench/estate/engine/controls/tween';
import type { Vec2 } from '../lib/estate/frames';

// Plan (plan §8.1, §7.3; P6): the pure rules in lib/estate/plan.ts, the pose
// tween.ts frames a storey with, and, on the committed pack (skipped without
// one), that walking into a room finds a floor to stand on.

const ring = (points: Array<[number, number]>) => points.map((p) => Object.freeze(p) as Vec2);
const boxOf = (poly: readonly Vec2[]): [number, number, number, number] => [
  Math.min(...poly.map((p) => p[0])), Math.min(...poly.map((p) => p[1])), Math.max(...poly.map((p) => p[0])), Math.max(...poly.map((p) => p[1])),
];
const room = (points: Array<[number, number]>) => {
  const poly = ring(points);
  return { poly, box: boxOf(poly) };
};

describe('Plan rules (lib/estate/plan.ts)', () => {
  it('cuts at 1.2 m, stepping 0.3 m between 0.3 and 2.4 m on a 0.1 m grid', () => {
    expect(PLAN_CUT_DEFAULT).toBe(1.2);
    expect(stepCut(1.2, 1)).toBe(1.5);
    expect(stepCut(1.2, -1)).toBe(0.9);
    let cut = PLAN_CUT_DEFAULT;
    const seen = [cut];
    for (let i = 0; i < 10; i += 1) seen.push((cut = stepCut(cut, 1)));
    expect(seen.slice(0, 6)).toEqual([1.2, 1.5, 1.8, 2.1, 2.4, 2.4]);
    for (let i = 0; i < 10; i += 1) cut = stepCut(cut, -1);
    expect(cut).toBe(PLAN_CUT_MIN);
    expect(stepCut(PLAN_CUT_MAX, 1)).toBe(PLAN_CUT_MAX);
    // No drift: every reachable cut is a whole number of decimetres.
    for (const value of seen) expect(Math.round(value * 10)).toBeCloseTo(value * 10, 9);
  });

  it('looks from 55° above the horizon', () => {
    expect(PLAN_ELEVATION_DEG).toBe(55);
    expect(PLAN_POLAR).toBeCloseTo((35 * Math.PI) / 180, 12);
  });

  it('opens on the first typical storey: a block’s L2, the car park’s L2, the hawker centre’s L1', () => {
    const open = (site: (typeof ESTATE_SITE_IDS)[number]) => {
      const table = siteStoreyTable(site);
      return table.tags[defaultPlanStorey(table.typical)];
    };
    expect(open('BLK_509')).toBe('L2');
    expect(open('BLK_501')).toBe('L2');
    expect(open('MSCP_513')).toBe('L2');
    expect(open('NC_514')).toBe('L1');
    expect(defaultPlanStorey([])).toBe(0);
  });

  it('cycles rooms both ways and wraps; from no pick, down starts at the first and up at the last', () => {
    expect(cycleRoom(-1, 1, 5)).toBe(0);
    expect(cycleRoom(-1, -1, 5)).toBe(4);
    expect(cycleRoom(0, -1, 5)).toBe(4);
    expect(cycleRoom(4, 1, 5)).toBe(0);
    expect(cycleRoom(2, 1, 5)).toBe(3);
    expect(cycleRoom(9, 1, 5)).toBe(0); // a stale pick restarts
    expect(cycleRoom(-1, 1, 0)).toBe(-1);
  });

  it('aims a walk-in inside the room: its centroid, else its box centre, else the inside point nearest the centroid', () => {
    const square = room([[0, 0], [4, 0], [4, 2], [0, 2]]);
    expect(roomAnchor(square)).toEqual([2, 1]);
    expect(ringCentroid(square.poly)).toEqual([2, 1]);
    // A thin L: centroid and box centre both fall in the notch.
    const ell = room([[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10]]);
    const [cx, cy] = ringCentroid(ell.poly);
    expect(pointInPolygon(cx, cy, ell.poly)).toBe(false);
    const anchor = roomAnchor(ell);
    expect(pointInPolygon(anchor[0], anchor[1], ell.poly)).toBe(true);
    // A U whose middle is open: still inside, in one of the arms.
    const u = room([[0, 0], [9, 0], [9, 9], [6, 9], [6, 3], [3, 3], [3, 9], [0, 9]]);
    const ua = roomAnchor(u);
    expect(pointInPolygon(ua[0], ua[1], u.poly)).toBe(true);
    // Either orientation reads the same.
    expect(roomAnchor(room([[0, 0], [0, 2], [4, 2], [4, 0]]))).toEqual([2, 1]);
  });

  it('meets the floor from above, never from below, level or behind the eye', () => {
    expect(rayFloor([0, 0, 10], [1, 0, -1], 2)).toEqual([8, 0]);
    expect(rayFloor([5, 5, 10], [0, 0, -2], 12)).toBeNull(); // the floor is above: behind the ray
    expect(rayFloor([0, 0, 1], [1, 0, 0], 0)).toBeNull();
    expect(rayFloor([0, 0, 1], [0, 1, 1], 0)).toBeNull();
  });

  it('words a pick and the cut as the HUD prints them and the live region says them', () => {
    const flat = { label: 'Living / Dining', flat: '#05-104' };
    const corridor = { label: 'Common corridor', flat: null };
    expect(roomText(flat)).toBe('#05-104 · Living / Dining');
    expect(roomText(corridor)).toBe('Common corridor');
    expect(roomSpoken(flat, 2, 105)).toBe('Unit 05-104, Living / Dining, 3 of 105');
    expect(roomSpoken(corridor, 104, 105)).toBe('Common corridor, 105 of 105');
    expect(cutText(1.2)).toBe('+1.20 M');
    expect(cutSpoken(1.5)).toBe('Cut 1.5 metres above the floor');
  });
});

describe('Plan pose (controls/tween.ts planFrame)', () => {
  const project = (point: number[], pose: ReturnType<typeof blankPose>, vfovDeg: number, aspect: number) => {
    // A pinhole camera at the pose looking at its target (Y up), in NDC.
    const eye = positionFromOrbit(pose);
    const f = [pose.target[0] - eye[0], pose.target[1] - eye[1], pose.target[2] - eye[2]];
    const fl = Math.hypot(f[0], f[1], f[2]);
    const fw = f.map((v) => v / fl);
    const r = [fw[1] * 0 - fw[2] * 1, fw[2] * 0 - fw[0] * 0, fw[0] * 1 - fw[1] * 0];
    const rl = Math.hypot(r[0], r[1], r[2]);
    const rt = r.map((v) => v / rl);
    const up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
    const d = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
    const z = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
    const t = Math.tan(((vfovDeg / 2) * Math.PI) / 180);
    return [(d[0] * rt[0] + d[1] * rt[1] + d[2] * rt[2]) / (z * t * aspect), (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / (z * t)];
  };

  it('aims at the outline’s middle on the storey’s floor and keeps the whole storey in frame from any azimuth', () => {
    // Blk 509's estate-frame box, roughly: 120 × 20 m.
    const bounds: [number[], number[]] = [[100, 200, 0], [220, 220, 49]];
    for (const aspect of [4 / 3, 16 / 9, 0.9]) {
      for (let k = 0; k < 8; k += 1) {
        const current = { ...blankPose(), azimuth: (k * Math.PI) / 4 };
        const pose = planFrame(bounds, 12, PLAN_POLAR, current, 45, aspect);
        expect(pose.target).toEqual([160, 12, -210]);
        expect(pose.polar).toBeCloseTo(PLAN_POLAR, 12);
        expect(pose.azimuth).toBe(current.azimuth);
        expect(pose.distance).toBeGreaterThanOrEqual(ORBIT_LIMITS.minDistance);
        for (const [x, y] of [[100, 200], [220, 200], [220, 220], [100, 220]]) {
          const [u, v] = project([x, 12, -y], pose, 45, aspect);
          expect(Math.abs(u), `corner ${x},${y} at ${aspect}`).toBeLessThanOrEqual(PLAN_FILL + 1e-6);
          expect(Math.abs(v), `corner ${x},${y} at ${aspect}`).toBeLessThanOrEqual(PLAN_FILL + 1e-6);
        }
      }
    }
  });
});

const root = fileURLToPath(new URL('..', import.meta.url));
const packDir = join(root, 'public', 'estate', 'v1.2');
const packFile = existsSync(packDir) ? readdirSync(packDir).find((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f)) : undefined;
const pack = packFile ? parsePack(JSON.parse(readFileSync(join(packDir, packFile), 'utf8'))) : null;
const hasData = pack !== null && pack.sites.every((s) => s.nav && s.walk);

describe.skipIf(!hasData)('walking in from Plan on the pack in public/estate/v1.2', () => {
  const read = (rel: string) => gunzipSync(readFileSync(join(packDir, ...rel.split('/'))));

  it('finds a floor to stand on, on the storey shown and inside the room, for every room but a closed substation', () => {
    const misses: string[] = [];
    const outside: string[] = [];
    const layers: string[] = [];
    let rooms = 0;
    for (const site of pack!.sites) {
      const nav = parseNav(JSON.parse(read(site.nav!.path).toString('utf8')), site.id);
      const walk = decodeWalk(read(site.walk!.path), site.id);
      expect(nav.storeys.map((s) => s.tag)).toEqual(ESTATE_SITE_STOREYS[site.id]);
      nav.rooms.forEach((list, s) => {
        for (const r of list) {
          rooms += 1;
          const pose: WalkPose = { x: 0, y: 0, z: 0, layer: -1 };
          if (!walkInPoint(walk, r, nav.storeys[s].ffl, s, pose)) {
            misses.push(`${site.id} ${r.name}`);
            continue;
          }
          // On the storey the plan showed: a stair room's middle is a tread of the flight
          // coming up from below, so walkInPoint looks for the room's own landing.
          if (pose.layer !== s) layers.push(`${site.id} ${r.name} → ${nav.storeys[pose.layer]?.tag}`);
          if (roomAt(nav, s, pose.x, pose.y) !== r) outside.push(`${site.id} ${r.name}`);
        }
      });
    }
    expect(rooms).toBeGreaterThan(15_000);
    // Measured on the v1.2 rc2(b) pack: 15,234 rooms; the one with no floor is a closed room.
    expect(misses).toEqual(['BLK_505 L1-AM2']);
    expect(layers).toEqual([]);
    expect(outside).toEqual([]);
  });

  it('lands in each of Blk 509 L5’s 105 rooms, on L5', () => {
    const site = pack!.sites[ESTATE_SITE_IDS.indexOf('BLK_509')];
    const nav = parseNav(JSON.parse(read(site.nav!.path).toString('utf8')), site.id);
    const walk = decodeWalk(read(site.walk!.path), site.id);
    const s = nav.storeys.findIndex((st) => st.tag === 'L5');
    expect(nav.rooms[s].length).toBe(105);
    for (const r of nav.rooms[s]) {
      const pose: WalkPose = { x: 0, y: 0, z: 0, layer: -1 };
      expect(walkInPoint(walk, r, nav.storeys[s].ffl, s, pose), r.name).toBe(true);
      expect(pose.layer, r.name).toBe(s);
      expect(roomAt(nav, s, pose.x, pose.y)?.name, r.name).toBe(r.name);
    }
  });
});
