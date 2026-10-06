// The P2 validation harness (plan §6.7). Parses EVERY GLB of a built pack with
// three's own GLTFLoader + MeshoptDecoder, in node, checks what three makes of
// it against pack.json and lib/estate/packBudgets.json, then sums the plan
// §7.11 scenarios from what three decoded. three is not a dependency of
// anything here; install the runtime's pinned version into a throwaway folder:
//
//   npm i --prefix artifacts/estate-smoke three@0.186.1
//   node scripts/estate/harness.mjs --pack artifacts/estate/v1.2-dev
//     [--three <dir>]          the --prefix folder or a three package folder
//                              (default artifacts/estate-smoke)
//     [--inspect <dir>]        also write one site's F and I decoded to plain
//     [--inspect-site <ID>]    GLB (default BLK_509) plus its per-storey boxes
//     [--json <file>]          the whole report as JSON
//
// Per file: required AND used extensions within EXT_meshopt_compression,
// KHR_mesh_quantization, EXT_mesh_gpu_instancing; no images, textures or
// animations; triangle, vertex, primitive, draw and largest-primitive counts
// against pack.json; the attribute names three produces (GLTFLoader lower-cases
// unknown names, so _META arrives as _meta: u8 × 4, not normalised, one slot
// and storey on all vertices of a triangle, y = w = 0, a palette slot, a storey
// of its site); positions quantised (normalised 16-bit); D's and furniture's
// InstancedMesh with instanceMatrix plus _STOREY (u8 × 4 per instance, x = a
// storey whose band holds the instance's lowest point); no primitive over
// 65,535 vertices; the per-class triangle and draw caps, on three's numbers
// rather than pack.json's. Frames: every building file lies inside its
// pack.json bounds taken to block-local Y-up, (x − at.x, z, −(y − at.y)); T is
// stored relative to its storey floor; site quadrants sit at their world bounds.
//
// Scenarios (§7.11, top tier unless named; K = 606 as §7.4's table): S1 first
// frame · S2 overview, every building at F · S3 street beside BLK_509, D where
// within the F→D distance · S4 inside BLK_509 L5 with its band, T as typical
// instances · S4+D, the active building's D kept · S4-min (min tier, k = 1,
// others massing or F by budget) · S5 hawker hall · S5+D. Each is summed from
// three's counts and held to its tier's triangle and draw caps; §7.11's own
// estimates are printed beside it for comparison only.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { REPO_ROOT, findPackJson, loadBudgets, loadPalette, packFiles } from './check.mjs';
import { BAND_PAD } from './lib/pure/storeys.mjs';

// ---- arguments ---------------------------------------------------------------------

const USAGE = 'usage: harness.mjs --pack <dir> [--three <dir>] [--inspect <dir> [--inspect-site <ID>]] [--json <file>]';
const args = { pack: null, three: join(REPO_ROOT, 'artifacts', 'estate-smoke'), inspect: null, inspectSite: 'BLK_509', json: null };
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  const value = () => {
    const v = process.argv[++i];
    if (v === undefined) { console.error(`${flag} needs a value\n${USAGE}`); process.exit(2); }
    return v;
  };
  if (flag === '--pack') args.pack = resolve(value());
  else if (flag === '--three') args.three = resolve(value());
  else if (flag === '--inspect') args.inspect = resolve(value());
  else if (flag === '--inspect-site') args.inspectSite = value();
  else if (flag === '--json') args.json = resolve(value());
  else { console.error(`unknown argument ${flag}\n${USAGE}`); process.exit(2); }
}
if (!args.pack) { console.error(USAGE); process.exit(2); }
const rel = (p) => relative(REPO_ROOT, p).split(sep).join('/');
const underPublic = (p) => { const r = relative(join(REPO_ROOT, 'public'), p); return r === '' || (!r.startsWith('..') && !r.includes(':')); };
for (const out of [args.inspect, args.json]) {
  if (out && underPublic(out)) { console.error(`refusing to write under public/: ${out}`); process.exit(2); }
}

// ---- three, at the runtime's pin -------------------------------------------------------

const rootPkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
// P4b pins three exactly in the root package.json; until then, the plan's pin.
const THREE_PIN = String(rootPkg.dependencies?.three ?? rootPkg.devDependencies?.three ?? '0.186.1');
const threeDir = [args.three, join(args.three, 'node_modules', 'three')].find((d) => {
  try { return JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).name === 'three'; } catch { return false; }
});
if (!threeDir) {
  console.error(`no three package at ${args.three}; install it with: npm i --prefix artifacts/estate-smoke three@${THREE_PIN}`);
  process.exit(2);
}
const threeVersion = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8')).version;
const threeUrl = (p) => pathToFileURL(join(threeDir, ...p.split('/'))).href;
const THREE = await import(threeUrl('build/three.module.js'));
const { GLTFLoader } = await import(threeUrl('examples/jsm/loaders/GLTFLoader.js'));
const { MeshoptDecoder } = await import(threeUrl('examples/jsm/libs/meshopt_decoder.module.js'));
await MeshoptDecoder.ready;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const parseGlb = (bytes) => new Promise((ok, fail) => {
  loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', ok, fail);
});
const glbJson = (raw) => JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString('utf8'));

// ---- constants -----------------------------------------------------------------------------

const ALLOWED_EXTENSIONS = new Set(['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_mesh_gpu_instancing']);
const T_STOREY = 255; // lib/building.mjs: T's storey byte; T is placed per storey at runtime
const K = 606; // §7.4: buffer height / (2 tan(vfov / 2)); the plan's distance table is worked at 606
const EYE = 1.6; // lib/estate/storeys.ts EYE_HEIGHT
const TOL = 0.06; // m: pack.json bounds are rounded to 0.1 m and positions quantised to under 1 cm
const GRID = { tris: 2, draws: 1 }; // §7.2 groundGrid: one quad
const PLAN_7_11 = { S1: [37000, 24], S2: [549000, 38], S3: [677000, 87], S4: [716000, 46], 'S4-min': [300000, 60], S5: [690000, 70] };

// ---- the pack --------------------------------------------------------------------------------

const packPath = findPackJson(args.pack);
const packBytes = readFileSync(packPath);
const pack = JSON.parse(packBytes.toString('utf8'));
const packGzBytes = gzipSync(packBytes, { level: 9 }).length;
const budgets = loadBudgets();
const palette = loadPalette();
const tier = Object.fromEntries(budgets.tiers.map((t) => [t.id, t]));
const slotsKnown = new Set([...pack.palette.map((p) => p.slot), ...palette.extras.map((e) => e.slot)]);
const siteById = new Map(pack.sites.map((s) => [s.id, s]));
const refByPath = new Map(packFiles(pack).map((f) => [f.ref.path, f.ref]));
const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);
const notes = [];

console.log(`three ${threeVersion} (r${THREE.REVISION}) from ${rel(threeDir)}`);
console.log(`pack ${rel(packPath)}${pack.source?.dev ? '  [DEV PACK: provenance gates were skipped]' : ''}`);
if (threeVersion !== THREE_PIN) fail('three', `${threeVersion} is not the runtime pin ${THREE_PIN}; this run proves nothing about ${THREE_PIN}`);

