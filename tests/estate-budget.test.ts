import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Frustum, Matrix4, PerspectiveCamera, Sphere, Vector3, type InstancedMesh } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { estateToThree, pointBoxDistance } from '../lib/estate/frames';
import { ESTATE_SITE_IDS } from '../lib/estate/ids';
import {
  ESTATE_VFOV_DEG, LOD_FACADE, LodSelector, RESIDENT_ALL, RESIDENT_FACADE, RESIDENT_MASSING, sseScale,
  type LodBuildingInput,
} from '../lib/estate/lod';
import { parsePack, type EstatePack } from '../lib/estate/schema';
import { ESTATE_TIERS, ESTATE_TIER_TABLE, type EstateTier } from '../lib/estate/tiers';
import { levelCosts, type LevelCosts } from '../components/workbench/estate/engine/levels';
import { createGlbLoader, parseGlb, readPayload } from '../components/workbench/estate/engine/loaders';
import { siteParts } from '../components/workbench/estate/engine/parts';
import { createTreePartition, partitionTrees } from '../components/workbench/estate/engine/trees';
import { fallbackAerialPose, posterPose } from '../components/workbench/estate/engine/views';

// The caps proof behind decision C11 and G3's "every pose on the CI grid"
// (plan §10.2, P4b): detail selection (lib/estate/lod.ts, the engine's own
// selector) over a grid of camera poses, on the pack's real numbers, with every
// file resident (the worst case for detail) and the site's real reserve (the
// four ground quadrants in view, the trees split near/far at the tier's radius
// from the site file's own instance positions, the grid). The selector never
// takes an upgrade past a cap by construction; what can break a cap is the
// floor (every visible building at massing plus the reserve), so every pose
// asserts both the totals and `overBudget === false`.
//
// The grid: 21 × 21 positions over the 400 m estate (every 20 m) × eye heights
// {1.6, 12, 40, 120, 300} m × 8 headings × the 4 tiers, k ≥ 1 on every tier.
// Pitch and lens follow the height: on foot and low in Fly (≤ 12 m) a 60° lens
// looking level and 10° down; above, Overview's 45° looking 25°, 35° and 45°
// down. The buffer is the tier's own pixel cap on the default 1.36 stage, the
// most pixels (largest K, most detail wanted) the tier ever draws.
//
// S1–S3 (§7.11) are pinned per pack: a re-pack moves them, and the pin moves
// only with a written reason beside it. S4, S4-min and S5 are inside buildings,
// which only P5's interiors can draw; they join with P5.
//
// Runs on whatever pack sits under public/estate/v1.2 (the dev pack while v1.2
// is unpublished, the committed s0/f/d from P4b on) and skips without one.

const root = fileURLToPath(new URL('..', import.meta.url));
const packDir = join(root, 'public', 'estate', 'v1.2');
const packFile = existsSync(packDir) ? readdirSync(packDir).find((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f)) : undefined;
const hasGeometry = packFile !== undefined && existsSync(join(packDir, 's0'));

const STAGE_ASPECT = 722 / 531;
const HEIGHTS = [1.6, 12, 40, 120, 300] as const;
const PITCH_DEG: Readonly<Record<(typeof HEIGHTS)[number], number>> = { 1.6: 0, 12: -10, 40: -25, 120: -35, 300: -45 };
const HEADINGS = 8;
const STEP_M = 20;

/**
 * §7.11's scenarios on each pack they were measured on (triangles, draws).
 *  - pack.2fa7069b.json: the DEV pack (v1.1 geometry, source.dev) the P4b
 *    branch runs on. S1 is the poster pose at stage 0 (massing and crowns);
 *    S2 the poster pose with every building at F (edges on, high tier); S3
 *    street level 6 m off BLK 509's south face, looking at it, high tier,
 *    everything resident. Re-pin from the release pack before merge.
 *    Measured 2026-10-06: S1 34,817 / 24 and S2 549,957 / 38 against §7.11's
 *    37 k / 24 and 549 k / 38 (the browser readout at the poster pose, high
 *    tier, read the same 549,957); S3 541,489 / 60 against ~677 k / ~87 (the
 *    dev pack's v1.1 detail is lighter than the plan's estimate).
 */
