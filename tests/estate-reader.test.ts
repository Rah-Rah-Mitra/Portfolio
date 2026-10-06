import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parsePack, type EstatePack, type Geo } from '../lib/estate/schema';

// What the engine's loader may be handed (plan §10.2 estate-reader, P4b): every
// committed .glb.gz, read at the glTF level, against pack.json. Three's
// GLTFLoader with the meshopt decoder parsing every s0, f and d file in node is
// tests/estate-engine-parts.test.ts; this pins the contract that parse rests
// on, without decoding a vertex:
//  - extensionsRequired is at most meshopt, quantization and gpu-instancing
//    (anything else and GLTFLoader refuses the file in the browser);
//  - no primitive has more than 65,535 vertices (the 2 MB-per-frame upload
//    credit and 16-bit indices assume it), and the largest is pack.json's
//    maxPrimVerts;
//  - primitives, vertices, triangles, F's edge segments and D's instances
//    match pack.json, the numbers the detail selection and its caps proof
//    (estate-budget) count with;
//  - `_META` is u8 × 4 on every F primitive; every D batch carries `_STOREY`
//    as u8 × 4 (gltf-transform 4.5.1 corrupts 1-byte instance attributes under
//    meshopt, so P2 widened it, storey in x).
// Runs on whatever pack sits under public/estate/v1.2 and skips without one.

const root = fileURLToPath(new URL('..', import.meta.url));
const packDir = join(root, 'public', 'estate', 'v1.2');
const packFile = existsSync(packDir) ? readdirSync(packDir).find((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f)) : undefined;
const hasGeometry = packFile !== undefined && existsSync(join(packDir, 's0'));

const ALLOWED_REQUIRED = new Set(['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_mesh_gpu_instancing']);
const UNSIGNED_BYTE = 5121;
const TRIANGLES = 4;
const LINES = 1;

interface Accessor { count: number; componentType: number; type: string }
interface Primitive { mode?: number; indices?: number; attributes: Record<string, number> }
interface GltfJson {
  extensionsRequired?: string[];
  accessors: Accessor[];
  meshes: Array<{ primitives: Primitive[] }>;
  nodes: Array<{ mesh?: number; extensions?: { EXT_mesh_gpu_instancing?: { attributes: Record<string, number> } } }>;
}

/** The JSON chunk of a gzipped GLB. */
const glbJson = (path: string): GltfJson => {
  const bytes = gunzipSync(readFileSync(join(packDir, path)));
  expect(bytes.toString('latin1', 0, 4), path).toBe('glTF');
  expect(bytes.readUInt32LE(4), path).toBe(2);
  const length = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16), path).toBe(0x4e4f534a); // 'JSON'
  return JSON.parse(bytes.toString('utf8', 20, 20 + length)) as GltfJson;
};

const trianglesOf = (gltf: GltfJson, p: Primitive) =>
  Math.floor((p.indices !== undefined ? gltf.accessors[p.indices].count : gltf.accessors[p.attributes.POSITION].count) / 3);

/** Primitive-level totals of a file, every primitive counted once (as stored). */
const totals = (gltf: GltfJson) => {
  let prims = 0;
  let verts = 0;
  let maxPrimVerts = 0;
  let tris = 0;
  let lineSegments = 0;
  for (const mesh of gltf.meshes) {
    for (const p of mesh.primitives) {
      prims += 1;
      const n = gltf.accessors[p.attributes.POSITION].count;
      verts += n;
      maxPrimVerts = Math.max(maxPrimVerts, n);
      if ((p.mode ?? TRIANGLES) === TRIANGLES) tris += trianglesOf(gltf, p);
      else if (p.mode === LINES && p.indices !== undefined) lineSegments += gltf.accessors[p.indices].count / 2;
    }
  }
  return { prims, verts, maxPrimVerts, tris, lineSegments };
};

const u8x4 = (gltf: GltfJson, accessor: number) => ({ componentType: gltf.accessors[accessor].componentType, type: gltf.accessors[accessor].type });