// ---- frames ------------------------------------------------------------------------------------

const V = THREE.Vector3;
/** pack.json bounds (estate frame, Z up) as a block-local Y-up box: (x − at.x, z, −(y − at.y)). */
const localBox = (s) => {
  const [[x0, y0, z0], [x1, y1, z1]] = s.bounds;
  const [ax, ay] = s.at;
  return new THREE.Box3(new V(x0 - ax, z0, -(y1 - ay)), new V(x1 - ax, z1, -(y0 - ay)));
};
/** An estate-frame box as a three-world box: (x, z, −y). */
const worldBox = ([[x0, y0, z0], [x1, y1, z1]]) => new THREE.Box3(new V(x0, z0, -y1), new V(x1, z1, -y0));
const fmtBox = (b) => `[${b.min.toArray().map((n) => n.toFixed(2)).join(', ')}] … [${b.max.toArray().map((n) => n.toFixed(2)).join(', ')}]`;
/** How far `inner` reaches outside `outer`, m (0 when inside). */
const overshoot = (inner, outer) => Math.max(0, ...['x', 'y', 'z'].flatMap((a) => [outer.min[a] - inner.min[a], inner.max[a] - outer.max[a]]));
const within = (where, inner, outer) => {
  if (inner.isEmpty()) return;
  const over = overshoot(inner, outer);
  if (over > TOL) fail(where, `lies ${over.toFixed(3)} m outside its pack.json bounds: ${fmtBox(inner)} vs ${fmtBox(outer)}`);
};
/** Storey s owns [FFL_s − 0.25, FFL_{s+1} − 0.25) (the pack's band rule), within `tol`. */
const inBand = (ffls, s, z, tol = 0.02) =>
  (s === 0 || z >= ffls[s] - BAND_PAD - tol) && (s === ffls.length - 1 || z < ffls[s + 1] - BAND_PAD + tol);
/** -1 below storey s's band, +1 above it, 0 inside. */
const bandSide = (ffls, s, z, tol = 0.02) =>
  (s > 0 && z < ffls[s] - BAND_PAD - tol ? -1 : s < ffls.length - 1 && z >= ffls[s + 1] - BAND_PAD + tol ? 1 : 0);

// ---- one primitive as three built it --------------------------------------------------------------

const v = new V();
const instanceMatrix = new THREE.Matrix4();
const nodeName = (o) => o.userData?.name ?? o.parent?.userData?.name ?? o.name;

/**
 * Counts, the _META checks and boxes for one Mesh, InstancedMesh or
 * LineSegments. A plain primitive is measured in its file's frame (matrixWorld
 * applied); an InstancedMesh's triangles in its geometry frame and its
 * instances through matrixWorld × instanceMatrix. With `ffls`, each triangle's
 * lowest point is compared with the band of its own _meta storey: the band rule
 * only tags what the exact chunk match left, so a triangle outside its band is
 * counted (above: how far it reaches past the next FFL), not failed.
 */
const measure = (o, ffls, bandStorey = null) => {
  const g = o.geometry;
  const pos = g.attributes.position;
  const meta = g.attributes._meta;
  const per = o.isLineSegments ? 2 : 3;
  const n = (g.index ? g.index.count : pos.count) / per;
  const out = {
    node: nodeName(o), lines: Boolean(o.isLineSegments), instanced: Boolean(o.isInstancedMesh),
    count: o.isInstancedMesh ? o.count : 1, n, verts: pos.count, box: new THREE.Box3(),
    storeys: new Map(), split: 0, metaYW: 0, bandOff: 0, above: 0, below: 0, reach: -Infinity, slots: new Set(), instances: [],
  };
  const banded = ffls && !out.instanced && !out.lines;
  for (let t = 0; t < n; t += 1) {
    let lo = Infinity; let hi = -Infinity; let slot = -1; let storey = -1; let split = false;
    for (let c = 0; c < per; c += 1) {
      const vi = g.index ? g.index.getX(t * per + c) : t * per + c;
      v.fromBufferAttribute(pos, vi);
      if (!out.instanced) v.applyMatrix4(o.matrixWorld);
      out.box.expandByPoint(v);
      lo = Math.min(lo, v.y); hi = Math.max(hi, v.y);
      if (!meta) continue;
      const x = meta.getX(vi); const z = meta.getZ(vi);
      if (meta.getY(vi) !== 0 || meta.getW(vi) !== 0) out.metaYW += 1;
      if (c === 0) { slot = x; storey = z; } else if (x !== slot || z !== storey) split = true;
    }
    if (split) out.split += 1;
    out.slots.add(slot);
    let row = out.storeys.get(storey);
    if (!row) out.storeys.set(storey, (row = { n: 0, lo: Infinity, hi: -Infinity, bandOff: 0 }));
    row.n += 1; row.lo = Math.min(row.lo, lo); row.hi = Math.max(row.hi, hi);
    const b = bandStorey ?? storey;
    const side = banded && b < ffls.length ? bandSide(ffls, b, lo) : 0;
    if (side) {
      row.bandOff += 1; out.bandOff += 1;
      if (side > 0) { out.above += 1; out.reach = Math.max(out.reach, hi - ffls[b + 1]); } else out.below += 1;
    }
  }
  if (out.instanced) {
    const geometryBox = out.box.clone();
    out.box.makeEmpty();
    const st = g.attributes._STOREY;
    for (let i = 0; i < o.count; i += 1) {
      o.getMatrixAt(i, instanceMatrix);
      instanceMatrix.premultiply(o.matrixWorld);
      const b = geometryBox.clone().applyMatrix4(instanceMatrix);
      out.box.union(b);
      const centre = b.getCenter(new V());
      out.instances.push({
        lo: b.min.y, hi: b.max.y, centre: [centre.x, centre.y, centre.z],
        storey: st ? st.getX(i) : null, rest: st ? st.getY(i) + st.getZ(i) + st.getW(i) : 0,
      });
    }
  }
  return out;
};

/** Bytes three would upload for one file's geometry: every distinct array once. */
const gpuBytes = (objects) => {
  const seen = new Set(); let bytes = 0;
  const add = (a) => { if (a && !seen.has(a)) { seen.add(a); bytes += a.byteLength; } };
  for (const o of objects) {
    const g = o.geometry;
    add(g.index?.array);
    for (const attr of Object.values(g.attributes)) add(attr.isInterleavedBufferAttribute ? attr.data.array : attr.array);
    if (o.isInstancedMesh) add(o.instanceMatrix.array);
  }
  return bytes;
};

const sum = (xs, f = (x) => x) => xs.reduce((a, x) => a + f(x), 0);
const unionBox = (ms) => ms.reduce((b, m) => b.union(m.box), new THREE.Box3());

// ---- every GLB ----------------------------------------------------------------------------------

const measured = { massing: new Map(), f: new Map(), d: new Map(), i: new Map(), site: null };
const classRows = new Map();
const fileRows = [];
let files = 0;

