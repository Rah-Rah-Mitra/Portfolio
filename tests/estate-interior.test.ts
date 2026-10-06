import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { DoubleSide, FrontSide, Matrix4, Vector3, type BufferGeometry, type InstancedBufferAttribute, type InstancedMesh, type Mesh, type Object3D } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeGround } from '../lib/estate/ground';
import { ESTATE_SITE_IDS, type EstateSiteId } from '../lib/estate/ids';
import { RESIDENT_ALL, RESIDENT_MASSING } from '../lib/estate/lod';
import { parseNav } from '../lib/estate/nav';
import { parsePack, type EstatePack } from '../lib/estate/schema';
import { applyBand, createBandState, MASK_OFF, siteStoreyTable, storeyTable } from '../lib/estate/storeys';
import { ESTATE_TIER_TABLE, type EstateTier } from '../lib/estate/tiers';
import { decodeWalk, type WalkFile } from '../lib/estate/walk';
import {
  FURNITURE_REPARTITION_M, InteriorSystem, writeTypical, type FloorQuery, type InteriorEntry, type InteriorLocation,
  type InteriorScheduler, type InteriorStatus,
} from '../components/workbench/estate/engine/interior';
import { createGlbLoader, parseGlb, readPayload } from '../components/workbench/estate/engine/loaders';
import { Streaming, type DecodedFile } from '../components/workbench/estate/engine/streaming';
import { EstateScheduler } from '../lib/estate/scheduler';
import { createMaterialKit, PLAN_CUT_OFF } from '../components/workbench/estate/engine/materials';
import { createPalette } from '../components/workbench/estate/engine/palette';
import { facadeParts, interiorParts, STOREY_ATTRIBUTE, type InteriorParts } from '../components/workbench/estate/engine/parts';
import { EstateScene } from '../components/workbench/estate/engine/scene';

// The interior side of plan §7.5 on the real pack (public/estate/v1.2; skipped
// without one): interior files decode into the parts the engine draws (T
// instanced, R, specials, furniture) with pack.json's own counts; the engine's
// InteriorSystem picks the building and storey, opens the band (T instances,
// uBand, specials, the façade mask) only once the interior is resident, holds
// k ≥ 1 on every tier (peeking: 1), changes band by instances and uniforms
// alone, splits furniture near and far, fails visibly, releases a walk grid on
// leaving, and answers the Walk controls' floor, location and entry queries.

const root = fileURLToPath(new URL('..', import.meta.url));
const packDir = join(root, 'public', 'estate', 'v1.2');
const packFile = existsSync(packDir) ? readdirSync(packDir).find((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f)) : undefined;
const hasInteriors = packFile !== undefined
  && (JSON.parse(readFileSync(join(packDir, packFile), 'utf8')) as { classes: string[] }).classes.includes('i');

const COLOURS = new Proxy({}, { get: () => 'rgb(140, 150, 160)' }) as Record<string, string>;
const read = (rel: string) => gunzipSync(readFileSync(join(packDir, ...rel.split('/'))));
const B509 = ESTATE_SITE_IDS.indexOf('BLK_509');
const MSCP = ESTATE_SITE_IDS.indexOf('MSCP_513');
const NC = ESTATE_SITE_IDS.indexOf('NC_514');

/** A scheduler stand-in: every file resident unless listed, nothing blocked unless listed. */
class StubScheduler implements InteriorScheduler {
  absent = new Set<string>();
  blocked = new Set<string>();
  mask = RESIDENT_ALL;
  seenIds: string[] = [];
  isResident(id: string) { return !this.absent.has(id); }
  residentMask() { return this.mask; }
  entryBlocked(site: EstateSiteId) { return this.blocked.has(site); }
  seen(id: string) { this.seenIds.push(id); }
}

