import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parsePack, type EstatePack, type PackBuilding } from '../lib/estate/schema';
import { decodeWalk, floorAt, nearestWalkable, type FloorHit, type WalkFile, type WalkPose } from '../lib/estate/walk';

// Plan §6.7's real-data checks: the walk grids and nav files of a built pack,
// read through the runtime's own decoder and floor search. They run on
// ESTATE_PACK_DIR (P2: a candidate or dev pack built with walk grids) or, from
// P5, on the committed pack; otherwise the suite is skipped.
//
//   ESTATE_PACK_DIR=artifacts/estate/v1.2 npx vitest run tests/estate-walk-realdata.test.ts

const root = path.join(__dirname, '..');
const committed = path.join(root, 'public', 'estate', 'v1.2');
const candidates = [process.env.ESTATE_PACK_DIR ? path.resolve(process.env.ESTATE_PACK_DIR) : null, committed].filter((d): d is string => d !== null);
const packFile = (dir: string) => (existsSync(dir) ? readdirSync(dir).find((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f)) : undefined);
const dir = candidates.find((d) => {
  const f = packFile(d);
  return f !== undefined && (JSON.parse(readFileSync(path.join(d, f), 'utf8')).classes as string[]).includes('w');
}) ?? null;

type Door = [number, number, number, number, number];
interface Nav {
  storeys: { tag: string; ffl: number }[];
  lifts: { name: string; served: string[]; landings: Record<string, { xy: [number, number]; facing: [number, number] }> }[];
  doors: { typical: { storeys: string[]; doors: Door[] } | null; storeys: Record<string, Door[]> };
  spawns: { name: string; pos: [number, number, number]; facing: [number, number] }[];
  stairs?: { name: string; storey: string; to: string; from_ffl: number; to_ffl: number; path?: [number, number, number][] }[];
}

const read = (rel: string) => {
  const bytes = readFileSync(path.join(dir!, ...rel.split('/')));
  return rel.endsWith('.gz') ? gunzipSync(bytes) : bytes;
};