for (const { ref, geo, site: siteId } of packFiles(pack)) {
  if (!ref.path.endsWith('.glb.gz')) continue;
  files += 1;
  const where = ref.path;
  const s = siteId ? siteById.get(siteId) : null;
  const ffls = s ? s.storeys.map((x) => x.ffl) : null;
  const typicals = s ? s.storeys.filter((x) => x.geom === 'typical') : [];
  const typicalHeight = Math.min(...typicals.slice(1).map((x, j) => x.ffl - typicals[j].ffl));
  const raw = gunzipSync(readFileSync(join(args.pack, ...ref.path.split('/'))));
  const json = glbJson(raw);
  for (const ext of json.extensionsRequired ?? []) if (!ALLOWED_EXTENSIONS.has(ext)) fail(where, `requires ${ext}`);
  for (const ext of json.extensionsUsed ?? []) if (!ALLOWED_EXTENSIONS.has(ext)) fail(where, `uses ${ext}`);
  for (const key of ['images', 'textures', 'samplers', 'animations', 'skins', 'cameras']) {
    if (json[key]?.length) fail(where, `carries ${json[key].length} ${key}`);
  }
  let gltf;
  try { gltf = await parseGlb(raw); } catch (e) { fail(where, `GLTFLoader failed: ${e?.message ?? e}`); continue; }
  gltf.scene.updateMatrixWorld(true);
  const objects = [];
  gltf.scene.traverse((o) => { if (o.isMesh || o.isLineSegments) objects.push(o); });

  const ms = [];
  for (const o of objects) {
    const g = o.geometry;
    const label = `${where} ${nodeName(o)}`;
    const names = Object.keys(g.attributes).sort();
    const instanceStoreys = o.isInstancedMesh && (geo === 'd' || (geo === 'i' && /^(furniture|proxy)_/.test(nodeName(o))));
    const want = instanceStoreys ? ['_STOREY', '_meta', 'position'] : ['_meta', 'position'];
    if (names.join() !== want.join()) fail(label, `attributes ${names.join(', ')}, expected ${want.join(', ')}`);
    const meta = g.attributes._meta;
    if (meta && !(meta.itemSize === 4 && meta.array instanceof Uint8Array && !meta.normalized)) {
      fail(label, `_meta is ${meta.array.constructor.name} × ${meta.itemSize}${meta.normalized ? ' normalised' : ''}, expected Uint8Array × 4, not normalised`);
    }
    const pos = g.attributes.position;
    if (!(pos.normalized && (pos.array instanceof Int16Array || pos.array instanceof Uint16Array))) {
      fail(label, `position is ${pos.array.constructor.name}${pos.normalized ? ' normalised' : ''}, expected quantised 16-bit`);
    }
    if (o.isInstancedMesh) {
      const im = o.instanceMatrix;
      if (!(im?.isInstancedBufferAttribute && im.itemSize === 16 && im.count >= o.count)) fail(label, 'instanceMatrix is missing or short');
      const st = g.attributes._STOREY;
      if (st && !(st.isInstancedBufferAttribute && st.itemSize === 4 && st.array instanceof Uint8Array && !st.normalized && st.count === o.count)) {
        fail(label, `_STOREY is not a u8 × 4 instance attribute of ${o.count}`);
      }
    } else if (geo === 'd') fail(label, 'a D primitive that is not an InstancedMesh');
    if (pos.count > budgets.maxPrimVerts) fail(label, `${pos.count} vertices > ${budgets.maxPrimVerts}`);
    const isT = geo === 'i' && nodeName(o) === 'typical';
    // T is banded as storey 0 of [0, typical storey height]: what it would put past the next floor.
    const m = isT ? measure(o, [0, typicalHeight], 0) : measure(o, geo === 'f' || geo === 'i' ? ffls : null);
    if (m.split) fail(label, `${m.split} triangles whose vertices disagree on _meta slot or storey`);
    if (m.metaYW) fail(label, `${m.metaYW} vertices with _meta y or w ≠ 0`);
    const unknownSlots = [...m.slots].filter((x) => !slotsKnown.has(x));
    if (unknownSlots.length) fail(label, `_meta slots ${unknownSlots.join(', ')} are not in the palette`);
    if (isT) {
      const other = [...m.storeys.keys()].filter((x) => x !== T_STOREY);
      if (other.length) fail(label, `T carries _meta storeys ${other.join(', ')}; T's storey byte is ${T_STOREY}`);
    } else if (s && !m.instanced) {
      const top = Math.max(...m.storeys.keys());
      if (top >= s.storeys.length) fail(label, `_meta storey ${top} but ${s.id} has ${s.storeys.length} storeys`);
    }
    if (s && m.instanced && m.instances.some((x) => x.storey !== null)) {
      const bad = m.instances.filter((x) => x.storey >= s.storeys.length || x.rest !== 0);
      if (bad.length) fail(label, `${bad.length} instances with a _STOREY outside ${s.id}'s ${s.storeys.length} storeys or y/z/w ≠ 0`);
      const off = m.instances.filter((x) => x.storey < s.storeys.length && !inBand(ffls, x.storey, x.lo));
      if (off.length) {
        const x = off[0];
        fail(label, `${off.length}/${m.instances.length} instances whose _STOREY band does not hold their lowest point (first: storey ${x.storey}, y ${x.lo.toFixed(2)})`);
      }
    }
    ms.push(m);
  }

  // Counts against pack.json.
  const meshes = ms.filter((m) => !m.lines);
  const lines = ms.filter((m) => m.lines);
  const tris = sum(meshes, (m) => m.n);
  const drawn = sum(meshes, (m) => m.n * m.count);
  const verts = sum(ms, (m) => m.verts);
  const maxPrimVerts = Math.max(0, ...ms.map((m) => m.verts));
  const expectTris = geo === 'd' ? drawn : tris; // D's tris count every instance drawn (runbook)
  if (expectTris !== ref.tris) fail(where, `three counts ${expectTris} triangles, pack.json ${ref.tris}`);
  if (verts !== ref.verts) fail(where, `three counts ${verts} vertices, pack.json ${ref.verts}`);
  if (ms.length !== ref.prims) fail(where, `three counts ${ms.length} primitives, pack.json ${ref.prims}`);
  if (ms.length !== ref.draws) fail(where, `three makes ${ms.length} draw objects, pack.json says ${ref.draws} draws`);
  if (maxPrimVerts !== ref.maxPrimVerts) fail(where, `largest primitive ${maxPrimVerts} vertices, pack.json ${ref.maxPrimVerts}`);
  const drawCap = budgets.drawsPerFile[geo];
  if (drawCap !== undefined && ms.length > drawCap) fail(where, `${ms.length} draws > ${drawCap}`);

  const t = budgets.triangles;
  if (geo === 'massing') {
    for (const m of ms) {
      const site = siteById.get(m.node);
      if (!site) { fail(where, `mesh ${m.node} names no site`); continue; }
      if (m.n > t.massingPerBuilding) fail(`${where} ${m.node}`, `${m.n} triangles > ${t.massingPerBuilding}`);
      if (site.massing && m.n !== site.massing.tris) fail(`${where} ${m.node}`, `${m.n} triangles, pack.json ${site.massing.tris}`);
      within(`${where} ${m.node}`, m.box, localBox(site));
      measured.massing.set(site.id, { tris: m.n });
    }
  } else if (geo === 'f') {
    if (tris > t.facadePerBuilding) fail(where, `${tris} triangles > ${t.facadePerBuilding}`);
    const edges = sum(lines, (m) => m.n);
    if (edges !== s.facade.edges) fail(where, `${edges} edge lines, pack.json ${s.facade.edges}`);
    within(where, unionBox(ms), localBox(s));
    measured.f.set(s.id, { tris, meshDraws: meshes.length, lineDraws: lines.length, path: ref.path, ms });
  } else if (geo === 'd') {
    for (const m of ms) if (m.n > t.repeatedMesh) fail(`${where} ${m.node}`, `${m.n} triangles per instance > ${t.repeatedMesh}`);
    const instances = sum(ms, (m) => m.count);
    if (instances !== s.detail.instances) fail(where, `${instances} instances, pack.json ${s.detail.instances}`);
    within(where, unionBox(ms), localBox(s));
    measured.d.set(s.id, { drawn, draws: ms.length, instances, path: ref.path, ms });
  } else if (geo === 'i') {
    const I = s.interior;
    const part = (m) => (m.node === 'typical' ? 'T' : m.node === 'residual' ? 'R'
      : /^special_/.test(m.node) ? 'special' : /^furniture_/.test(m.node) ? 'furniture' : /^proxy_/.test(m.node) ? 'proxy' : null);
    for (const m of ms) if (!part(m)) fail(where, `unexpected node ${m.node}`);
    const T = ms.filter((m) => part(m) === 'T');
    const R = ms.filter((m) => part(m) === 'R');
    const typical = s.storeys.filter((x) => x.geom === 'typical');
    const tTris = sum(T, (m) => m.n);
    if (tTris !== I.typicalTris) fail(where, `T ${tTris} triangles, pack.json ${I.typicalTris}`);
    if (tTris > t.typicalPerBuilding) fail(where, `T ${tTris} > ${t.typicalPerBuilding}`);
    if (T.length && typical.length) {
      // T is stored once, relative to its storey's floor; the runtime places it at (0, FFL_s, 0).
      // Its lowest point is the slab under that floor: inside [−0.25, 0] m, not at L2's FFL.
      const tb = unionBox(T);
      if (tb.min.y < -BAND_PAD - TOL || tb.min.y > TOL) fail(where, `T's lowest point is ${tb.min.y.toFixed(3)} m: not relative to its floor (expected −${BAND_PAD} … 0)`);
      for (const at of [typical[0], typical[typical.length - 1]]) {
        within(`${where} T placed at ${at.tag}`, tb.clone().translate(new V(0, at.ffl, 0)), localBox(s));
      }
    } else if (typical.length) fail(where, `${typical.length} typical storeys but no T`);
    const rTris = sum(R, (m) => m.n);
    if (rTris !== I.residualTris) fail(where, `R ${rTris} triangles, pack.json ${I.residualTris}`);
    if (rTris > t.residualPerBuilding) fail(where, `R ${rTris} > ${t.residualPerBuilding}`);
    for (const m of R) for (const st of m.storeys.keys()) {
      if (s.storeys[st]?.geom !== 'typical') fail(where, `R carries storey ${st} (${s.storeys[st]?.tag}), not a typical storey`);
    }
    const specials = new Map();
    for (const m of ms.filter((x) => part(x) === 'special')) {
      const tag = m.node.slice('special_'.length);
      const row = specials.get(tag) ?? { tris: 0, draws: 0, ms: [] };
      row.tris += m.n; row.draws += 1; row.ms.push(m); specials.set(tag, row);
    }
    for (const sp of I.specials) {
      const got = specials.get(sp.tag)?.tris ?? 0;
      if (got !== sp.tris) fail(where, `special ${sp.tag}: ${got} triangles, pack.json ${sp.tris}`);
      if (got > t.specialStorey) fail(where, `special ${sp.tag}: ${got} > ${t.specialStorey}`);
    }
    for (const tag of specials.keys()) if (!I.specials.some((sp) => sp.tag === tag)) fail(where, `special_${tag} is not in pack.json`);
    const furniture = [];
    for (const kit of I.furniture ?? []) {
      const full = ms.find((m) => m.node === `furniture_${kit.kit}`);
      const proxy = ms.find((m) => m.node === `proxy_${kit.kit}`);
      if (!full || !proxy) { fail(where, `furniture ${kit.kit}: ${full ? '' : 'full '}${proxy ? '' : 'proxy '}mesh missing`); continue; }
      if (full.n !== kit.tris || proxy.n !== kit.proxyTris) fail(where, `furniture ${kit.kit}: ${full.n}/${proxy.n} triangles, pack.json ${kit.tris}/${kit.proxyTris}`);
      if (full.count !== kit.instances || proxy.count !== kit.instances) fail(where, `furniture ${kit.kit}: ${full.count}/${proxy.count} instances, pack.json ${kit.instances}`);
      if (full.n > t.repeatedMesh) fail(where, `furniture ${kit.kit}: ${full.n} > ${t.repeatedMesh}`);
      furniture.push({ kit: kit.kit, tris: full.n, proxyTris: proxy.n, instances: full.instances });
    }
    within(where, unionBox(ms.filter((m) => part(m) !== 'T')), localBox(s));
    measured.i.set(s.id, { T: { tris: tTris, draws: T.length, box: unionBox(T) }, R: { tris: rTris, draws: R.length, ms: R }, specials, furniture, path: ref.path, ms });
  } else if (geo === 'site') {
    const quadrants = ms.filter((m) => /^quadrant_/.test(m.node));
    for (const q of pack.site.quadrants) {
      const m = quadrants.find((x) => x.node === q.mesh);
      if (!m) { fail(where, `quadrant ${q.mesh} missing`); continue; }
      if (m.n !== q.tris) fail(`${where} ${q.mesh}`, `${m.n} triangles, pack.json ${q.tris}`);
      within(`${where} ${q.mesh}`, m.box, worldBox(q.bounds));
    }
    const trees = [];
    const [ex0, ey0, ex1, ey1] = pack.estate.extent;
    const extent = worldBox([[ex0, ey0, -1e9], [ex1, ey1, 1e9]]);
    for (const sp of pack.site.trees) {
      const full = ms.find((m) => m.node === `tree_${sp.species}`);
      const crown = ms.find((m) => m.node === `crown_${sp.species}`);
      if (!full || !crown) { fail(where, `trees ${sp.species}: mesh missing`); continue; }
      if (full.n !== sp.tris || crown.n !== sp.crownTris) fail(where, `trees ${sp.species}: ${full.n}/${crown.n} triangles, pack.json ${sp.tris}/${sp.crownTris}`);
      if (full.count !== sp.instances || crown.count !== sp.instances) fail(where, `trees ${sp.species}: ${full.count}/${crown.count} instances, pack.json ${sp.instances}`);
      if (full.n > t.repeatedMesh) fail(where, `trees ${sp.species}: ${full.n} > ${t.repeatedMesh}`);
      const outside = full.instances.filter((x) => !extent.containsPoint(new V(...x.centre)));
      if (outside.length) fail(where, `trees ${sp.species}: ${outside.length} instances outside the estate extent`);
      // three world (x, y, z) → estate (x, −z, y); the instance's lowest point is its base.
      trees.push({ species: sp.species, tris: full.n, crownTris: crown.n, at: full.instances.map((x) => [x.centre[0], -x.centre[2], x.lo]) });
    }
    measured.site = { quadrantTris: sum(quadrants, (m) => m.n), quadrantDraws: quadrants.length, trees };
  }

  const gpu = gpuBytes(objects);
  const row = classRows.get(geo) ?? { files: 0, bytes: 0, raw: 0, tris: 0, drawn: 0, verts: 0, maxBytes: 0, maxTris: 0, maxDraws: 0, maxPrimVerts: 0, gpu: 0 };
  row.files += 1; row.bytes += ref.bytes; row.raw += ref.rawBytes; row.tris += tris; row.drawn += drawn; row.verts += verts;
  row.maxBytes = Math.max(row.maxBytes, ref.bytes); row.maxTris = Math.max(row.maxTris, tris); row.maxDraws = Math.max(row.maxDraws, ms.length);
  row.maxPrimVerts = Math.max(row.maxPrimVerts, maxPrimVerts); row.gpu += gpu;
  classRows.set(geo, row);
  fileRows.push({
    path: where, geo, site: siteId ?? null, bytes: ref.bytes, rawBytes: ref.rawBytes, tris, drawn, verts, prims: ms.length, maxPrimVerts, gpu,
    band: ['T', 'other'].map((which) => {
      const sel = ms.filter((m) => (m.node === 'typical' && geo === 'i') === (which === 'T'));
      return { which, above: sum(sel, (m) => m.above), below: sum(sel, (m) => m.below), reach: Math.max(-Infinity, ...sel.map((m) => m.reach)) };
    }),
    required: json.extensionsRequired ?? [], used: json.extensionsUsed ?? [],
  });
}