describe.skipIf(!hasGeometry)('the pack’s GLB files, read against pack.json', () => {
  const pack: EstatePack | null = hasGeometry ? parsePack(JSON.parse(readFileSync(join(packDir, packFile as string), 'utf8'))) : null;
  const files: Array<{ ref: Geo; kind: 'massing' | 'site' | 'f' | 'd'; id: string }> = [];
  if (pack) {
    if (pack.massing) files.push({ ref: pack.massing, kind: 'massing', id: 'massing' });
    if (pack.site) files.push({ ref: pack.site.file, kind: 'site', id: 'site' });
    for (const s of pack.sites) {
      if (s.facade) files.push({ ref: s.facade, kind: 'f', id: s.id });
      if (s.detail) files.push({ ref: s.detail, kind: 'd', id: s.id });
    }
  }

  it('covers stage 0 and every building’s F and D', () => {
    expect(files.filter((f) => f.kind === 'f')).toHaveLength(14);
    expect(files.filter((f) => f.kind === 'd')).toHaveLength(14);
    expect(files.filter((f) => f.kind === 'massing' || f.kind === 'site')).toHaveLength(2);
  });

  it('requires only meshopt, quantization and gpu-instancing, and keeps every primitive ≤ 65,535 vertices', () => {
    for (const { ref, id, kind } of files) {
      const gltf = glbJson(ref.path);
      for (const ext of gltf.extensionsRequired ?? []) expect(ALLOWED_REQUIRED.has(ext), `${kind} ${id}: ${ext}`).toBe(true);
      const t = totals(gltf);
      expect(t.maxPrimVerts, `${kind} ${id}`).toBeLessThanOrEqual(65_535);
      expect(t.maxPrimVerts, `${kind} ${id}`).toBe(ref.maxPrimVerts);
      expect(ref.maxPrimVerts, `${kind} ${id}`).toBeLessThanOrEqual(65_535);
    }
  });

  it('matches pack.json’s primitives, vertices and triangles (F: edges too)', () => {
    for (const { ref, id, kind } of files) {
      const gltf = glbJson(ref.path);
      const t = totals(gltf);
      expect(t.prims, `${kind} ${id} prims`).toBe(ref.prims);
      expect(t.verts, `${kind} ${id} verts`).toBe(ref.verts);
      if (kind === 'd') continue; // D's tris count every drawn instance: below
      expect(t.tris, `${kind} ${id} tris`).toBe(ref.tris);
      if (kind === 'f') expect(t.lineSegments, `${id} edges`).toBe(pack!.sites.find((s) => s.id === id)!.facade!.edges);
    }
  });

  it('tags every F primitive with _META as u8 × 4', () => {
    for (const { ref, id, kind } of files) {
      if (kind !== 'f') continue;
      const gltf = glbJson(ref.path);
      for (const mesh of gltf.meshes) {
        for (const p of mesh.primitives) {
          const meta = p.attributes._META ?? p.attributes._meta;
          expect(meta, `${id} primitive without _META`).toBeDefined();
          expect(u8x4(gltf, meta), id).toEqual({ componentType: UNSIGNED_BYTE, type: 'VEC4' });
        }
      }
    }
  });

  it('instances every D batch with _STOREY as u8 × 4, and counts its instances and drawn triangles as pack.json does', () => {
    for (const { ref, id, kind } of files) {
      if (kind !== 'd') continue;
      const site = pack!.sites.find((s) => s.id === id)!;
      const gltf = glbJson(ref.path);
      expect(gltf.extensionsRequired, id).toContain('EXT_mesh_gpu_instancing');
      let instances = 0;
      let drawn = 0;
      for (const node of gltf.nodes) {
        if (node.mesh === undefined) continue;
        const inst = node.extensions?.EXT_mesh_gpu_instancing;
        expect(inst, `${id}: a D node without EXT_mesh_gpu_instancing`).toBeDefined();
        const storey = inst!.attributes._STOREY;
        expect(storey, `${id}: a D batch without _STOREY`).toBeDefined();
        expect(u8x4(gltf, storey), id).toEqual({ componentType: UNSIGNED_BYTE, type: 'VEC4' });
        const count = gltf.accessors[storey].count;
        expect(gltf.accessors[inst!.attributes.TRANSLATION].count, id).toBe(count);
        instances += count;
        for (const p of gltf.meshes[node.mesh].primitives) drawn += count * trianglesOf(gltf, p);
      }
      expect(instances, `${id} instances`).toBe(site.detail!.instances);
      expect(drawn, `${id} drawn tris`).toBe(site.detail!.tris);
    }
  });
});
