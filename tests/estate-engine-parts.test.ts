import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShaderLib, type InstancedMesh, type Mesh, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ESTATE_SITE_IDS } from '../lib/estate/ids';
import { LOD_DETAIL, LOD_FACADE, LOD_MASSING } from '../lib/estate/lod';
import { parsePack, type EstatePack } from '../lib/estate/schema';
import { createGlbLoader, parseGlb, readPayload } from '../components/workbench/estate/engine/loaders';
import { DRAW_ORDER, FLAT_NORMAL_GUARDED, createMaterialKit, createStoreyUniforms } from '../components/workbench/estate/engine/materials';
import { createPalette } from '../components/workbench/estate/engine/palette';
import {
  detailParts, facadeParts, massingParts, siteParts, type DecodedParts,
} from '../components/workbench/estate/engine/parts';
import { EstateScene } from '../components/workbench/estate/engine/scene';
import { fileIndex } from '../components/workbench/estate/engine/streaming';

// The engine's view of real pack files, decoded in node through the same
// loader the browser uses (GLTFLoader + MeshoptDecoder on the main thread):
// every s0, f and d file splits into the parts the scheduler uploads one at a
// time, and the scene shows exactly the level it is told. Runs on the pack
// under public/estate/v1.2 (the committed v1.2 release pack, or a local copy)
// and skips without one.

const root = fileURLToPath(new URL('..', import.meta.url));
const packDir = join(root, 'public', 'estate', 'v1.2');
const packFile = existsSync(packDir) ? readdirSync(packDir).find((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f)) : undefined;
const hasGeometry = packFile !== undefined && existsSync(join(packDir, 's0'));

const COLOURS = new Proxy({}, { get: () => 'rgb(140, 150, 160)' }) as Record<string, string>;

describe('the estate shader patch', () => {
  it('guards the flat-shading normal against a zero screen derivative, which would draw a face black', () => {
    // normalize( cross( dFdx, dFdy ) ) of a zero vector is NaN; SwiftShader produced
    // one at axis-aligned walking poses (17 % of the frame black at Blk 509 stair 5).
    const kit = createMaterialKit(createPalette(COLOURS));
    for (const material of [kit.opaque(createStoreyUniforms()), kit.glass(createStoreyUniforms())]) {
      const shader = {
        uniforms: {},
        vertexShader: ShaderLib.lambert.vertexShader,
        fragmentShader: ShaderLib.lambert.fragmentShader,
      } as unknown as WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, undefined as unknown as WebGLRenderer);
      expect(shader.fragmentShader).not.toContain('#include <normal_fragment_begin>');
      expect(shader.fragmentShader).toContain(FLAT_NORMAL_GUARDED);
      expect(shader.fragmentShader).not.toContain('normalize( cross( fdx, fdy ) )');
    }
    kit.dispose();
  });

  it('adds toon shading as one uniform every material shares: Lambert only, before the lit colour is written, no new program', () => {
    const kit = createMaterialKit(createPalette(COLOURS));
    const patch = (material: ReturnType<typeof kit.opaque> | ReturnType<typeof kit.edge>, source: { vertexShader: string; fragmentShader: string }) => {
      const shader = { uniforms: {} as Record<string, unknown>, ...source } as unknown as WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, undefined as unknown as WebGLRenderer);
      return shader;
    };
    const opaque = kit.opaque(createStoreyUniforms());
    const glass = kit.glass(createStoreyUniforms());
    const edge = kit.edge(createStoreyUniforms());
    const lit = patch(opaque, ShaderLib.lambert);
    const toon = lit.fragmentShader.indexOf('uToon > 0.5 && estateColour.a > 0.99');
    expect(toon).toBeGreaterThan(0);
    // Inside #ifdef LAMBERT, after the lit colour exists and before it is written.
    expect(lit.fragmentShader.lastIndexOf('#ifdef LAMBERT', toon)).toBeGreaterThan(lit.fragmentShader.indexOf('vec3 outgoingLight'));
    expect(toon).toBeLessThan(lit.fragmentShader.indexOf('#include <opaque_fragment>'));
    expect(lit.fragmentShader).not.toMatch(/uToon[^;]*discard/);
    // The line work turns to ink with it: the edge slot reads the cut slot (accent-900) while toon is on.
    expect(patch(edge, ShaderLib.basic).fragmentShader).toContain('float estateInk = uToon > 0.5 ? 31.0 : 30.0;');
    // …in the lines' (unlit) program only: a lit surface in the edge slot (Plan's room marker) keeps its colour.
    expect(lit.fragmentShader).toMatch(/#ifdef LAMBERT\s*vec4 estateColour = estatePalette\( vEstateSlot \);\s*#else/);
    // Lines are meshbasic: no LAMBERT, so the block never compiles there.
    expect(ShaderLib.basic.fragmentShader).not.toContain('#define LAMBERT');
    expect(ShaderLib.lambert.fragmentShader).toContain('#define LAMBERT');
    // One uniform object for the whole kit: a single write flips every material.
    const uniformsOf = (m: { userData: Record<string, unknown> }) => m.userData.estate as { uToon: { value: number }; uToonCuts: unknown };
    expect(uniformsOf(opaque).uToon).toBe(kit.toon.uToon);
    expect(uniformsOf(glass).uToon).toBe(kit.toon.uToon);
    expect(uniformsOf(edge).uToon).toBe(kit.toon.uToon);
    expect(patch(glass, ShaderLib.lambert).uniforms.uToon).toBe(kit.toon.uToon);
    expect(kit.setToon(true)).toBe(true);
    expect(kit.toon.uToon.value).toBe(1);
    expect(kit.setToon(true)).toBe(false);
    // The program key is the shared onBeforeCompile's source, whatever the uniform says.
    expect(opaque.customProgramCacheKey()).toBe(edge.customProgramCacheKey());
    const keyOn = opaque.customProgramCacheKey();
    kit.setToon(false);
    expect(opaque.customProgramCacheKey()).toBe(keyOn);
    expect(patch(opaque, ShaderLib.lambert).fragmentShader).toBe(lit.fragmentShader);
    // The bands: the top one the token itself, two lower ones between 0 and 1.
    const cuts = kit.toon.uToonCuts.value;
    const levels = kit.toon.uToonLevels.value;
    expect(cuts.x).toBeGreaterThan(cuts.y);
    expect(levels.x).toBeLessThan(1);
    expect(levels.y).toBeGreaterThan(0);
    expect(levels.x).toBeGreaterThan(levels.y);
    kit.dispose();
  });

  it('draws the ground grid after every opaque surface and edge line, so early depth testing rejects the ground it lies under', () => {
    const kit = createMaterialKit(createPalette(COLOURS));
    expect(DRAW_ORDER.surface).toBeLessThan(DRAW_ORDER.edge);
    expect(DRAW_ORDER.edge).toBeLessThan(DRAW_ORDER.grid);
    expect(kit.gridMesh.renderOrder).toBe(DRAW_ORDER.grid);
    kit.dispose();
  });
});