const instancingNotRequired = fileRows.filter((r) => r.used.includes('EXT_mesh_gpu_instancing') && !r.required.includes('EXT_mesh_gpu_instancing'));
// A kit's dequantisation scale is in its instance SCALE, so the extension is
// required: a loader without it would draw each kit once, at the origin, in
// normalised units. The pack marks it required (gltf.mjs instanceAll).
for (const r of instancingNotRequired) fail(r.path, 'uses EXT_mesh_gpu_instancing without listing it in extensionsRequired');
// Triangles outside the band of their own storey are exact chunk matches the
// band rule would have put a storey higher (or lower): counted, not failed.
for (const [label, geo, which] of [['F', 'f', 'other'], ['I residual + specials', 'i', 'other'], ['I T (placed at a typical FFL)', 'i', 'T']]) {
  const rows = fileRows.filter((r) => r.geo === geo).map((r) => ({ r, b: r.band.find((x) => x.which === which) }));
  const above = sum(rows, (x) => x.b.above); const below = sum(rows, (x) => x.b.below);
  if (!above && !below) continue;
  const reach = Math.max(...rows.map((x) => x.b.reach));
  const worst = rows.reduce((a, x) => (x.b.above + x.b.below > a.b.above + a.b.below ? x : a));
  notes.push(`${label}: ${above} triangles start above their storey's band (≥ next FFL − ${BAND_PAD} m), reaching up to ${reach.toFixed(2)} m past the next FFL; ${below} start below it; most in ${worst.r.path} (${worst.b.above + worst.b.below} of ${worst.r.tris})`);
}

