import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { Frustum, Matrix4, PerspectiveCamera, Sphere, Vector3, type InstancedMesh } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { estateToThree, pointBoxDistance } from '../lib/estate/frames';
import { ESTATE_SITE_IDS } from '../lib/estate/ids';
import {
  ESTATE_VFOV_DEG, LOD_FACADE, LodSelector, RESIDENT_ALL, RESIDENT_FACADE, RESIDENT_MASSING, sseScale,
  type LodBuildingInput,
} from '../lib/estate/lod';
import { parseNav } from '../lib/estate/nav';
import { parsePack, type EstatePack } from '../lib/estate/schema';
import { EYE_HEIGHT } from '../lib/estate/storeys';
import { ESTATE_TIERS, ESTATE_TIER_TABLE, type EstateTier } from '../lib/estate/tiers';
import { InteriorSystem, type InteriorScheduler } from '../components/workbench/estate/engine/interior';
import { levelCosts, type LevelCosts } from '../components/workbench/estate/engine/levels';
import { createGlbLoader, parseGlb, readPayload } from '../components/workbench/estate/engine/loaders';
import { createMaterialKit } from '../components/workbench/estate/engine/materials';
import { createPalette } from '../components/workbench/estate/engine/palette';
import { interiorParts, siteParts } from '../components/workbench/estate/engine/parts';
import { EstateScene } from '../components/workbench/estate/engine/scene';
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
// S1–S5 (§7.11) are pinned per pack: a re-pack moves them, and the pin moves
// only with a written reason beside it. S4, S4-min and S5 stand inside a
// building: the engine's own InteriorSystem (engine/interior.ts) opens the band
// on the decoded interior file and reports what it draws, which is booked as
// the reserve before any building (§7.4 step 1), and the building itself is
// held at F (§7.5) — the same path the engine's frame takes.
//
// Runs on the committed pack under public/estate/v1.2 (Bonsai-Estate v1.2's
// published release, packed with --release) and skips without one.

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
 * §7.11's scenarios on the committed pack (triangles, draws). S1 is the
 * poster pose at stage 0 (massing and crowns); S2 the poster pose with every
 * building at F (edges on, high tier); S3 street level 6 m off BLK 509's south
 * face, looking at it, high tier, everything resident.
 *  - pack.4a3c0883.json: the published v1.2 release (the GitHub release's
 *    zips, packed with --release; the committed pack), measured 2026-10-06:
 *    S1 37,929 / 24, S2 572,413 / 38 and S3 558,929 / 60, all far inside the
 *    high tier's 1.2 M / 150, against §7.11's 37 k / 24, 549 k / 38 and
 *    ~677 k / ~87 (the estate's detail is lighter than the plan's estimate).
 * History (candidate packs of the same rc2 zips, never committed, so no
 * longer selectable here):
 *  - pack.fd986442.json (rc2, re-pinned unchanged from the P4b dev pack
 *    2fa7069b): S1 34,817 / 24, S2 549,957 / 38, S3 541,489 / 60.
 *  - pack.82695419.json (rc2b, P5's pack fixes): every window panel gained its
 *    back pair (+19,344 F triangles over the 14 façades, 2 per window) and
 *    every far tree a 4-triangle trunk stub (+4 × 778 when all are far):
 *    S1 +3,112 is exactly the stubs, S2 +22,456 both with every building at
 *    F, S3 +17,440; draws unchanged. The release changed only the interior
 *    files (one quantisation lattice per file, profile stand-ins for
 *    furniture), and S1–S3 draw no interior, so its pins equal rc2b's.
 */
const PINNED: Readonly<Record<string, Readonly<Record<'S1' | 'S2' | 'S3', readonly [number, number]>>>> = {
  'pack.4a3c0883.json': { S1: [37_929, 24], S2: [572_413, 38], S3: [558_929, 60] },
};

/**
 * §7.11's inside scenarios (triangles, draws), the worst of 8 level headings at
 * each pose, everything resident, the interior's reserve from InteriorSystem:
 * S4 BLK 509 at its L5 lift landing nearest the block's root, eye height, high
 * tier (band L3–L7); S4-min the same pose at the min tier (band L4–L6, k = 1);
 * S5 NC 514's hall at its root, eye height on L1, high tier (band L1–RF).
 *  - pack.4a3c0883.json (the published v1.2 release, the committed pack,
 *    measured 2026-10-06): S4 730,461 / 46 against §7.11's ~716 k / ~46;
 *    S4-min 295,749 / 27 against ≤ 0.3 M / ≤ 60; S5 673,569 / 54 against
 *    ~690 k / ~70. The plan summed every building at F plus near D; the
 *    selector draws what the frustum holds (worst heading kept), within the
 *    tier's caps. The min tier's 15 m tree radius (the fix round after the
 *    release, was 0) moves none of them: no tree stands within 15 m of S4's
 *    landing.
 * History (candidate packs of the same rc2 zips, never committed):
 *  - pack.fd986442.json (rc2, first pinned with P5): S4 708,317 / 46,
 *    S4-min 286,999 / 27, S5 647,353 / 54.
 *  - pack.82695419.json (rc2b, P5's pack fixes): S4 730,461 / 46 (+22,144),
 *    S4-min 295,749 / 27 (+8,750), S5 669,561 / 54 (+22,208): the F windows'
 *    back pairs on every building drawn at F and the far trees' trunk stubs;
 *    draws unchanged. The release left S4 and S4-min as they were (BLK 509 has
 *    no furniture; its interior's triangles are the same, only quantised on
 *    one lattice) and moved S5 by +4,008: the hall's 501 furniture stand-ins
 *    beyond the high tier's 25 m are 20 triangles each (a top over a pedestal
 *    or body), not the 12-triangle box.
 */
type InsideId = 'S4' | 'S4-min' | 'S5';
const PINNED_INSIDE: Readonly<Record<string, Readonly<Record<InsideId, readonly [number, number]>>>> = {
  'pack.4a3c0883.json': { S4: [730_461, 46], 'S4-min': [295_749, 27], S5: [673_569, 54] },
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
    options: {
      resident?: number; fullTrees?: boolean; force?: number; vfov?: number; position?: readonly number[]; target?: readonly number[]; fov?: number;
      /** The active interior's reserve (InteriorSystem.reserveTris/-Draws) and the building the camera is inside (held at F). */
      interior?: { tris: number; draws: number; inside: number };
    } = {},
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

    if (options.interior) {
      reserveTris += options.interior.tris;
      reserveDraws += options.interior.draws;
    }
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
      ...(options.interior?.inside === i ? { maxLevel: LOD_FACADE as 1 } : {}),
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

  it('pins S4, S4-min and S5 inside BLK 509 and the hawker hall, with the interior’s own reserve, each inside its budget', async () => {
    const loader = createGlbLoader();
    const scene = new EstateScene(pack, createMaterialKit(createPalette(new Proxy({}, { get: () => 'rgb(140, 150, 160)' }) as Record<string, string>)));
    const resident: InteriorScheduler = { isResident: () => true, residentMask: () => RESIDENT_ALL, entryBlocked: () => false, seen: () => undefined };
    const interiors = new InteriorSystem(pack, resident);
    interiors.bindScene(scene.buildings);
    const B509 = ESTATE_SITE_IDS.indexOf('BLK_509');
    const NC = ESTATE_SITE_IDS.indexOf('NC_514');
    for (const index of [B509, NC]) {
      const site = pack.sites[index];
      const payload = await readPayload(new Uint8Array(readFileSync(join(packDir, site.interior!.path))), site.interior!.path);
      const decoded = interiorParts((await parseGlb(loader, payload.bytes)).scene, site.storeys);
      for (const p of decoded.parts) p.uploaded = true;
      scene.attach(site.interior!.path, decoded, index);
    }
    const inside = (index: number, eye: [number, number, number], tier: EstateTier) => {
      interiors.update({ now: 0, eye, tier, furnitureRadius: ESTATE_TIER_TABLE[tier].furnitureRadiusM });
      const status = interiors.getStatus();
      expect(status.active, `${ESTATE_SITE_IDS[index]} ${tier}`).toBe(true);
      const interior = { tris: interiors.reserveTris, draws: interiors.reserveDraws, inside: interiors.insideIndex };
      expect(interior.inside).toBe(index);
      let worst = { tris: 0, draws: 0, overBudget: false };
      for (let a = 0; a < HEADINGS; a += 1) {
        const r = pose(eye[0], eye[1], eye[2], (a * 2 * Math.PI) / HEADINGS, 0, tier, { fov: ESTATE_VFOV_DEG.walk, interior });
        expect(r.levels[index], 'the building the camera is in is held at F or below').toBeLessThanOrEqual(LOD_FACADE);
        if (r.tris > worst.tris) worst = { tris: r.tris, draws: Math.max(worst.draws, r.draws), overBudget: r.overBudget };
        else worst.draws = Math.max(worst.draws, r.draws);
      }
      return { ...worst, band: status.band };
    };
    // S4 / S4-min: BLK 509's L5 lift landing nearest the block's root, eye height.
    const b509 = pack.sites[B509];
    const nav = parseNav(JSON.parse(gunzipSync(readFileSync(join(packDir, b509.nav!.path))).toString('utf8')), b509.id);
    const landing = nav.lifts.map((l) => l.landings.L5?.xy).filter((xy): xy is [number, number] => xy !== undefined)
      .sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]))[0];
    const l5 = b509.storeys.find((x) => x.tag === 'L5')!.ffl;
    const p4: [number, number, number] = [b509.at[0] + landing[0], b509.at[1] + landing[1], l5 + EYE_HEIGHT];
    const s4 = inside(B509, p4, 'high');
    const s4min = inside(B509, p4, 'min');
    // S5: NC 514's hall at its root, eye height on L1.
    const nc = pack.sites[NC];
    const s5 = inside(NC, [nc.at[0], nc.at[1], nc.storeys[0].ffl + EYE_HEIGHT], 'high');
    expect([s4.band, s4min.band, s5.band]).toEqual(['L3–L7', 'L4–L6', 'L1–RF']);
    const got = { S4: [s4.tris, s4.draws], 'S4-min': [s4min.tris, s4min.draws], S5: [s5.tris, s5.draws] };
    for (const [id, r, tier] of [['S4', s4, 'high'], ['S4-min', s4min, 'min'], ['S5', s5, 'high']] as const) {
      expect(r.overBudget, id).toBe(false);
      expect(r.tris, id).toBeLessThanOrEqual(ESTATE_TIER_TABLE[tier].maxTris);
      expect(r.draws, id).toBeLessThanOrEqual(ESTATE_TIER_TABLE[tier].maxDraws);
    }
    const pinned = PINNED_INSIDE[packFile as string];
    expect(pinned, `no S4/S5 pin for ${packFile}: pin ${JSON.stringify(got)} in PINNED_INSIDE with a reason`).toBeDefined();
    expect(got).toEqual(pinned);
  }, 60_000);

  it('agrees with the fallback poster pose the dev pack starts from', () => {
    // A pack without views.aerialNE (the dev pack) starts from upstream's own aerial_NE.
    if (!pack.views.aerialNE) expect(posterPose(undefined, STAGE_ASPECT)).toEqual(fallbackAerialPose(STAGE_ASPECT));
  });
});