describe.skipIf(!hasGeometry)('the engine on the pack in public/estate/v1.2', () => {
  let pack: EstatePack;
  const decoded = new Map<string, DecodedParts>();
  const loader = createGlbLoader();

  const decode = async (path: string, kind: 'massing' | 'site' | 'f' | 'd'): Promise<DecodedParts> => {
    const payload = await readPayload(new Uint8Array(readFileSync(join(packDir, path))), path);
    expect(payload.kind).toBe('gltf');
    const gltf = await parseGlb(loader, payload.bytes);
    const parts = kind === 'massing' ? massingParts(gltf.scene)
      : kind === 'site' ? siteParts(gltf.scene)
        : kind === 'f' ? facadeParts(gltf.scene) : detailParts(gltf.scene);
    decoded.set(path, parts);
    return parts;
  };

  beforeAll(async () => {
    pack = parsePack(JSON.parse(readFileSync(join(packDir, packFile as string), 'utf8')));
    await decode(pack.massing!.path, 'massing');
    await decode(pack.site!.file.path, 'site');
    for (const site of pack.sites) {
      if (site.facade) await decode(site.facade.path, 'f');
      if (site.detail) await decode(site.detail.path, 'd');
    }
  }, 60_000);

  it('indexes every streamable file with its class, site and size', () => {
    const files = fileIndex(pack);
    expect(files.get(pack.massing!.path)).toMatchObject({ klass: 's0', site: null, stage: 'massing' });
    expect(files.get(pack.site!.file.path)).toMatchObject({ klass: 's0', site: null, stage: 'site' });
    const blk509 = pack.sites[ESTATE_SITE_IDS.indexOf('BLK_509')];
    expect(files.get(blk509.facade!.path)).toMatchObject({ klass: 'f', site: 'BLK_509', siteIndex: 8, bytes: blk509.facade!.bytes, label: 'STREAMING BLK 509 FAÇADE' });
  });

  it('splits the massing into one node per site and the site into ground, crowns and full trees', () => {
    const massing = decoded.get(pack.massing!.path);
    expect(massing?.kind).toBe('massing');
    if (massing?.kind !== 'massing') return;
    expect([...massing.bySite.keys()].sort()).toEqual([...ESTATE_SITE_IDS].sort());
    expect(massing.parts).toHaveLength(pack.massing!.prims);
    const site = decoded.get(pack.site!.file.path);
    if (site?.kind !== 'site') throw new Error('site file did not decode as the site');
    expect(site.quadrants).toHaveLength(pack.site!.quadrants.length);
    expect(site.species.map((s) => s.name).sort()).toEqual(pack.site!.trees.map((t) => t.species).sort());
    for (const s of site.species) {
      expect(s.full?.role).toBe('trees');
      expect(s.crown?.role).toBe('site');
    }
    // Ground and crowns upload before any full tree.
    const roles = site.parts.map((p) => p.role);
    expect(roles.lastIndexOf('site')).toBeLessThan(roles.indexOf('trees'));
    expect(site.parts).toHaveLength(pack.site!.file.prims);
  });

  it('gives each façade its node, triangle meshes and one edge part, and each detail file one part per batch', () => {
    for (const s of pack.sites) {
      const f = decoded.get(s.facade!.path);
      if (f?.kind !== 'facade') throw new Error(`${s.id} façade`);
      expect(f.node.name).toBe('facade');
      expect(f.meshes.length + f.edges.length).toBe(s.facade!.prims);
      expect(f.edges).toHaveLength(s.facade!.edges > 0 ? 1 : 0);
      const d = decoded.get(s.detail!.path);
      if (d?.kind !== 'detail') throw new Error(`${s.id} detail`);
      expect(d.parts).toHaveLength(s.detail!.draws);
      for (const p of d.parts) {
        expect((p.object as InstancedMesh).isInstancedMesh).toBe(true);
        expect(p.object.geometry.getAttribute('_STOREY')).toBeTruthy();
        expect(p.bytes).toBeGreaterThan(0);
      }
      // The drawn D triangles add up to pack.json's (every instance counted).
      const drawn = d.parts.reduce((n, p) => {
        const mesh = p.object as InstancedMesh;
        const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
        return n + tris * mesh.count;
      }, 0);
      expect(drawn).toBe(s.detail!.tris);
    }
  });

  it('places parts in the scene and shows exactly the level it is given', () => {
    const kit = createMaterialKit(createPalette(COLOURS));
    const scene = new EstateScene(pack, kit);
    const files = fileIndex(pack);
    for (const [path, parts] of decoded) {
      const info = files.get(path)!;
      scene.attach(path, parts, info.siteIndex >= 0 ? info.siteIndex : null);
      for (const p of parts.parts) p.uploaded = true;
    }
    const blk = scene.buildings[ESTATE_SITE_IDS.indexOf('BLK_509')];
    expect(blk.group.position.toArray()).toEqual([blk.site.at[0], 0, -blk.site.at[1]]);
    // Every estate material shares one onBeforeCompile (one program per kind).
    expect(blk.materials.facade.onBeforeCompile).toBe(blk.materials.massing.onBeforeCompile);
    expect(blk.materials.edge.onBeforeCompile).toBe(blk.materials.detail.onBeforeCompile);

    const levels = ESTATE_SITE_IDS.map((_, i) => (i === blk.index ? LOD_DETAIL : i === 0 ? LOD_FACADE : LOD_MASSING));
    for (const b of scene.buildings) b.inView = true;
    for (const q of scene.quadrants) q.inView = true;
    const near = new Float64Array(14).fill(10);
    expect(scene.applyLevels(levels, true, near, 100)).toBe(14);
    const visible = (o: { visible: boolean }) => o.visible;
    expect(blk.massing!.parts.every((p) => !visible(p.object))).toBe(true);
    expect(blk.facade!.meshes.every((p) => visible(p.object))).toBe(true);
    expect(blk.facade!.edges.every((p) => visible(p.object))).toBe(true);
    // The lines keep their place after the surfaces in the nearest-first list.
    expect(blk.facade!.edges.every((p) => p.object.renderOrder === DRAW_ORDER.edge)).toBe(true);
    expect(blk.facade!.meshes.every((p) => p.object.renderOrder === DRAW_ORDER.surface)).toBe(true);
    expect(blk.detail!.parts.every((p) => visible(p.object))).toBe(true);
    expect(blk.materials.facade.polygonOffset).toBe(true);
    const first = scene.buildings[0];
    expect(first.detail!.parts.some((p) => visible(p.object))).toBe(false);
    const third = scene.buildings[2];
    expect(third.massing!.parts.every((p) => visible(p.object))).toBe(true);
    expect(third.facade!.meshes.some((p) => visible(p.object))).toBe(false);
    const massingLines = (b: typeof blk) => (b.materials.massing.userData.estate as { uMassingLines: { value: number } }).uMassingLines.value;
    expect(massingLines(third)).toBe(1);
    // Out of edge reach: no lines, no polygon offset, no massing storey lines.
    scene.applyLevels(levels, true, new Float64Array(14).fill(500), 100);
    expect(blk.facade!.edges.some((p) => visible(p.object))).toBe(false);
    expect(blk.materials.facade.polygonOffset).toBe(false);
    expect(massingLines(third)).toBe(0);
    // A tier without edges keeps the massing lines near (they are not edge lines).
    scene.applyLevels(levels, false, near, 100);
    expect(blk.facade!.edges.some((p) => visible(p.object))).toBe(false);
    expect(massingLines(third)).toBe(1);
    // The viewer's Edge lines off drops them too.
    scene.applyLevels(levels, false, near, 100, false);
    expect(massingLines(third)).toBe(0);
    scene.applyLevels(levels, false, near, 100);
    expect(massingLines(third)).toBe(1);
    // Same levels again: no swaps.
    expect(scene.applyLevels(levels, true, near, 100)).toBe(0);
    expect(blk.facade!.edges.every((p) => visible(p.object))).toBe(true);

    // Trees: within 80 m of the estate centre full, the rest crowns.
    scene.invalidateTrees();
    expect(scene.updateTrees(200, -200, 80)).toBe(true);
    const total = pack.site!.trees.reduce((n, t) => n + t.instances, 0);
    const counted = scene.species.reduce((n, s) => n + s.partition.nearCount + s.partition.farCount, 0);
    expect(counted).toBe(total);
    const nearTrees = scene.species.reduce((n, s) => n + s.partition.nearCount, 0);
    expect(nearTrees).toBeGreaterThan(0);
    expect(nearTrees).toBeLessThan(total);
    for (const s of scene.species) {
      expect((s.full!.object as InstancedMesh).count).toBe(s.partition.nearCount);
      expect((s.crown!.object as InstancedMesh).count).toBe(s.partition.farCount);
    }
    // A rewritten instanced set drops its sphere (three's sort depth), measured afresh at the next projection.
    for (const s of scene.species) (s.full!.object as InstancedMesh).computeBoundingSphere();
    scene.invalidateTrees();
    expect(scene.updateTrees(60, -60, 80)).toBe(true);
    const moved = scene.species.filter((s) => s.partition.nearCount > 0 || s.partition.farCount > 0);
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.every((s) => (s.full!.object as InstancedMesh).boundingSphere === null)).toBe(true);
    scene.invalidateTrees();
    expect(scene.updateTrees(200, -200, 80)).toBe(true);
    const reserve = scene.reserve({ tris: 0, draws: 0 });
    const quadTris = scene.quadrants.reduce((n, q) => n + q.tris, 0);
    const treeTris = scene.species.reduce((n, s) => n + s.partition.nearCount * s.fullTris + s.partition.farCount * s.crownTris, 0);
    expect(reserve.tris).toBe(2 + quadTris + treeTris);
    expect(reserve.draws).toBe(1 + scene.quadrants.length + scene.species.filter((s) => s.partition.nearCount > 0).length + scene.species.filter((s) => s.partition.farCount > 0).length);
    // The quadrants' triangles are pack.json's.
    expect(quadTris).toBe(pack.site!.quadrants.reduce((n, q) => n + q.tris, 0));

    // A lost context: nothing on the GPU, nothing shown.
    scene.markAllNotUploaded([...decoded.values()].map((d) => d.parts));
    scene.applyLevels(levels, true, near, 100);
    expect(blk.facade!.meshes.some((p) => visible(p.object))).toBe(false);
    expect((scene.quadrants[0].part.object as Mesh).visible).toBe(false);
    kit.dispose();
  });
});