// ---- scenarios -------------------------------------------------------------------------------------

const boxDistance = (p, s) => {
  const [[x0, y0, z0], [x1, y1, z1]] = s.bounds;
  return Math.hypot(Math.max(x0 - p[0], 0, p[0] - x1), Math.max(y0 - p[1], 0, p[1] - y1), Math.max(z0 - p[2], 0, p[2] - z1));
};
const facadeError = (s) => s.facade?.error ?? 0.06;
const fdDistance = (s, row) => (facadeError(s) * K) / row.tauPx; // §7.4 F→D
const firstFrameBytes = packGzBytes + sum(pack.stage0 ?? [], (p) => refByPath.get(p)?.bytes ?? 0);
const site = measured.site;
const treeCount = sum(site?.trees ?? [], (sp) => sp.at.length);

/** Trees for a pose: full meshes within `radius`, crowns beyond (§7.2); no pose = all crowns. */
const treePart = (pose, radius, label) => {
  let tris = 0; let draws = 0; let near = 0;
  for (const sp of site?.trees ?? []) {
    const n = pose ? sp.at.filter((a) => Math.hypot(a[0] - pose[0], a[1] - pose[1], a[2] - pose[2]) <= radius).length : 0;
    const far = sp.at.length - n;
    tris += n * sp.tris + far * sp.crownTris; draws += (n > 0 ? 1 : 0) + (far > 0 ? 1 : 0); near += n;
  }
  return { what: `trees ${label}: ${near} full within ${radius} m, ${treeCount - near} crowns`, tris, draws };
};
const quadrantPart = () => ({ what: `site quadrants ×${site.quadrantDraws}`, tris: site.quadrantTris, draws: site.quadrantDraws });
const gridPart = () => ({ what: 'ground grid', ...GRID });
const facades = (sites, row, label = 'F') => {
  const list = sites.filter((s) => measured.f.has(s.id));
  return {
    what: `${label} ×${list.length}${row.edges ? ' + edges' : ''}`,
    tris: sum(list, (s) => measured.f.get(s.id).tris),
    draws: sum(list, (s) => measured.f.get(s.id).meshDraws + (row.edges ? measured.f.get(s.id).lineDraws : 0)),
    files: list.map((s) => measured.f.get(s.id).path),
  };
};
const detailNear = (pose, row, exclude = null) => {
  const list = pack.sites.filter((s) => s.id !== exclude && measured.d.has(s.id) && boxDistance(pose, s) < fdDistance(s, row));
  return {
    what: `D ${list.map((s) => s.id).join(', ') || 'none'}${exclude ? ` besides ${exclude}` : ''} (F→D within ${fdDistance(pack.sites[0], row).toFixed(1)} m)`,
    tris: sum(list, (s) => measured.d.get(s.id).drawn), draws: sum(list, (s) => measured.d.get(s.id).draws),
    files: list.map((s) => measured.d.get(s.id).path),
  };
};
const bandFor = (s, index, k) => [Math.max(0, index - k), Math.min(s.storeys.length - 1, index + k)];
const bandText = (s, band) => `band ${s.storeys[band[0]].tag}–${s.storeys[band[1]].tag}`;
/** The active building's interior for a band (§7.2, §7.5): T as instances, R whole (band-masked), specials and furniture in band. */
const interiorParts = (s, pose, band, row) => {
  const I = measured.i.get(s.id);
  const parts = [];
  const typicalIn = s.storeys.filter((x, i) => x.geom === 'typical' && i >= band[0] && i <= band[1]).length;
  if (typicalIn) parts.push({ what: `T ×${typicalIn} storeys (instanced)`, tris: I.T.tris * typicalIn, draws: I.T.draws });
  if (I.R.tris) parts.push({ what: 'R (merged, band-masked)', tris: I.R.tris, draws: I.R.draws });
  const sp = [...I.specials].filter(([tag]) => { const i = s.storeys.findIndex((x) => x.tag === tag); return i >= band[0] && i <= band[1]; });
  if (sp.length) parts.push({ what: `specials ${sp.map(([tag]) => tag).join(', ')}`, tris: sum(sp, ([, x]) => x.tris), draws: sum(sp, ([, x]) => x.draws) });
  const [ax, ay] = s.at;
  for (const kit of I.furniture) {
    const live = kit.instances.filter((x) => x.storey === null || (x.storey >= band[0] && x.storey <= band[1]));
    // instance centre, block-local Y-up → estate (x + at.x, −z + at.y, y)
    const near = live.filter((x) => Math.hypot(x.centre[0] + ax - pose[0], -x.centre[2] + ay - pose[1], x.centre[1] - pose[2]) <= row.furnitureRadiusM).length;
    const far = live.length - near;
    parts.push({ what: `furniture ${kit.kit}: ${near} full within ${row.furnitureRadiusM} m, ${far} proxies`, tris: near * kit.tris + far * kit.proxyTris, draws: (near > 0 ? 1 : 0) + (far > 0 ? 1 : 0) });
  }
  return { parts, files: [I.path, s.nav?.path, s.walk?.path].filter(Boolean) };
};