const PINNED: Readonly<Record<string, Readonly<Record<'S1' | 'S2' | 'S3', readonly [number, number]>>>> = {
  'pack.2fa7069b.json': { S1: [34_817, 24], S2: [549_957, 38], S3: [541_489, 60] },
};

interface SpeciesCost { centres: Float32Array; count: number; fullTris: number; crownTris: number }

describe.skipIf(!hasGeometry)('the caps over the pose grid, on the pack in public/estate/v1.2', () => {
  let pack: EstatePack;
  const species: SpeciesCost[] = [];
  const spheres: Sphere[] = [];
  const quadrants: Array<{ sphere: Sphere; tris: number }> = [];
  const costs: Record<EstateTier, LevelCosts[]> = { high: [], mid: [], low: [], min: [] };

  beforeAll(async () => {
    pack = parsePack(JSON.parse(readFileSync(join(packDir, packFile as string), 'utf8')));
    const site = pack.site!;
    const payload = await readPayload(new Uint8Array(readFileSync(join(packDir, site.file.path))), site.file.path);
    const parts = siteParts((await parseGlb(createGlbLoader(), payload.bytes)).scene);
    if (parts.kind !== 'site') throw new Error('the site file did not decode as the site');
    for (const s of parts.species) {
      const full = s.full?.object as InstancedMesh | undefined;
      const crown = s.crown?.object as InstancedMesh | undefined;
      const mesh = full ?? crown;
      if (!mesh) continue;
      const m = mesh.instanceMatrix.array as Float32Array;
      const count = mesh.count;
      const centres = new Float32Array(2 * count);
      for (let i = 0; i < count; i += 1) { centres[2 * i] = m[16 * i + 12]; centres[2 * i + 1] = m[16 * i + 14]; }
      const tris = (o: InstancedMesh | undefined) => (o ? Math.floor((o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3) : 0);
      species.push({ centres, count, fullTris: tris(full), crownTris: tris(crown) });
    }
    for (const b of pack.sites) {
      const [lo, hi] = b.bounds;
      spheres.push(new Sphere(new Vector3(...estateToThree([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2])), b.radius));
    }
    for (const q of site.quadrants) {
      const [lo, hi] = q.bounds;
      const centre = new Vector3(...estateToThree([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]));
      quadrants.push({ sphere: new Sphere(centre, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2), tris: q.tris });
    }
    for (const tier of ESTATE_TIERS) costs[tier] = pack.sites.map((b) => levelCosts(b, ESTATE_TIER_TABLE[tier].edges));
  }, 60_000);

  // ---- one pose ----------------------------------------------------------------------

  const camera = new PerspectiveCamera(45, STAGE_ASPECT, 0.5, 2000);
  const frustum = new Frustum();
  const proj = new Matrix4();
  const look = new Vector3();
  const visible: boolean[] = ESTATE_SITE_IDS.map(() => false);
  const selector = new LodSelector(ESTATE_SITE_IDS.length);
  const partitions = new Map<string, Array<{ near: number; far: number }>>();

  /** Near and far tree counts per species about plan point (x, z), three world, at radius r. Cached per position. */
  const treeSplit = (x: number, z: number, r: number): Array<{ near: number; far: number }> => {
    const key = `${x}|${z}|${r}`;
    let split = partitions.get(key);
    if (!split) {
      split = species.map((s) => {
        const p = createTreePartition(s.count);
        partitionTrees(s.centres, s.count, x, z, r, p);
        return { near: p.nearCount, far: p.farCount };
      });
      partitions.set(key, split);
    }
    return split;
  };

  interface PoseResult { tris: number; draws: number; overBudget: boolean; reserveTris: number; reserveDraws: number; levels: number[] }

  /**
   * The selector's answer for a camera at estate (x, y, h) looking along
   * `heading` (radians from north towards east) and `pitchDeg`, on `tier`.
   * `resident` is per building; `force` pins every visible building to one
   * level instead of selecting (S2's "every building at F").
   */
  const pose = (
    x: number, y: number, h: number, heading: number, pitchDeg: number, tier: EstateTier,
    options: { resident?: number; fullTrees?: boolean; force?: number; vfov?: number; position?: readonly number[]; target?: readonly number[]; fov?: number } = {},
  ): PoseResult => {
    const row = ESTATE_TIER_TABLE[tier];
    const vfov = options.fov ?? options.vfov ?? (h <= 12 ? ESTATE_VFOV_DEG.fly : ESTATE_VFOV_DEG.overview);
    camera.fov = vfov;
    camera.updateProjectionMatrix();
    if (options.position && options.target) {
      camera.position.set(options.position[0], options.position[1], options.position[2]);
      look.set(options.target[0], options.target[1], options.target[2]);
    } else {
      const p = (pitchDeg * Math.PI) / 180;
      camera.position.set(...estateToThree([x, y, h]));
      look.set(Math.sin(heading) * Math.cos(p), Math.sin(p), -Math.cos(heading) * Math.cos(p)).add(camera.position);
    }
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(proj);
    for (let i = 0; i < spheres.length; i += 1) visible[i] = frustum.intersectsSphere(spheres[i]);

    // The reserve, as the engine's scene.reserve() counts it.
    let reserveTris = 2;
    let reserveDraws = 1;
    for (const q of quadrants) if (frustum.intersectsSphere(q.sphere)) { reserveTris += q.tris; reserveDraws += 1; }
    const radius = options.fullTrees === false ? 0 : row.treeRadiusM;
    const split = treeSplit(camera.position.x, camera.position.z, radius);
    split.forEach((s, i) => {
      if (s.near > 0) { reserveTris += s.near * species[i].fullTris; reserveDraws += 1; }
      if (s.far > 0) { reserveTris += s.far * species[i].crownTris; reserveDraws += 1; }
    });

    const eye = [camera.position.x, -camera.position.z, camera.position.y];
    const k = sseScale(Math.floor(Math.sqrt(row.pixelCap / STAGE_ASPECT)), vfov);
    const tierCosts = costs[tier];
    if (options.force !== undefined) {
      let tris = reserveTris;
      let draws = reserveDraws;
      const levels: number[] = [];
      pack.sites.forEach((_, i) => {
        levels.push(visible[i] ? options.force! : -1);
        if (!visible[i]) return;
        tris += tierCosts[i].tris[options.force!];
        draws += tierCosts[i].draws[options.force!];
      });
      return { tris, draws, overBudget: tris > row.maxTris || draws > row.maxDraws, reserveTris, reserveDraws, levels };
    }
    const inputs: LodBuildingInput[] = pack.sites.map((b, i) => ({
      visible: visible[i],
      distance: pointBoxDistance(eye, b.bounds[0], b.bounds[1]),
      massingError: b.massing?.error ?? 0,
      resident: options.resident ?? RESIDENT_ALL,
      tris: tierCosts[i].tris,
      draws: tierCosts[i].draws,
    }));
    selector.reset();
    selector.select(inputs, { now: Number.NaN, k, tier: row, reserveTris, reserveDraws });
    return { tris: selector.tris, draws: selector.draws, overBudget: selector.overBudget, reserveTris, reserveDraws, levels: [...selector.level] };
  };

  // ---- the grid ------------------------------------------------------------------------

  it('keeps every pose on the grid inside its tier’s triangle and draw caps, with k ≥ 1', () => {
    let poses = 0;
    const worst: Record<EstateTier, { tris: number; draws: number; at: string }> = {
      high: { tris: 0, draws: 0, at: '' }, mid: { tris: 0, draws: 0, at: '' }, low: { tris: 0, draws: 0, at: '' }, min: { tris: 0, draws: 0, at: '' },
    };
    const failures: string[] = [];
    for (const tier of ESTATE_TIERS) {
      const row = ESTATE_TIER_TABLE[tier];
      expect(row.bandK, tier).toBeGreaterThanOrEqual(1);
      for (let gx = 0; gx <= 400; gx += STEP_M) {
        for (let gy = 0; gy <= 400; gy += STEP_M) {
          for (const h of HEIGHTS) {
            for (let a = 0; a < HEADINGS; a += 1) {
              const r = pose(gx, gy, h, (a * 2 * Math.PI) / HEADINGS, PITCH_DEG[h], tier);
              poses += 1;
              const at = `${tier} (${gx}, ${gy}, ${h}) heading ${a * 45}°`;
              if (r.tris > worst[tier].tris) worst[tier] = { ...worst[tier], tris: r.tris, at };
              if (r.draws > worst[tier].draws) worst[tier].draws = r.draws;
              if (r.overBudget || r.tris > row.maxTris || r.draws > row.maxDraws) {
                if (failures.length < 10) failures.push(`${at}: ${r.tris} tris, ${r.draws} draws (caps ${row.maxTris}, ${row.maxDraws}; reserve ${r.reserveTris}, ${r.reserveDraws})`);
              }
            }
          }
        }
      }
    }
    expect(poses).toBe(441 * 5 * 8 * 4);
    expect(failures).toEqual([]);
    // The worst pose of each tier, for the record (and so a pack that drifts toward a cap shows here).
    for (const tier of ESTATE_TIERS) {
      expect(worst[tier].tris, worst[tier].at).toBeLessThanOrEqual(ESTATE_TIER_TABLE[tier].maxTris);
      expect(worst[tier].draws, tier).toBeLessThanOrEqual(ESTATE_TIER_TABLE[tier].maxDraws);
    }
    // The top tier is C11's cap: 150 draws and 1.2 M triangles.
    expect([ESTATE_TIER_TABLE.high.maxDraws, ESTATE_TIER_TABLE.high.maxTris]).toEqual([150, 1_200_000]);
  }, 120_000);

  // ---- §7.11's scenarios ---------------------------------------------------------------

  const scenarios = () => {
    const poster = posterPose(pack.views.aerialNE, STAGE_ASPECT);
    const at = { position: poster.position, target: poster.target, fov: poster.fovDeg };
    // S1: the first frame. Stage 0 only: massing, the site, crowns (no full tree is up yet).
    const s1 = pose(0, 0, 0, 0, 0, 'high', { ...at, resident: RESIDENT_MASSING, fullTrees: false });
    // S2: the overview with every visible building at F.
    const s2 = pose(0, 0, 0, 0, 0, 'high', { ...at, resident: RESIDENT_MASSING | RESIDENT_FACADE, force: LOD_FACADE });
    // S3: street level, 6 m off BLK 509's south face, looking north at it.
    const b509 = pack.sites[ESTATE_SITE_IDS.indexOf('BLK_509')];
    const [lo, hi] = b509.bounds;
    const s3 = pose((lo[0] + hi[0]) / 2, lo[1] - 6, 1.6, 0, 10, 'high');
    return { S1: [s1.tris, s1.draws] as const, S2: [s2.tris, s2.draws] as const, S3: [s3.tris, s3.draws] as const, s3Level: s3.levels[8] };
  };

  it('pins S1–S3 for this pack, each inside its budget (S4, S4-min and S5 need P5’s interiors)', () => {
    const got = scenarios();
    const pinned = PINNED[packFile as string];
    expect(pinned, `no S1–S3 pin for ${packFile}: measure them (this test prints them on failure) and pin them in PINNED with a reason`).toBeDefined();
    expect({ S1: got.S1, S2: got.S2, S3: got.S3 }).toEqual(pinned);
    // §7.11's budgets, top tier: S1 is the first frame, S2 and S3 within C11.
    expect(got.S2[0]).toBeLessThanOrEqual(ESTATE_TIER_TABLE.high.maxTris);
    expect(got.S2[1]).toBeLessThanOrEqual(ESTATE_TIER_TABLE.high.maxDraws);
    expect(got.S3[0]).toBeLessThanOrEqual(ESTATE_TIER_TABLE.high.maxTris);
    expect(got.S3[1]).toBeLessThanOrEqual(ESTATE_TIER_TABLE.high.maxDraws);
    // Beside BLK 509 it is drawn at full detail.
    expect(got.s3Level).toBe(2);
  });

  it.todo('S4 inside BLK_509 L5 (band L3–L7), S4-min (band L4–L6) and S5 the hawker hall: P5, with the interior reserve');

  it('agrees with the fallback poster pose the dev pack starts from', () => {
    // A pack without views.aerialNE (the dev pack) starts from upstream's own aerial_NE.
    if (!pack.views.aerialNE) expect(posterPose(undefined, STAGE_ASPECT)).toEqual(fallbackAerialPose(STAGE_ASPECT));
  });
});
