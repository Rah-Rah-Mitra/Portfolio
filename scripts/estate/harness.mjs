// The P2 validation harness (plan §6.7): parses EVERY GLB of a built pack with
// three's own GLTFLoader + MeshoptDecoder, in node, and checks what three makes
// of it against pack.json. three is not a dependency of anything here; install
// the pinned runtime version into a throwaway folder first:
//
//   npm i --prefix artifacts/estate-smoke three@0.186.1
//   node scripts/estate/harness.mjs --pack artifacts/estate/v1.2-dev
//
// Checks per file: triangle, vertex and primitive counts; the attribute names
// three produces (GLTFLoader lower-cases unknown names, so _META arrives as
// _meta, u8 × 4); D's and furniture's instance attributes (instanceMatrix plus
// _STOREY, u8 × 4, as an InstancedBufferAttribute); required extensions limited
// to meshopt, quantisation and GPU instancing; no primitive over 65,535 vertices.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { REPO_ROOT, findPackJson, packFiles } from './check.mjs';

const ALLOWED_REQUIRED = new Set(['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_mesh_gpu_instancing']);

const args = { pack: null, three: join(REPO_ROOT, 'artifacts', 'estate-smoke', 'node_modules', 'three') };
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i] === '--pack') args.pack = resolve(process.argv[++i]);
  else if (process.argv[i] === '--three') args.three = resolve(process.argv[++i]);
  else { console.error(`unknown argument ${process.argv[i]}`); process.exit(2); }
}
if (!args.pack) { console.error('usage: harness.mjs --pack <dir> [--three <node_modules/three>]'); process.exit(2); }

const url = (rel) => pathToFileURL(join(args.three, ...rel.split('/'))).href;
const THREE = await import(url('build/three.module.js'));
const { GLTFLoader } = await import(url('examples/jsm/loaders/GLTFLoader.js'));
const { MeshoptDecoder } = await import(url('examples/jsm/libs/meshopt_decoder.module.js'));
await MeshoptDecoder.ready;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const parse = (bytes) => new Promise((ok, fail) => {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  loader.parse(ab, '', ok, fail);
});

const packPath = findPackJson(args.pack);
const pack = JSON.parse(readFileSync(packPath, 'utf8'));
const problems = [];
let files = 0;
console.log(`three r${THREE.REVISION}: ${packPath}`);

for (const { ref, geo, site } of packFiles(pack)) {
  if (!ref.path.endsWith('.glb.gz')) continue;
  files += 1;
  const where = ref.path;
  const raw = gunzipSync(readFileSync(join(args.pack, ...ref.path.split('/'))));
  const json = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString('utf8'));
  for (const ext of json.extensionsRequired ?? []) if (!ALLOWED_REQUIRED.has(ext)) problems.push(`${where}: requires ${ext}`);
  let gltf;
  try { gltf = await parse(raw); } catch (e) { problems.push(`${where}: GLTFLoader failed: ${e.message ?? e}`); continue; }
  let tris = 0; let drawn = 0; let verts = 0; let prims = 0; let lines = 0; let instances = 0; let maxVerts = 0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh && !o.isLineSegments) return;
    prims += 1;
    const g = o.geometry;
    const n = g.index ? g.index.count : g.attributes.position.count;
    verts += g.attributes.position.count;
    maxVerts = Math.max(maxVerts, g.attributes.position.count);
    const names = Object.keys(g.attributes).sort();
    const want = o.isInstancedMesh && g.attributes._STOREY ? ['_STOREY', '_meta', 'position'] : ['_meta', 'position'];
    if (names.join() !== want.join()) problems.push(`${where} ${o.name}: attributes ${names.join(', ')}, expected ${want.join(', ')}`);
    const meta = g.attributes._meta;
    if (!meta || meta.itemSize !== 4 || !(meta.array instanceof Uint8Array)) problems.push(`${where} ${o.name}: _meta is not u8 × 4`);
    if (o.isLineSegments) { lines += n / 2; return; }
    tris += n / 3;
    if (o.isInstancedMesh) {
      instances += o.count;
      drawn += (n / 3) * o.count;
      const st = g.attributes._STOREY;
      if (st && !(st.isInstancedBufferAttribute && st.itemSize === 4 && st.array instanceof Uint8Array && st.count === o.count)) {
        problems.push(`${where} ${o.name}: _STOREY is not a u8 × 4 instance attribute of ${o.count}`);
      }
      if (geo === 'd' && !st) problems.push(`${where} ${o.name}: D instance without _STOREY`);
    } else drawn += n / 3;
  });
  const expectTris = geo === 'd' ? ref.tris : ref.tris;
  const gotTris = geo === 'd' ? drawn : tris;
  if (gotTris !== expectTris) problems.push(`${where}: three counts ${gotTris} triangles, pack.json ${expectTris}`);
  if (verts !== ref.verts) problems.push(`${where}: three counts ${verts} vertices, pack.json ${ref.verts}`);
  if (prims !== ref.prims) problems.push(`${where}: three counts ${prims} primitives, pack.json ${ref.prims}`);
  if (maxVerts > 65535) problems.push(`${where}: a primitive holds ${maxVerts} vertices`);
  if (geo === 'f' && site) {
    const s = pack.sites.find((x) => x.id === site);
    if (lines !== s.facade.edges) problems.push(`${where}: ${lines} edge lines, pack.json ${s.facade.edges}`);
  }
  if (geo === 'd') {
    const s = pack.sites.find((x) => x.id === site);
    if (instances !== s.detail.instances) problems.push(`${where}: ${instances} instances, pack.json ${s.detail.instances}`);
  }
}

console.log(`${files} GLB files parsed by GLTFLoader${problems.length ? `; ${problems.length} problems:` : '; all counts and attributes match pack.json'}`);
for (const p of problems) console.error(`  FAIL: ${p}`);
process.exitCode = problems.length ? 1 : 0;