const scenarios = [];
const scenario = (id, tierId, pose, parts, extraFiles) => {
  const row = tier[tierId];
  const tris = sum(parts, (p) => p.tris);
  const draws = sum(parts, (p) => p.draws);
  const bytes = firstFrameBytes + sum([...new Set(extraFiles)], (p) => refByPath.get(p)?.bytes ?? 0);
  const plan = PLAN_7_11[id.replace('+D', '')] ?? null;
  if (tris > row.maxTris) fail(`scenario ${id}`, `${tris} triangles > ${tierId} cap ${row.maxTris}`);
  if (draws > row.maxDraws) fail(`scenario ${id}`, `${draws} draws > ${tierId} cap ${row.maxDraws}`);
  scenarios.push({ id, tier: tierId, pose, parts: parts.map(({ files: _, ...p }) => p), tris, draws, bytes, cap: { tris: row.maxTris, draws: row.maxDraws }, plan });
};

const complete = site && measured.massing.size === pack.sites.length && measured.f.size === pack.sites.length;
if (!complete) notes.push('scenarios skipped: the pack lacks s0 or some F files');
const high = tier.high;
const min = tier.min;
if (complete) {
  const allF = facades(pack.sites, high);
  scenario('S1', 'high', 'overview', [
    { what: `massing ×${measured.massing.size}`, tris: sum([...measured.massing.values()], (m) => m.tris), draws: measured.massing.size },
    quadrantPart(), treePart(null, 0, 'overview'), gridPart(),
  ], []);
  scenario('S2', 'high', 'overview', [allF, quadrantPart(), treePart(null, 0, 'overview'), gridPart()], allF.files);

  const b509 = siteById.get('BLK_509');
  if (b509) {
    // S3: the BLK_509 entrance spawn nearest its root, at eye height.
    const toRoot = (sp) => Math.hypot(sp.pos[0] - b509.at[0], sp.pos[1] - b509.at[1]);
    const spawn = [...b509.spawns].sort((a, b) => toRoot(a) - toRoot(b))[0];
    const p3 = [spawn.pos[0], spawn.pos[1], spawn.pos[2] + EYE];
    const d3 = detailNear(p3, high);
    scenario('S3', 'high', `${b509.id} "${spawn.name}" (${p3.map((x) => x.toFixed(1)).join(', ')})`,
      [allF, d3, quadrantPart(), treePart(p3, high.treeRadiusM, 'near'), gridPart()], [...allF.files, ...d3.files]);

    // S4: L5 at the lift landing nearest the block's root, eye height; band k = high.bandK.
    const l5 = b509.storeys.findIndex((x) => x.tag === 'L5');
    if (l5 >= 0 && measured.i.has(b509.id)) {
      let xy = [0, 0];
      if (b509.nav) {
        const navBytes = readFileSync(join(args.pack, ...b509.nav.path.split('/')));
        const nav = JSON.parse((b509.nav.path.endsWith('.gz') ? gunzipSync(navBytes) : navBytes).toString('utf8'));
        const landings = (nav.lifts ?? []).map((l) => l.landings?.L5?.xy).filter(Boolean);
        if (landings.length) xy = landings.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0];
      }
      const p4 = [b509.at[0] + xy[0], b509.at[1] + xy[1], b509.storeys[l5].ffl + EYE];
      const poseText = `${b509.id} L5 lift landing (${p4.map((x) => x.toFixed(1)).join(', ')})`;
      const band = bandFor(b509, l5, high.bandK);
      const inside = interiorParts(b509, p4, band, high);
      const others = detailNear(p4, high, b509.id);
      const base = [allF, others, ...inside.parts, quadrantPart(), treePart(p4, high.treeRadiusM, 'near'), gridPart()];
      const baseFiles = [...allF.files, ...others.files, ...inside.files];
      scenario('S4', 'high', `${poseText}, ${bandText(b509, band)}`, base, baseFiles);
      const own = measured.d.get(b509.id);
      if (own) {
        scenario('S4+D', 'high', `${poseText}, ${bandText(b509, band)}, own D kept (band-masked)`,
          [...base, { what: `D ${b509.id} (active, band-masked)`, tris: own.drawn, draws: own.draws }], [...baseFiles, own.path]);
      }

      // S4-min: the min tier, k = min.bandK, no edges, crowns only; the active
      // building held at F; the others start at massing and step up to F by
      // error removed per triangle added, within the caps (§7.4 steps 1–3).
      const bandMin = bandFor(b509, l5, min.bandK);
      const insideMin = interiorParts(b509, p4, bandMin, min);
      const activeF = facades([b509], min, `F ${b509.id} (held)`);
      const reserved = [activeF, ...insideMin.parts, quadrantPart(), treePart(p4, min.treeRadiusM, 'min'), gridPart()];
      const othersMin = pack.sites.filter((s) => s.id !== b509.id);
      let tris = sum(reserved, (p) => p.tris) + sum(othersMin, (s) => measured.massing.get(s.id).tris);
      let draws = sum(reserved, (p) => p.draws) + othersMin.length;
      const candidates = othersMin
        .map((s) => {
          const d = Math.max(boxDistance(p4, s), 1);
          const em = s.massing?.error ?? 0;
          const add = measured.f.get(s.id).tris - measured.massing.get(s.id).tris;
          return { s, wanted: (em * K) / d > min.tauPx, gain: ((em - facadeError(s)) * K) / d / add, add, addDraws: measured.f.get(s.id).meshDraws - 1 };
        })
        .filter((c) => c.wanted)
        .sort((a, b) => b.gain - a.gain);
      const upgraded = [];
      for (const c of candidates) {
        if (tris + c.add <= min.maxTris && draws + c.addDraws <= min.maxDraws) { tris += c.add; draws += c.addDraws; upgraded.push(c.s); }
      }
      const atMassing = othersMin.filter((s) => !upgraded.includes(s));
      scenario('S4-min', 'min', `${poseText}, ${bandText(b509, bandMin)}`, [
        ...reserved,
        { what: `others at F by budget: ${upgraded.map((s) => s.id).join(', ') || 'none'} (${candidates.length} wanted)`, tris: sum(upgraded, (s) => measured.f.get(s.id).tris), draws: sum(upgraded, (s) => measured.f.get(s.id).meshDraws) },
        { what: `others at massing ×${atMassing.length}`, tris: sum(atMassing, (s) => measured.massing.get(s.id).tris), draws: atMassing.length },
      ], [...activeF.files, ...insideMin.files, ...upgraded.map((s) => measured.f.get(s.id).path)]);
    }
  }

  const nc = siteById.get('NC_514');
  if (nc && measured.i.has(nc.id)) {
    // S5: the hawker hall at its root, eye height on L1; band k = high.bandK.
    const p5 = [nc.at[0], nc.at[1], nc.storeys[0].ffl + EYE];
    const band = bandFor(nc, 0, high.bandK);
    const poseText = `${nc.id} hall, root at eye height (${p5.map((x) => x.toFixed(1)).join(', ')}), ${bandText(nc, band)}`;
    const others = detailNear(p5, high, nc.id);
    const inside = interiorParts(nc, p5, band, high);
    const base = [allF, others, ...inside.parts, quadrantPart(), treePart(p5, high.treeRadiusM, 'near'), gridPart()];
    const baseFiles = [...allF.files, ...others.files, ...inside.files];
    scenario('S5', 'high', poseText, base, baseFiles);
    const own = measured.d.get(nc.id);
    if (own) scenario('S5+D', 'high', `${poseText}, own D kept`, [...base, { what: `D ${nc.id} (active)`, tris: own.drawn, draws: own.draws }], [...baseFiles, own.path]);
  }
}
if (firstFrameBytes > budgets.pack.firstFrame.bytes) fail('first frame', `${firstFrameBytes} B > ${budgets.pack.firstFrame.bytes}`);