describe.skipIf(dir === null)('walk grids and nav files on real data (§6.7)', () => {
  // Read on first use: a skipped suite still runs this body to collect its tests.
  let parsed: EstatePack | null = null;
  const packOf = () => (parsed ??= parsePack(JSON.parse(readFileSync(path.join(dir!, packFile(dir!)!), 'utf8'))));
  const pack = new Proxy({} as EstatePack, { get: (_, key) => packOf()[key as keyof EstatePack] });
  const site = (id: string) => pack.sites.find((s) => s.id === id)!;
  const cache = new Map<string, { walk: WalkFile; nav: Nav }>();
  const load = (s: PackBuilding) => {
    if (!cache.has(s.id)) {
      cache.set(s.id, { walk: decodeWalk(read(s.walk!.path), s.id), nav: JSON.parse(read(s.nav!.path).toString('utf8')) as Nav });
    }
    return cache.get(s.id)!;
  };
  const pose = (): WalkPose => ({ x: 0, y: 0, z: 0, layer: -1 });

  // Cells reachable from (x, y) on the floor near z, stepping between
  // neighbouring cells the way the walker does (the floor search's ±step), inside
  // a disc of `radius` m about (cx, cy). Returns a predicate over (x, y, layer).
  const reach = (walk: WalkFile, start: WalkPose, cx: number, cy: number, radius: number) => {
    const h = walk.header;
    const key = (ix: number, iy: number, layer: number) => `${ix},${iy},${layer}`;
    const ix0 = Math.floor((start.x - h.originX) / h.cell), iy0 = Math.floor((start.y - h.originY) / h.cell);
    const seen = new Set<string>([key(ix0, iy0, start.layer)]);
    const queue: [number, number, number][] = [[ix0, iy0, start.z]];
    const hit: FloorHit = { z: 0, layer: -1 };
    while (queue.length) {
      const [ix, iy, z] = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = ix + dx, ny = iy + dy;
        const x = h.originX + (nx + 0.5) * h.cell, y = h.originY + (ny + 0.5) * h.cell;
        if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
        if (floorAt(walk, x, y, z, hit) === null) continue;
        const k = key(nx, ny, hit.layer);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push([nx, ny, hit.z]);
      }
    }
    return (p: WalkPose) => seen.has(key(Math.floor((p.x - h.originX) / h.cell), Math.floor((p.y - h.originY) / h.cell), p.layer));
  };

  it.each(['BLK_509', 'MSCP_513', 'NC_514'])('every passable door of %s connects its two sides within 1.5 m', (id) => {
    const s = site(id);
    const { walk, nav } = load(s);
    const failures: string[] = [];
    let checked = 0;
    for (const [i, storey] of s.storeys.entries()) {
      const doors = nav.doors.typical?.storeys.includes(storey.tag) ? nav.doors.typical.doors : nav.doors.storeys[storey.tag] ?? [];
      for (const [x, y, ax, ay] of doors) {
        checked += 1;
        // 0.5 m either side of the wall line, along the wall's normal.
        const a = pose(), b = pose();
        const okA = nearestWalkable(walk, x - ay * 0.5, y + ax * 0.5, storey.ffl, 0.5, a);
        const okB = nearestWalkable(walk, x + ay * 0.5, y - ax * 0.5, storey.ffl, 0.5, b);
        if (!okA || !okB || a.layer !== i && b.layer !== i) { failures.push(`${storey.tag} (${x}, ${y}): ${okA ? '' : 'no floor on one side '}${okB ? '' : 'no floor on the other side'}`); continue; }
        if (!reach(walk, a, x, y, 1.5)(b)) failures.push(`${storey.tag} (${x}, ${y}): its sides do not connect within 1.5 m`);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });

  it('every entrance spawn lands within 0.4 m of a walkable L1 cell', () => {
    const failures: string[] = [];
    for (const s of pack.sites) {
      const { walk, nav } = load(s);
      for (const sp of nav.spawns) {
        const p = pose();
        if (!nearestWalkable(walk, sp.pos[0], sp.pos[1], sp.pos[2], 0.4, p) || p.layer !== 0) failures.push(`${s.id} ${sp.name}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('every lift arrival snaps to a walkable cell of its storey within 0.5 m', () => {
    const failures: string[] = [];
    for (const s of pack.sites) {
      const { walk, nav } = load(s);
      for (const lift of nav.lifts) {
        for (const [tag, landing] of Object.entries(lift.landings)) {
          const i = s.storeys.findIndex((st) => st.tag === tag);
          const p = pose();
          if (!nearestWalkable(walk, landing.xy[0], landing.xy[1], s.storeys[i].ffl, 0.5, p) || p.layer !== i) failures.push(`${s.id} ${lift.name} ${tag}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('every stair path stays on walkable floor and ends on the next storey', () => {
    const failures: string[] = [];
    let stairs = 0;
    for (const s of pack.sites) {
      const { walk, nav } = load(s);
      for (const st of nav.stairs ?? []) {
        if (!st.path?.length) { failures.push(`${s.id} ${st.name}: no path`); continue; }
        stairs += 1;
        const hit: FloorHit = { z: 0, layer: -1 };
        // Every 0.1 m along the path, the floor search finds a floor at the path's own height.
        let lost = 0; let first = '';
        for (let k = 1; k < st.path.length; k += 1) {
          const [x0, y0, z0] = st.path[k - 1]; const [x1, y1, z1] = st.path[k];
          const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.1));
          for (let j = 0; j <= n; j += 1) {
            const t = j / n;
            const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t;
            if (floorAt(walk, x, y, z) === null) { lost += 1; first ||= `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`; }
          }
        }
        if (lost) failures.push(`${s.id} ${st.name}: ${lost} samples off the floor, first at ${first}`);
        const [xe, ye, ze] = st.path[st.path.length - 1];
        const to = s.storeys.findIndex((x) => x.tag === st.to);
        const f = floorAt(walk, xe, ye, ze, hit);
        if (f === null || hit.layer !== to || Math.abs(f - st.to_ffl) > 0.05) failures.push(`${s.id} ${st.name}: ends at ${f} on layer ${hit.layer}, not ${st.to} at ${st.to_ffl}`);
      }
    }
    expect(stairs).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });

  it('MSCP_513 L1 → L2 can be climbed with floorAt (the 1:8 ramp)', () => {
    const s = site('MSCP_513');
    const { walk, nav } = load(s);
    const start = pose();
    expect(nearestWalkable(walk, nav.spawns[0].pos[0], nav.spawns[0].pos[1], 0, 0.4, start)).toBe(true);
    // Breadth first over cells and the floors floorAt hands over, stairs excluded
    // only by what the grid holds: the walker can reach L2 or it cannot.
    const h = walk.header;
    const hit: FloorHit = { z: 0, layer: -1 };
    const seen = new Set<string>();
    const queue: [number, number, number][] = [[Math.floor((start.x - h.originX) / h.cell), Math.floor((start.y - h.originY) / h.cell), start.z]];
    let reached = false;
    while (queue.length && !reached) {
      const [ix, iy, z] = queue.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = h.originX + (ix + dx + 0.5) * h.cell, y = h.originY + (iy + dy + 0.5) * h.cell;
        if (floorAt(walk, x, y, z, hit) === null || hit.layer > 1) continue;
        const k = `${ix + dx},${iy + dy},${Math.round(hit.z * 100)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (hit.layer === 1 && Math.abs(hit.z - s.storeys[1].ffl) < 0.05) { reached = true; break; }
        queue.push([ix + dx, iy + dy, hit.z]);
      }
    }
    expect(reached).toBe(true);
  });
});