describe.skipIf(!hasInteriors)('interiors on the pack in public/estate/v1.2', () => {
  let pack: EstatePack;
  const parts = new Map<number, InteriorParts>();
  const walks = new Map<number, WalkFile>();
  const loader = createGlbLoader();

  beforeAll(async () => {
    pack = parsePack(JSON.parse(readFileSync(join(packDir, packFile as string), 'utf8')));
    for (const index of [B509, MSCP, NC]) {
      const site = pack.sites[index];
      const payload = await readPayload(new Uint8Array(readFileSync(join(packDir, site.interior!.path))), site.interior!.path);
      parts.set(index, interiorParts((await parseGlb(loader, payload.bytes)).scene, site.storeys));
      walks.set(index, decodeWalk(read(site.walk!.path), site.id));
    }
  }, 60_000);

  /** A fresh scene + interior system with BLK 509, MSCP 513 and NC 514's interiors attached and uploaded. */
  const setup = async (options: { attach?: boolean } = {}) => {
    const kit = createMaterialKit(createPalette(COLOURS));
    const scene = new EstateScene(pack, kit);
    const scheduler = new StubScheduler();
    const statuses: InteriorStatus[] = [];
    const system = new InteriorSystem(pack, scheduler, (s) => statuses.push(s));
    system.bindScene(scene.buildings);
    if (options.attach !== false) {
      for (const index of [B509, MSCP, NC]) {
        // Each test decodes its own copy: attaching moves objects into the scene.
        const site = pack.sites[index];
        const payload = await readPayload(new Uint8Array(readFileSync(join(packDir, site.interior!.path))), site.interior!.path);
        const decoded = interiorParts((await parseGlb(loader, payload.bytes)).scene, site.storeys);
        for (const p of decoded.parts) p.uploaded = true;
        scene.attach(site.interior!.path, decoded, index);
      }
    }
    return { scene, scheduler, system, statuses };
  };

  const frame = (eye: [number, number, number], tier: EstateTier = 'high') => ({
    now: 0, eye, tier, furnitureRadius: ESTATE_TIER_TABLE[tier].furnitureRadiusM,
  });
  /** Estate point from a site's block-local (x, y) and a height. */
  const at = (index: number, x: number, y: number, z: number): [number, number, number] => [pack.sites[index].at[0] + x, pack.sites[index].at[1] + y, z];
  // BLK 509's L5 common corridor runs along local y −2.9…−0.1; L5's FFL is 12 m.
  const corridorL5 = (): [number, number, number] => at(B509, 20, -1.5, 13.6);

  // ---- decoding --------------------------------------------------------------------------

  it('decodes each interior into T (instanced), R, specials and furniture with pack.json’s counts', () => {
    for (const index of [B509, MSCP, NC]) {
      const site = pack.sites[index];
      const p = parts.get(index)!;
      const pi = site.interior!;
      expect(p.parts.length, site.id).toBe(pi.prims);
      const tTris = p.typical ? p.typical.tris.reduce((a, b) => a + b, 0) : 0;
      expect(tTris, `${site.id} T`).toBe(pi.typicalTris);
      expect(p.residual?.tris ?? 0, `${site.id} R`).toBe(pi.residualTris);
      expect(p.specials.map((s) => [s.tag, s.tris]), `${site.id} specials`).toEqual(pi.specials.map((s) => [s.tag, s.tris]));
      expect(p.specials.map((s) => s.storey)).toEqual(pi.specials.map((s) => site.storeys.findIndex((x) => x.tag === s.tag)));
      expect(p.furniture.map((f) => [f.kit, f.count, f.fullTris, f.proxyTris]).sort())
        .toEqual((pi.furniture ?? []).map((f) => [f.kit, f.instances, f.tris, f.proxyTris]).sort());
      for (const part of p.parts) expect(part.role).toBe('i');
      // T and furniture start drawing nothing.
      for (const m of p.typical?.meshes ?? []) expect((m.object as InstancedMesh).count).toBe(0);
      for (const f of p.furniture) for (const m of [f.full, f.proxy]) if (m) expect((m.object as InstancedMesh).count).toBe(0);
    }
    // BLK 509's T is opaque then glass; MSCP's has no glass.
    expect(parts.get(B509)!.typical!.meshes.map((m) => m.object.name)).toEqual(['typical_opaque', 'typical_glass']);
    expect(parts.get(MSCP)!.typical!.meshes.map((m) => m.object.name)).toEqual(['typical_opaque']);
    expect(parts.get(NC)!.typical).toBeNull();
    // Upload order: T, R, specials, furniture proxies, full furniture.
    const nc = parts.get(NC)!;
    expect(nc.parts.slice(-6).map((p) => p.object.name)).toEqual([
      ...nc.furniture.map((f) => `proxy_${f.kit}`), ...nc.furniture.map((f) => `furniture_${f.kit}`),
    ]);
  });

  it('places T at each typical storey’s floor: T(0, FFL, 0) · the node’s TRS, storey in _STOREY.x', () => {
    const p = parts.get(B509)!;
    const table = storeyTable(pack.sites[B509].storeys);
    const band = createBandState();
    applyBand(band, table, 4, 2); // L5, k = 2: L3–L7
    const mesh = p.typical!.meshes[0].object as InstancedMesh;
    writeTypical(mesh, p.typical!.base[0], band);
    expect(mesh.count).toBe(5);
    const m = mesh.instanceMatrix.array as Float32Array;
    const base = p.typical!.base[0].elements;
    const storeys = (mesh.geometry.getAttribute(STOREY_ATTRIBUTE) as InstancedBufferAttribute).array as Uint8Array;
    for (let j = 0; j < 5; j += 1) {
      expect(m[16 * j + 13]).toBeCloseTo(base[13] + table.ffl[2 + j], 5);
      expect([m[16 * j], m[16 * j + 12], m[16 * j + 14]]).toEqual([Math.fround(base[0]), Math.fround(base[12]), Math.fround(base[14])]);
      expect(storeys[4 * j]).toBe(2 + j);
    }
    // T is stored relative to its floor: at L5 its lowest point sits within a slab's depth of FFL 12.
    mesh.geometry.computeBoundingBox();
    const lowY = (mesh.geometry.boundingBox!.min.y * base[5]) + base[13] + table.ffl[4];
    expect(Math.abs(lowY - 12)).toBeLessThan(0.5);
  });

  // ---- the band and the mask ---------------------------------------------------------------

  it('opens nothing until the interior is resident: F and D stay whole, the state says streaming', async () => {
    const { scene, scheduler, system, statuses } = await setup();
    scheduler.absent.add(pack.sites[B509].interior!.path);
    system.update(frame(corridorL5()));
    const status = system.getStatus();
    expect(status).toMatchObject({ site: 'BLK_509', access: 'inside', storeyTag: 'L5', active: false, state: 'streaming', band: null });
    expect(scene.buildings[B509].storey.uStoreyMask.value.toArray()).toEqual([MASK_OFF.lo, MASK_OFF.hi]);
    expect(scene.buildings[B509].interior.visible).toBe(false);
    expect([system.reserveTris, system.reserveDraws]).toEqual([0, 0]);
    expect(system.insideIndex).toBe(B509);
    expect(statuses.at(-1)).toBe(status);
  });

  it('opens the band once resident: T instances, uBand, specials and the façade mask, k by tier (≥ 1)', async () => {
    const { scene, system } = await setup();
    const node = scene.buildings[B509];
    const bands: Record<EstateTier, string> = { high: 'L3–L7', mid: 'L4–L6', low: 'L4–L6', min: 'L4–L6' };
    for (const tier of ['high', 'mid', 'low', 'min'] as const) {
      expect(ESTATE_TIER_TABLE[tier].bandK).toBeGreaterThanOrEqual(1);
      system.update(frame(corridorL5(), tier));
      const s = system.getStatus();
      expect(s.band, tier).toBe(bands[tier]);
      expect(s.active).toBe(true);
      expect(s.state).toBe('ready');
      expect(node.storey.uStoreyMask.value.toArray()).toEqual([s.lo, s.hi]);
      expect(node.interiorUniforms.uBand.value.toArray()).toEqual([s.lo, s.hi]);
      expect(node.interiorUniforms.uStoreyMask.value.toArray()).toEqual([MASK_OFF.lo, MASK_OFF.hi]);
      expect(node.interior.visible).toBe(true);
      const typical = node.interiorParts!.typical!;
      for (const m of typical.meshes) expect((m.object as InstancedMesh).count).toBe(s.hi - s.lo + 1);
      // L1 and RF are specials, outside these bands.
      for (const sp of node.interiorParts!.specials) for (const p of sp.parts) expect(p.object.visible).toBe(false);
      // The reserve is what draws: T per instance, R whole.
      const tTris = typical.tris.reduce((a, b) => a + b, 0);
      expect(system.reserveTris).toBe(tTris * (s.hi - s.lo + 1) + node.interiorParts!.residual!.tris);
      expect(system.reserveDraws).toBe(typical.meshes.length + node.interiorParts!.residual!.parts.length);
    }
  });

  it('changes band by instances and uniforms only, and settles (no change) when nothing moves', async () => {
    const { scene, system } = await setup();
    const node = scene.buildings[B509];
    expect(system.update(frame(corridorL5()))).toBe(true);
    expect(system.update(frame(corridorL5()))).toBe(false);
    const mesh = node.interiorParts!.typical!.meshes[0].object as InstancedMesh;
    const geometry = mesh.geometry;
    const before = Array.from((mesh.instanceMatrix.array as Float32Array).subarray(0, 16));
    // L12 (FFL 31.6), the same spot.
    const [x, y] = corridorL5();
    expect(system.update(frame([x, y, 33.2]))).toBe(true);
    expect(system.getStatus().band).toBe('L10–L14');
    expect(node.storey.uStoreyMask.value.toArray()).toEqual([9, 13]);
    expect(mesh.geometry).toBe(geometry); // no new geometry
    const after = Array.from((mesh.instanceMatrix.array as Float32Array).subarray(0, 16));
    expect(after[13] - before[13]).toBeCloseTo(26 - 6.4, 4); // first instance L3 → L10
    // The ceiling: F's slab of S + k + 1 is outside the mask.
    expect(node.storey.uStoreyMask.value.y).toBeLessThan(14);
  });

  it('takes Walk’s storey hint over the eye-height rule, so a stair never flips the band early', async () => {
    const { scene, system } = await setup();
    system.setStoreyHint('BLK_509', 0);
    system.update(frame(corridorL5()));
    expect(system.getStatus()).toMatchObject({ storeyTag: 'L1', band: 'L1–L3' });
    // L1's special mesh draws with the band; RF's does not.
    const specials = scene.buildings[B509].interiorParts!.specials;
    expect(specials.map((s) => [s.tag, s.parts.every((p) => p.object.visible)])).toEqual([['L1', true], ['RF', false]]);
    system.setStoreyHint(null);
    system.update(frame(corridorL5()));
    expect(system.getStatus().storeyTag).toBe('L5');
    // A hint for another building is ignored.
    system.setStoreyHint('BLK_501', 0);
    system.update(frame(corridorL5()));
    expect(system.getStatus().storeyTag).toBe('L5');
  });

  it('peeks with k = 1 whatever the tier, and only over a resident façade', async () => {
    const { scheduler, system } = await setup();
    // 5 m south of the footprint (local y −3.1), at the L5 eye height.
    const peek = at(B509, 10, -8.1, 13.6);
    system.update(frame(peek, 'high'));
    expect(system.getStatus()).toMatchObject({ site: 'BLK_509', access: 'peeking', active: true, band: 'L4–L6' });
    expect(system.insideIndex).toBe(-1);
    expect(system.currentIndex).toBe(B509);
    scheduler.mask = RESIDENT_MASSING;
    system.update(frame(peek, 'high'));
    expect(system.getStatus()).toMatchObject({ access: 'peeking', active: false, band: null });
  });

  it('plans a storey (P6): the interior up to S only, cut at its FFL + the cut, the façade masked to the roof, two-sided while cut', async () => {
    const { scene, scheduler, system } = await setup();
    const node = scene.buildings[B509];
    const sides: Array<[number, boolean]> = [];
    system.bindScene(scene.buildings, (index, on) => { sides.push([index, on]); scene.setPlanSides(index, on); });
    // High above and south of the block: outside it, as Plan's camera is.
    const above = at(B509, 20, -60, 70);
    system.setPlan('BLK_509', 4, 1.2); // L5, FFL 12 m
    system.update(frame(above, 'high'));
    expect(system.getStatus()).toMatchObject({ site: 'BLK_509', access: 'outside', storeyTag: 'L5', active: true, band: 'L3–L7' });
    // Held at F like a building the camera is inside, and first for downloads.
    expect(system.insideIndex).toBe(B509);
    expect(system.planIndex).toBe(B509);
    expect(node.interiorUniforms.uBand.value.toArray()).toEqual([2, 4]);
    expect(node.storey.uStoreyMask.value.toArray()).toEqual([2, 16]);
    expect(node.interiorUniforms.uPlanCut.value).toBeCloseTo(13.2, 9);
    expect(node.storey.uPlanCut.value).toBe(PLAN_CUT_OFF);
    expect(sides).toEqual([[B509, true]]);
    // Two-sided and transparent-sorted (glass's program); glass sorts after them.
    for (const material of node.interiorOpaque) expect([material.side, material.transparent, material.depthWrite]).toEqual([DoubleSide, true, true]);
    const glass = node.interiorParts!.parts.filter((p) => (p.object.material as { transparent?: boolean; depthWrite?: boolean }).depthWrite === false);
    expect(glass.length).toBeGreaterThan(0);
    for (const p of glass) expect(p.object.renderOrder).toBe(1);
    // A new cut rewrites the uniform; the sides stay as they are.
    system.setPlan('BLK_509', 4, 1.5);
    expect(system.update(frame(above, 'high'))).toBe(true);
    expect(node.interiorUniforms.uPlanCut.value).toBeCloseTo(13.5, 9);
    expect(system.update(frame(above, 'high'))).toBe(false);
    expect(sides).toEqual([[B509, true]]);
    // Over a façade not yet resident the plan waits: nothing cut, nothing masked.
    scheduler.mask = RESIDENT_MASSING;
    system.update(frame(above, 'high'));
    expect(system.getStatus()).toMatchObject({ active: false, band: null });
    expect(node.interiorUniforms.uPlanCut.value).toBe(PLAN_CUT_OFF);
    expect(node.storey.uStoreyMask.value.toArray()).toEqual([MASK_OFF.lo, MASK_OFF.hi]);
    expect(sides.at(-1)).toEqual([B509, false]);
    for (const material of node.interiorOpaque) expect([material.side, material.transparent]).toEqual([FrontSide, false]);
    scheduler.mask = RESIDENT_ALL;
    system.update(frame(above, 'high'));
    expect(system.getStatus().active).toBe(true);
    // Leaving Plan from up here: the building is no longer anyone's, and everything is back.
    system.setPlan(null);
    system.update(frame(above, 'high'));
    expect(system.getStatus()).toMatchObject({ site: null, active: false });
    expect([system.insideIndex, system.planIndex]).toEqual([-1, -1]);
    expect(node.interiorUniforms.uPlanCut.value).toBe(PLAN_CUT_OFF);
    expect(node.storey.uStoreyMask.value.toArray()).toEqual([MASK_OFF.lo, MASK_OFF.hi]);
    expect(sides.at(-1)).toEqual([B509, false]);
    for (const material of node.interiorOpaque) expect(material.side).toBe(FrontSide);
  });

  it('keeps the band its own when Plan ends with the camera still inside (the walk-in lands): cut off, uBand and mask back to the band', async () => {
    const { scene, system } = await setup();
    const node = scene.buildings[B509];
    system.bindScene(scene.buildings, (index, on) => { scene.setPlanSides(index, on); });
    system.setPlan('BLK_509', 4);
    system.update(frame(corridorL5(), 'high'));
    expect(node.interiorUniforms.uBand.value.toArray()).toEqual([2, 4]);
    system.setPlan(null);
    expect(system.update(frame(corridorL5(), 'high'))).toBe(true);
    expect(system.getStatus()).toMatchObject({ access: 'inside', storeyTag: 'L5', band: 'L3–L7', active: true });
    expect(node.interiorUniforms.uBand.value.toArray()).toEqual([2, 6]);
    expect(node.storey.uStoreyMask.value.toArray()).toEqual([2, 6]);
    expect(node.interiorUniforms.uPlanCut.value).toBe(PLAN_CUT_OFF);
    for (const material of node.interiorOpaque) expect(material.side).toBe(FrontSide);
  });

  it('fails visibly: F whole, entry off, a reason naming the building', async () => {
    const { scene, scheduler, system } = await setup();
    scheduler.blocked.add('BLK_509');
    system.update(frame(corridorL5()));
    const s = system.getStatus();
    expect(s).toMatchObject({ site: 'BLK_509', active: false, state: 'failed' });
    expect(s.reason).toMatch(/^Blk 509 cannot be entered/);
    expect(scene.buildings[B509].storey.uStoreyMask.value.toArray()).toEqual([MASK_OFF.lo, MASK_OFF.hi]);
    const entry: InteriorEntry = { state: 'absent', reason: null };
    expect(system.entry('BLK_509', entry)).toMatchObject({ state: 'failed', reason: s.reason });
    // markFailed (a streaming failure reported directly) does the same for another building.
    system.markFailed('NC_514', 'HTTP 500');
    expect(system.entry(NC, entry).state).toBe('failed');
  });

  it('closes the band and releases the walk grid on leaving the building', async () => {
    const { scene, system } = await setup();
    let released = 0;
    const walk = walks.get(B509)!;
    system.addWalk('BLK_509', {
      ...walk, header: walk.header, layers: walk.layers, grid: (i: number) => walk.grid(i), residentLayers: () => walk.residentLayers(),
      decodeCount: 0, release: () => { released += 1; }, cpuBytes: () => walk.cpuBytes(),
    });
    system.update(frame(corridorL5()));
    expect(system.getStatus().active).toBe(true);
    system.update(frame([200, 200, 120]));
    expect(system.getStatus()).toMatchObject({ site: null, active: false, state: 'none' });
    expect(released).toBe(1);
    expect(scene.buildings[B509].storey.uStoreyMask.value.toArray()).toEqual([MASK_OFF.lo, MASK_OFF.hi]);
    expect(scene.buildings[B509].interior.visible).toBe(false);
    expect([system.reserveTris, system.insideIndex, system.currentIndex]).toEqual([0, -1, -1]);
  });

  it('holds every walk grid run-length coded, and decoded storeys only for the building walked (the P5 review)', async () => {
    // All fourteen files unzip to 30.4 MB; kept whole for the engine's life,
    // that was 30 MB of CPU memory after a tour. Their runs: ~2.0 MB.
    const { system } = await setup({ attach: false });
    let unzipped = 0;
    pack.sites.forEach((site, i) => {
      const raw = read(site.walk!.path);
      unzipped += raw.byteLength;
      system.addWalk(i, decodeWalk(raw, site.id));
    });
    expect(unzipped).toBeGreaterThan(25e6);
    const coded = system.walkBytes();
    expect(coded).toBeLessThan(2.4e6);
    // Visit each building: stand on its L1 grid as the walker (the hint), and query every storey.
    const q: FloorQuery = { kind: 'none', z: Number.NaN, site: null, layer: -1 };
    pack.sites.forEach((site, i) => {
      const g = site.walk!.grid;
      const x = site.at[0] + g.origin[0] + (g.nx * g.cell) / 2;
      const y = site.at[1] + g.origin[1] + (g.ny * g.cell) / 2;
      system.setStoreyHint(i, 0);
      system.update(frame([x, y, 1.6]));
      for (const s of site.storeys) system.floorQuery(x, y, s.ffl, q);
    });
    // Only the last building visited still holds decoded storeys (≤ WALK_LRU of them).
    const held = pack.sites.map((_, i) => system.walk(i)!.residentLayers().length);
    expect(held.slice(0, -1).every((n) => n === 0), held.join(' ')).toBe(true);
    const last = system.walk(pack.sites.length - 1)!;
    const g = last.header;
    expect(system.walkBytes() - coded).toBeLessThanOrEqual(6 * g.nx * g.ny * 2);
    // Leaving it releases that too.
    system.setStoreyHint(null);
    system.update(frame([200, 200, 300]));
    expect(system.walkBytes()).toBe(coded);
  });

  // ---- furniture -------------------------------------------------------------------------

  it('draws NC 514’s furniture full within the tier’s radius and as boxes beyond, re-splitting only after moving', async () => {
    const { scene, system } = await setup();
    const kits = scene.buildings[NC].interiorParts!.furniture;
    const hall = at(NC, -20, -2, 1.6);
    for (const tier of ['high', 'min'] as const) {
      system.update(frame(hall, tier));
      expect(system.getStatus()).toMatchObject({ site: 'NC_514', storeyTag: 'L1', active: true });
      let near = 0;
      let total = 0;
      for (const f of kits) {
        const full = f.full!.object as InstancedMesh;
        const proxy = f.proxy!.object as InstancedMesh;
        expect(full.count + proxy.count, f.kit).toBe(f.count); // every hawker kit is on L1, in the band
        near += full.count;
        total += f.count;
        // Every full instance is within the radius of the camera (block-local glTF x, z).
        const m = full.instanceMatrix.array as Float32Array;
        for (let i = 0; i < full.count; i += 1) {
          expect(Math.hypot(m[16 * i + 12] - -20, m[16 * i + 14] - 2)).toBeLessThanOrEqual(ESTATE_TIER_TABLE[tier].furnitureRadiusM + 1e-4);
        }
      }
      expect(total).toBe(798);
      expect(near).toBeGreaterThan(0);
      expect(near).toBeLessThan(total);
    }
    // Under FURNITURE_REPARTITION_M of travel: nothing changes; past it, a re-split.
    expect(system.update(frame([hall[0] + FURNITURE_REPARTITION_M / 2, hall[1], hall[2]], 'min'))).toBe(false);
    expect(system.update(frame([hall[0] + 3, hall[1], hall[2]], 'min'))).toBe(true);
  });

  it('keeps MSCP 513’s roof-garden benches out of a band that does not reach the roof', async () => {
    const { scene, system } = await setup();
    const benches = scene.buildings[MSCP].interiorParts!.furniture[0];
    system.update(frame(at(MSCP, 3.6, -30, 7.6), 'high')); // L3: band L1–L5
    expect(system.getStatus().band).toBe('L1–L5');
    expect((benches.full!.object as InstancedMesh).count + (benches.proxy!.object as InstancedMesh).count).toBe(0);
    system.update(frame(at(MSCP, 0, 0, 22.6), 'high')); // RF
    expect(system.getStatus().storeyTag).toBe('RF');
    expect((benches.full!.object as InstancedMesh).count + (benches.proxy!.object as InstancedMesh).count).toBe(12);
  });

  // ---- the Walk controls' queries ----------------------------------------------------------

  it('answers floor queries from the building’s walk grid inside its bounds and the ground outside', async () => {
    const { system } = await setup({ attach: false });
    const out: FloorQuery = { kind: 'none', z: 0, site: null, layer: -1 };
    const corridor = corridorL5();
    expect(system.floorQuery(corridor[0], corridor[1], 12, out)).toMatchObject({ kind: 'pending', site: 'BLK_509' });
    expect(system.floorQuery(200, 200, 0, out)).toMatchObject({ kind: 'pending', site: null });
    system.addWalk(B509, walks.get(B509)!);
    system.addGround(decodeGround(read(pack.site!.ground!.path)));
    expect(system.floorQuery(corridor[0], corridor[1], 12, out)).toMatchObject({ kind: 'building', site: 'BLK_509', layer: 4 });
    expect(Math.abs(out.z - 12)).toBeLessThan(0.05);
    // Mid-air between L3 (6.4) and L4 (9.2): inside the bounds, no floor within a step.
    expect(system.floorQuery(corridor[0], corridor[1], 8, out).kind).toBe('blocked');
    // L3's corridor, 0.4 m below the feet.
    expect(system.floorQuery(corridor[0], corridor[1], 6.7, out)).toMatchObject({ kind: 'building', layer: 2 });
    // Bus stop BS1 stands on the ground.
    const bs1 = pack.site!.spawns!.find((s) => s.name === 'Bus stop BS1')!;
    expect(system.floorQuery(bs1.pos[0], bs1.pos[1], 0, out)).toMatchObject({ kind: 'ground', site: null, layer: -1 });
    expect(Math.abs(out.z - bs1.pos[2])).toBeLessThan(0.5);
    expect(system.floorQuery(-50, -50, 0, out).kind).toBe('none');
  });

  it('names the building, storey, flat and room under a point', async () => {
    const { system } = await setup({ attach: false });
    const out: InteriorLocation = { site: null, storey: null, unit: null, room: null };
    const corridor = corridorL5();
    expect(system.locate(corridor[0], corridor[1], 12, out)).toEqual({ site: 'BLK_509', storey: 'L5', unit: null, room: null });
    const site = pack.sites[B509];
    const nav = parseNav(JSON.parse(read(site.nav!.path).toString('utf8')), site.id);
    system.addNav('BLK_509', nav);
    expect(system.locate(corridor[0], corridor[1], 12, out)).toEqual({ site: 'BLK_509', storey: 'L5', unit: null, room: 'Common corridor' });
    // A flat's room: the first L5 room with a flat, at a point inside it.
    const room = nav.rooms[4].find((r) => r.flat !== null && r.area > 6)!;
    const [x0, y0, x1, y1] = room.box;
    let found = false;
    for (let t = 0.1; t < 0.95 && !found; t += 0.05) {
      for (let u = 0.1; u < 0.95 && !found; u += 0.05) {
        system.locate(site.at[0] + x0 + (x1 - x0) * t, site.at[1] + y0 + (y1 - y0) * u, 12, out);
        if (out.unit === room.flat) found = true;
      }
    }
    expect(found).toBe(true);
    expect(out.unit).toMatch(/^#05-\d{3}$/);
    expect(system.locate(200, 200, 0, out).site).toBeNull();
  });

  it('says when a building can be entered: interior on the GPU, walk grid and nav file decoded', async () => {
    const { scheduler, system } = await setup();
    const entry: InteriorEntry = { state: 'absent', reason: null };
    expect(system.entry('BLK_509', entry)).toEqual({ state: 'streaming', reason: null });
    system.addWalk(B509, walks.get(B509)!);
    expect(system.entry('BLK_509', entry).state).toBe('streaming');
    const site = pack.sites[B509];
    system.addNav(B509, parseNav(JSON.parse(read(site.nav!.path).toString('utf8')), site.id));
    expect(system.entry('BLK_509', entry)).toEqual({ state: 'ready', reason: null });
    scheduler.absent.add(site.interior!.path);
    expect(system.entry('BLK_509', entry).state).toBe('streaming');
    expect(system.indexOf('BLK_509')).toBe(B509);
    expect(system.table('BLK_509')!.tags).toEqual(siteStoreyTable('BLK_509').tags);
  });

  it('tells the scheduler the active interior drew, for eviction’s clock', async () => {
    const { scheduler, system } = await setup();
    system.markSeen(0);
    expect(scheduler.seenIds).toEqual([]);
    system.update(frame(corridorL5()));
    system.markSeen(1);
    expect(scheduler.seenIds).toEqual([pack.sites[B509].interior!.path]);
  });
});

describe.skipIf(!hasInteriors)('streaming the interior classes (engine/streaming.ts)', () => {
  const packOf = () => parsePack(JSON.parse(readFileSync(join(packDir, packFile as string), 'utf8')));

  /**
   * A Streaming over the real pack whose fetch serves files from disk, except
   * where `serve` says otherwise. Time is injected: a backoff timer advances it
   * by its own delay and fires at once, so retries run without waiting.
   */
  const run = async (serve: (path: string) => Response | null = () => null) => {
    const pack = packOf();
    let now = 0;
    const decoded: DecodedFile[] = [];
    const blocked: Array<{ site: string; message: string; klass: string }> = [];
    const scheduler = new EstateScheduler({ tier: 'high' });
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const path = String(input).replace(/^\/estate\/v1\.2\//, '');
      const override = serve(path);
      if (override) return override;
      return new Response(readFileSync(join(packDir, ...path.split('/'))));
    }) as typeof fetch;
    // Lean, walking, focused on BLK 509: stage 0, the ground and BLK 509's five files, all at P0.
    const context = { focus: 'BLK_509' as const, mode: 'walk' as const, lean: true, frozen: false };
    let streaming: Streaming;
    const pump = () => streaming.pump(null, context);
    streaming = new Streaming({
      pack, base: '/estate/v1.2/', fetchImpl, scheduler, loader: createGlbLoader(), now: () => now,
      setTimer: (ms, go) => setTimeout(() => { now += ms; go(); }, 0),
      hooks: {
        decoded: (file) => decoded.push(file),
        wake: () => pump(),
        fatal: (message) => { throw new Error(message); },
        stale: (url) => { throw new Error(`stale ${url}`); },
        progress: () => undefined,
        entryBlocked: (site, message, klass) => blocked.push({ site, message, klass }),
      },
    });
    pump();
    const site = pack.sites[B509];
    const ids = [site.interior!.path, site.walk!.path, site.nav!.path, pack.site!.ground!.path];
    for (let i = 0; i < 400 && ids.some((id) => !scheduler.isDone(id) && !scheduler.isFailed(id)); i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    return { pack, decoded, blocked, scheduler, ids };
  };

  it('decodes a building’s interior, walk grid and nav file and the ground, each to its own kind, with no GPU parts for the data', async () => {
    const { decoded, scheduler, ids } = await run();
    for (const id of ids) expect(scheduler.isDone(id), id).toBe(true);
    const byId = new Map(decoded.map((f) => [f.info.id, f]));
    const [i, w, nav, ground] = ids.map((id) => byId.get(id)!);
    expect(i.decoded.kind).toBe('interior');
    expect(i.parts.length).toBeGreaterThan(0);
    expect(w.decoded.kind).toBe('walk');
    if (w.decoded.kind === 'walk') expect(w.decoded.walk.layers.map((l) => l.tag)).toEqual(siteStoreyTable('BLK_509').tags);
    expect(nav.decoded.kind).toBe('nav');
    if (nav.decoded.kind === 'nav') expect(nav.decoded.nav.site).toBe('BLK_509');
    expect(ground.decoded.kind).toBe('ground');
    for (const f of [w, nav, ground]) expect(f.parts).toEqual([]);
    // Walk grids, nav and ground never wait for an upload: residency is the download.
    for (const id of [ids[1], ids[2], ids[3]]) expect(scheduler.isResident(id)).toBe(true);
    expect(scheduler.entryBlocked('BLK_509')).toBe(false);
  }, 30_000);

  it('blocks entry after the interior fails its two retries, and treats a payload of the wrong kind as a failure', async () => {
    let interiorCalls = 0;
    const failing = await run((path) => {
      if (path.startsWith('i/BLK_509.')) { interiorCalls += 1; return new Response('nope', { status: 500 }); }
      return null;
    });
    expect(interiorCalls).toBe(3);
    expect(failing.scheduler.isFailed(failing.ids[0])).toBe(true);
    expect(failing.scheduler.entryBlocked('BLK_509')).toBe(true);
    expect(failing.blocked).toEqual([{ site: 'BLK_509', message: expect.stringMatching(/HTTP 500/), klass: 'i' }]);
    // A GLB where the walk grid belongs: decoded as a failure ("expected sn5w"), retried, then blocked.
    const pack = packOf();
    const glb = readFileSync(join(packDir, ...pack.sites[B509].interior!.path.split('/')));
    const wrong = await run((path) => (path.startsWith('w/BLK_509.') ? new Response(glb) : null));
    expect(wrong.scheduler.isFailed(wrong.ids[1])).toBe(true);
    expect(wrong.blocked).toEqual([{ site: 'BLK_509', message: expect.stringMatching(/expected sn5w, got gltf/), klass: 'w' }]);
    // The reason names what failed: a walk grid is not "its interior" (the P5 review).
    const system = new InteriorSystem(pack, new StubScheduler());
    system.markFailed('BLK_509', 'expected sn5w', 'w');
    system.markFailed('NC_514', 'HTTP 500', 'nav');
    system.markFailed('MSCP_513', 'HTTP 500', 'i');
    const entry: InteriorEntry = { state: 'absent', reason: null };
    expect(system.entry('BLK_509', entry).reason).toBe('Blk 509 cannot be entered: its walkway map did not download. Reload the page to try again.');
    expect(system.entry('NC_514', entry).reason).toMatch(/: its rooms, stairs and lifts did not download\./);
    expect(system.entry('MSCP_513', entry).reason).toMatch(/: its interior did not download\./);
  }, 30_000);
});

describe.skipIf(!hasInteriors)('the repeated storeys against the facade, as the engine places them (the P5 review)', () => {
  // Both files decoded with the engine's loader and parts, T placed by the
  // engine's own applyBand + writeTypical, then compared with F triangle by
  // triangle (reviewer 4206's ceil.ts, kept): a datum or slab-depth slip in
  // writeTypical or parts.ts smaller than the 0.5 m the placement test above
  // allows would still put a storey's walls on another storey's facade. Also
  // pins the ceiling over the band's top storey (F's slab of S + k + 1 plus
  // the interior's own), whose only gaps are the stair wells above the band.
  interface Tri { p: Float64Array; storey: number; ny: number }
  const A = new Vector3(); const B = new Vector3(); const C = new Vector3(); const E1 = new Vector3(); const E2 = new Vector3();
  const trianglesOf = (geometry: BufferGeometry, matrix: Matrix4, storeyOf: (metaZ: number) => number, out: Tri[]) => {
    const pos = geometry.getAttribute('position');
    const meta = geometry.getAttribute('_meta');
    const index = geometry.index;
    const n = index ? index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const ia = index ? index.getX(t) : t; const ib = index ? index.getX(t + 1) : t + 1; const ic = index ? index.getX(t + 2) : t + 2;
      A.fromBufferAttribute(pos as never, ia).applyMatrix4(matrix);
      B.fromBufferAttribute(pos as never, ib).applyMatrix4(matrix);
      C.fromBufferAttribute(pos as never, ic).applyMatrix4(matrix);
      E1.subVectors(B, A).cross(E2.subVectors(C, A));
      const len = E1.length();
      if (len < 1e-9) continue;
      out.push({ p: Float64Array.of(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z), storey: storeyOf(meta ? meta.getZ(ia) : 0), ny: E1.y / len });
    }
  };
  const meshesUnder = (node: Object3D): Mesh[] => {
    const out: Mesh[] = [];
    node.traverse((o) => { if ((o as Mesh).isMesh && !(o as InstancedMesh).isInstancedMesh) out.push(o as Mesh); });
    return out;
  };
  // A triangle's plan (glTF x, z) sampled at 0.25 m cell centres: cb(cell key, height).
  const CELL = 0.25;
  const raster = (t: Tri, cb: (key: number, y: number) => void) => {
    const p = t.p;
    const ax = p[0], az = p[2], bx = p[3], bz = p[5], cx = p[6], cz = p[8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) return;
    const x1 = Math.max(ax, bx, cx), z1 = Math.max(az, bz, cz);
    for (let ix = Math.ceil(Math.min(ax, bx, cx) / CELL - 0.5); (ix + 0.5) * CELL <= x1; ix += 1) {
      const x = (ix + 0.5) * CELL;
      for (let iz = Math.ceil(Math.min(az, bz, cz) / CELL - 0.5); (iz + 0.5) * CELL <= z1; iz += 1) {
        const z = (iz + 0.5) * CELL;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        cb((ix + 4000) * 10000 + (iz + 4000), l1 * p[1] + l2 * p[4] + l3 * p[7]);
      }
    }
  };

  it('puts every facade triangle an interior triangle repeats on that same storey, and keeps the band’s ceiling whole but for stair wells', async () => {
    const pack = parsePack(JSON.parse(readFileSync(join(packDir, packFile as string), 'utf8')));
    const loader = createGlbLoader();
    const load = async (path: string) => {
      const p = await readPayload(new Uint8Array(readFileSync(join(packDir, path))), path);
      const g = await parseGlb(loader, p.bytes);
      g.scene.updateMatrixWorld(true);
      return g.scene;
    };
    const misplaced: string[] = [];
    const gaps: string[] = [];
    let buildings = 0;
    let worstGap = 0;
    for (const site of pack.sites) {
      if (!site.facade || !site.interior) continue;
      buildings += 1;
      const ffl = site.storeys.map((s) => s.ffl);
      const n = ffl.length;
      const F: Tri[] = [];
      for (const part of facadeParts(await load(site.facade.path)).meshes) {
        const m = part.object as Mesh;
        trianglesOf(m.geometry, m.matrixWorld, (z) => z, F);
      }
      const ip = interiorParts(await load(site.interior.path), site.storeys);
      const I: Tri[] = [];
      if (ip.typical) {
        // The engine's own placement: applyBand's instances through writeTypical, one storey at a time.
        const table = storeyTable(site.storeys);
        const band = createBandState();
        const placed = new Matrix4();
        for (let k = 0; k < ip.typical.meshes.length; k += 1) {
          const mesh = ip.typical.meshes[k].object as InstancedMesh;
          for (let s = 0; s < n; s += 1) {
            if (site.storeys[s].geom !== 'typical') continue;
            applyBand(band, table, s, 1);
            writeTypical(mesh, ip.typical.base[k], band);
            const j = Array.from(band.typicalStorey.subarray(0, band.typicalCount)).indexOf(s);
            expect(j, `${site.id} ${site.storeys[s].tag} has a T instance`).toBeGreaterThanOrEqual(0);
            placed.fromArray(mesh.instanceMatrix.array as Float32Array, 16 * j);
            trianglesOf(mesh.geometry, placed, () => s, I);
          }
        }
      }
      if (ip.residual) for (const m of meshesUnder(ip.residual.node)) trianglesOf(m.geometry, m.matrixWorld, (z) => z, I);
      for (const sp of ip.specials) for (const m of meshesUnder(sp.node)) trianglesOf(m.geometry, m.matrixWorld, () => sp.storey, I);

      // 1. Placement: a facade triangle whose centroid an interior triangle repeats (±1 cm) does so on its own storey.
      const centroid = (t: Tri, a: number) => Math.round(((t.p[a] + t.p[a + 3] + t.p[a + 6]) / 3) * 100);
      const iStoreys = new Map<string, number[]>();
      for (const t of I) {
        const key = `${centroid(t, 0)},${centroid(t, 1)},${centroid(t, 2)}`;
        const list = iStoreys.get(key);
        if (list) list.push(t.storey); else iStoreys.set(key, [t.storey]);
      }
      let other = 0;
      let example = '';
      for (const t of F) {
        const cx = centroid(t, 0), cy = centroid(t, 1), cz = centroid(t, 2);
        let found: number[] | undefined;
        for (let dx = -1; dx <= 1 && !found; dx += 1) {
          for (let dy = -1; dy <= 1 && !found; dy += 1) {
            for (let dz = -1; dz <= 1 && !found; dz += 1) found = iStoreys.get(`${cx + dx},${cy + dy},${cz + dz}`);
          }
        }
        if (found && !found.includes(t.storey)) {
          other += 1;
          if (!example) example = `F ${site.storeys[t.storey]?.tag} repeated by I ${found.map((s) => site.storeys[s]?.tag).join('/')} at y ${(cy / 100).toFixed(2)}`;
        }
      }
      if (other) misplaced.push(`${site.id}: ${other} facade triangles on another storey's interior, e.g. ${example}`);

      // 2. The ceiling over the band's top storey s, at k = 1 and 2: every floor cell of s that the
      // building roofs at all is roofed by what that band draws (the interior inside it, F outside it).
      const floorCells: Set<number>[] = Array.from({ length: n }, () => new Set());
      for (const t of I) {
        if (t.ny < 0.7) continue;
        raster(t, (key, y) => { if (y > ffl[t.storey] - 0.35 && y < ffl[t.storey] + 0.35) floorCells[t.storey].add(key); });
      }
      // Each down-facing sample belongs to at most one storey's ceiling range (FFL + 1.9 … next FFL + 0.3).
      const ceilI: Map<number, number[]>[] = Array.from({ length: n }, () => new Map());
      const ceilF: Map<number, number[]>[] = Array.from({ length: n }, () => new Map());
      const sample = (into: Map<number, number[]>[]) => (t: Tri) => {
        if (t.ny > -0.7) return;
        raster(t, (key, y) => {
          for (let s = 1; s < n - 1; s += 1) {
            if (y > ffl[s] + 1.9 && y < ffl[s + 1] + 0.3) {
              const list = into[s].get(key);
              if (list) list.push(t.storey); else into[s].set(key, [t.storey]);
              return;
            }
          }
        });
      };
      I.forEach(sample(ceilI));
      F.forEach(sample(ceilF));
      for (let s = 1; s < n - 1; s += 1) {
        const roofed = [...floorCells[s]].filter((c) => ceilI[s].has(c));
        if (roofed.length === 0) continue;
        for (const k of [1, 2]) {
          const lo = Math.max(0, s - k);
          const holes = roofed.filter((c) => !(ceilI[s].get(c)!.some((st) => st >= lo && st <= s)
            || (ceilF[s].get(c) ?? []).some((st) => st < lo || st > s))).length;
          const pct = (100 * holes) / roofed.length;
          worstGap = Math.max(worstGap, pct);
          if (pct > 0.3) gaps.push(`${site.id} ${site.storeys[s].tag} k=${k}: ${pct.toFixed(2)} % of the floor has no ceiling`);
        }
      }
    }
    expect(buildings).toBe(14);
    expect(misplaced).toEqual([]);
    // Stair wells above the band (stair geometry lives in the interior file only): 0.04–0.29 % today.
    expect(gaps).toEqual([]);
    expect(worstGap).toBeGreaterThan(0);
  }, 120_000);
});