// ---- per-storey frames for one site, and the optional plain-GLB export ---------------------------

const storeyTable = (s) => {
  const F = measured.f.get(s.id); const D = measured.d.get(s.id); const I = measured.i.get(s.id);
  const rows = s.storeys.map((st, i) => {
    const fRow = F ? F.ms.filter((m) => !m.lines).map((m) => m.storeys.get(i)).filter(Boolean) : [];
    const fy = fRow.length ? [Math.min(...fRow.map((r) => r.lo)), Math.max(...fRow.map((r) => r.hi))] : null;
    const dInst = D ? D.ms.flatMap((m) => m.instances.filter((x) => x.storey === i)) : [];
    const dy = dInst.length ? [Math.min(...dInst.map((x) => x.lo)), Math.max(...dInst.map((x) => x.hi))] : null;
    let iy = null; let iWhat = '';
    if (I && st.geom === 'typical') {
      const rRow = I.R.ms.map((m) => m.storeys.get(i)).filter(Boolean);
      iy = [st.ffl + I.T.box.min.y, st.ffl + I.T.box.max.y];
      if (rRow.length) iy = [Math.min(iy[0], ...rRow.map((r) => r.lo)), Math.max(iy[1], ...rRow.map((r) => r.hi))];
      iWhat = `T at FFL${rRow.length ? ` + R ${sum(rRow, (r) => r.n)}` : ''}`;
    } else if (I?.specials.has(st.tag)) {
      const b = unionBox(I.specials.get(st.tag).ms);
      iy = [b.min.y, b.max.y]; iWhat = `special ${I.specials.get(st.tag).tris}`;
    }
    return {
      tag: st.tag, ffl: st.ffl, next: s.storeys[i + 1]?.ffl ?? null, geom: st.geom,
      fTris: sum(fRow, (r) => r.n), fBandOff: sum(fRow, (r) => r.bandOff), fy, dInstances: dInst.length, dy, iWhat, iy,
    };
  });
  return {
    site: s.id, at: s.at, boundsLocal: localBox(s), f: F ? unionBox(F.ms) : null, d: D ? unionBox(D.ms) : null,
    i: I ? unionBox(I.ms.filter((m) => m.node !== 'typical')) : null, t: I?.T.box ?? null, rows,
  };
};
const boxJson = (key, x) => (x?.isBox3 ? [x.min.toArray(), x.max.toArray()] : x);

let inspect = null;
const inspectSite = siteById.get(args.inspectSite);
if (inspectSite && measured.f.has(inspectSite.id)) inspect = storeyTable(inspectSite);
else if (args.inspect) fail('inspect', `${args.inspectSite} has no F in this pack`);

if (args.inspect && inspect) {
  // Decoded back to plain GLB with the pack tool's own gltf-transform (scripts/estate's
  // pinned dependencies): meshopt decoded, POSITION dequantised to float, _META left u8.
  const { getIO, validateGlb } = await import('./lib/gltf.mjs');
  const { dequantize } = await import('@gltf-transform/functions');
  const io = await getIO();
  mkdirSync(args.inspect, { recursive: true });
  inspect.exports = [];
  for (const [label, ref] of [['F', inspectSite.facade], ['I', inspectSite.interior]]) {
    if (!ref) continue;
    const raw = gunzipSync(readFileSync(join(args.pack, ...ref.path.split('/'))));
    const doc = await io.readBinary(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
    await doc.transform(dequantize({ pattern: /^POSITION$/ }));
    for (const ext of doc.getRoot().listExtensionsUsed()) {
      if (ext.extensionName === 'EXT_meshopt_compression' || ext.extensionName === 'KHR_mesh_quantization') ext.dispose();
    }
    const plain = Buffer.from(await io.writeBinary(doc));
    const out = join(args.inspect, `${inspectSite.id}_${label}.glb`);
    writeFileSync(out, plain);
    // Read it back with three: the same triangles and box, nothing compressed or quantised left.
    const used = [...(glbJson(plain).extensionsUsed ?? [])];
    const back = await parseGlb(plain);
    back.scene.updateMatrixWorld(true);
    let tris = 0; const box = new THREE.Box3();
    back.scene.traverse((o) => {
      if (!o.isMesh) return;
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      box.union(new THREE.Box3().setFromObject(o));
    });
    const src = label === 'F' ? measured.f.get(inspectSite.id).ms.filter((m) => !m.lines) : measured.i.get(inspectSite.id).ms;
    const srcBox = unionBox(src);
    const srcTris = sum(src, (m) => m.n);
    const drift = Math.max(...['x', 'y', 'z'].flatMap((a) => [Math.abs(box.min[a] - srcBox.min[a]), Math.abs(box.max[a] - srcBox.max[a])]));
    if (tris !== srcTris) fail(rel(out), `plain GLB has ${tris} triangles, the pack file ${srcTris}`);
    if (used.length) fail(rel(out), `plain GLB still uses ${used.join(', ')}`);
    if (drift > 1e-3) fail(rel(out), `plain GLB's box drifts ${drift.toFixed(4)} m from three's decode of the pack file`);
    const valid = await validateGlb(plain);
    if (valid.errors) fail(rel(out), `gltf-validator: ${valid.errors} errors: ${valid.messages.slice(0, 3).join('; ')}`);
    inspect.exports.push({ file: rel(out), bytes: plain.length, tris, box, extensionsUsed: used, drift, validator: { errors: valid.errors, warnings: valid.warnings } });
  }
  writeFileSync(join(args.inspect, `${inspectSite.id}_storeys.json`), `${JSON.stringify(inspect, boxJson, 1)}\n`);
}

// ---- report ------------------------------------------------------------------------------------------

const kb = (n) => `${(n / 1000).toFixed(1)} KB`;
const thousands = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : String(n));
const pad = (x, w, left = false) => (left ? String(x).padEnd(w) : String(x).padStart(w));
const num = (n) => n.toLocaleString('en');
const capsFor = {
  massing: `${budgets.triangles.massingPerBuilding} tris/bldg, ${budgets.drawsPerFile.massing} draws`,
  site: `${budgets.drawsPerFile.site} draws`,
  f: `${kb(budgets.classes.f.total)} / ${kb(budgets.classes.f.perFile)} per file, ${num(budgets.triangles.facadePerBuilding)} tris, ${budgets.drawsPerFile.f} draws`,
  d: `${kb(budgets.classes.d.total)} / ${kb(budgets.classes.d.perFile)} per file, ${budgets.triangles.repeatedMesh} tris/mesh, ${budgets.drawsPerFile.d} draws`,
  i: `${kb(budgets.classes.i.total)} / ${kb(budgets.classes.i.perFile)} per file, ${budgets.drawsPerFile.i} draws`,
};

console.log(`\n${files} GLB files parsed by GLTFLoader + MeshoptDecoder (every primitive checked for ≤ ${num(budgets.maxPrimVerts)} vertices)`);
console.log(`${pad('class', 8, true)}${pad('files', 6)}${pad('bytes', 11)}${pad('max file', 10)}${pad('stored tris', 13)}${pad('drawn tris', 12)}${pad('max tris', 10)}${pad('max draws', 10)}${pad('max verts', 10)}${pad('GPU geom', 10)}   caps`);
for (const geo of ['massing', 'site', 'f', 'd', 'i']) {
  const r = classRows.get(geo);
  if (!r) continue;
  console.log(`${pad(geo, 8, true)}${pad(r.files, 6)}${pad(kb(r.bytes), 11)}${pad(kb(r.maxBytes), 10)}${pad(num(r.tris), 13)}${pad(num(r.drawn), 12)}${pad(num(r.maxTris), 10)}${pad(r.maxDraws, 10)}${pad(r.maxPrimVerts, 10)}${pad(`${(r.gpu / 1e6).toFixed(2)} MB`, 10)}   ${capsFor[geo]}`);
}

console.log(`\nScenarios (§7.11; K = ${K}; bytes = pack.json gz ${kb(packGzBytes)} + stage0 + the files in use, no engine chunk)`);
console.log(`${pad('id', 8, true)}${pad('tier', 6, true)}${pad('triangles', 11)}${pad('draws', 7)}${pad('tier cap', 13)}${pad('§7.11 est.', 13)}${pad('bytes', 11)}  pose`);
for (const sc of scenarios) {
  const plan = sc.plan ? `${thousands(sc.plan[0])} / ${sc.plan[1]}` : '—';
  console.log(`${pad(sc.id, 8, true)}${pad(sc.tier, 6, true)}${pad(num(sc.tris), 11)}${pad(sc.draws, 7)}${pad(`${thousands(sc.cap.tris)} / ${sc.cap.draws}`, 13)}${pad(plan, 13)}${pad(kb(sc.bytes), 11)}  ${sc.pose}`);
  for (const p of sc.parts) console.log(`${' '.repeat(14)}${pad(num(p.tris), 11)}${pad(p.draws, 7)}  ${p.what}`);
}
console.log(`first frame ${kb(firstFrameBytes)} (cap ${kb(budgets.pack.firstFrame.bytes)})`);

if (inspect) {
  const lb = inspect.boundsLocal;
  console.log(`\nFrames, ${inspect.site}: block-local, Y up; the runtime puts its root at (at.x, 0, −at.y) = (${inspect.at[0]}, 0, ${-inspect.at[1]})`);
  console.log(`  pack.json bounds, local  ${fmtBox(lb)}`);
  if (inspect.f) console.log(`  F as three decodes it    ${fmtBox(inspect.f)}  outside by ${overshoot(inspect.f, lb).toFixed(3)} m`);
  if (inspect.d) console.log(`  D instances              ${fmtBox(inspect.d)}  outside by ${overshoot(inspect.d, lb).toFixed(3)} m`);
  if (inspect.i) console.log(`  I: R + specials          ${fmtBox(inspect.i)}  outside by ${overshoot(inspect.i, lb).toFixed(3)} m`);
  if (inspect.t) console.log(`  I: T, floor-relative     y ${inspect.t.min.y.toFixed(3)} … ${inspect.t.max.y.toFixed(3)}`);
  const yr = (r) => (r ? `${r[0].toFixed(2)} … ${r[1].toFixed(2)}` : '—');
  console.log(`  ${pad('storey', 7, true)}${pad('FFL', 7)}${pad('next', 7)}${pad('F tris', 8)}${pad('F y', 16)}${pad('off band', 9)}${pad('D inst', 8)}${pad('D y', 16)}   I y`);
  for (const r of inspect.rows) {
    console.log(`  ${pad(r.tag, 7, true)}${pad(r.ffl.toFixed(2), 7)}${pad(r.next === null ? '—' : r.next.toFixed(2), 7)}${pad(r.fTris, 8)}${pad(yr(r.fy), 16)}${pad(r.fBandOff, 9)}${pad(r.dInstances, 8)}${pad(yr(r.dy), 16)}   ${yr(r.iy)}  ${r.iWhat}`);
  }
  for (const e of inspect.exports ?? []) {
    console.log(`  wrote ${e.file}: ${num(e.bytes)} B, ${num(e.tris)} triangles, extensionsUsed [${e.extensionsUsed.join(', ')}], gltf-validator ${e.validator.errors} errors / ${e.validator.warnings} warnings, box ${fmtBox(e.box)} (drift ${e.drift.toExponential(1)} m)`);
  }
}

for (const n of notes) console.log(`note: ${n}`);
if (args.json) {
  const replacer = (key, x) => (x?.isBox3 ? [x.min.toArray(), x.max.toArray()] : x instanceof Map ? Object.fromEntries(x) : x);
  writeFileSync(args.json, `${JSON.stringify({ three: threeVersion, pack: rel(packPath), files: fileRows, classes: classRows, scenarios, inspect, notes, problems }, replacer, 1)}\n`);
}
console.log(problems.length ? `\n${problems.length} problems:` : `\nall counts, attributes, frames, caps and scenarios hold (${files} files, ${scenarios.length} scenarios)`);
for (const p of problems) console.error(`  FAIL: ${p}`);
process.exitCode = problems.length ? 1 : 0;
