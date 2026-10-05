// glTF reading, flattening, building and encoding for the pack (plan §6.2
// steps 1, 2, 7, 8, 9). The only module that talks to gltf-transform,
// meshoptimizer and gltf-validator.

import { Document, Logger, NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshGPUInstancing } from '@gltf-transform/extensions';
import { instance, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import validator from 'gltf-validator';
import { det3, transformPoint } from './pure/geom.mjs';
import { Soup } from './pure/soup.mjs';
import { slotOf } from './palette.mjs';

export const MAX_PRIM_VERTS = 65535;

// gltf-transform logs every prune and instance batch at INFO; keep warnings.
const QUIET = new Logger(Logger.Verbosity.WARN);

let ioPromise = null;
/** One NodeIO with every extension and the meshopt codec registered (step 1). */
export const getIO = () => {
  ioPromise ??= (async () => {
    await MeshoptEncoder.ready;
    await MeshoptDecoder.ready;
    return new NodeIO()
      .setLogger(QUIET)
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  })();
  return ioPromise;
};

export const readGlb = async (bytes) => (await getIO()).readBinary(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));

/**
 * Step 2: a node's class by name. Leaves first (a leaf is also named DOOR_…).
 * 'static' is everything else that carries a mesh.
 */
export const classify = (name) => {
  if (/_leaf(_[LR]|_\d+)?$/.test(name)) return 'leaf';
  if (name.startsWith('DOOR_')) return 'door';
  if (name.startsWith('WIN_')) return 'win';
  if (name.startsWith('FURN_')) return 'furn';
  if (name.startsWith('TREE_')) return 'tree';
  if (name.startsWith('LIFT_')) return 'lift';
  if (name.startsWith('L1WIN_')) return 'l1win';
  if (name.startsWith('L1DOOR_')) return 'l1door';
  return 'static';
};

/** Every node with a mesh at or under `node`, depth-first. */
export const meshNodesUnder = (node, out = []) => {
  if (node.getMesh()) out.push(node);
  for (const child of node.listChildren()) meshNodesUnder(child, out);
  return out;
};

/** Every node with a mesh, in a stable depth-first order. */
export const meshNodes = (doc) => {
  const out = [];
  for (const scene of doc.getRoot().listScenes()) for (const node of scene.listChildren()) meshNodesUnder(node, out);
  return out;
};

const positions = (accessor) => {
  const n = accessor.getCount();
  const arr = accessor.getArray();
  if (arr instanceof Float32Array && !accessor.getNormalized() && accessor.getElementSize() === 3) return arr;
  const out = new Float32Array(n * 3); const el = [0, 0, 0];
  for (let i = 0; i < n; i += 1) { accessor.getElement(i, el); out[i * 3] = el[0]; out[i * 3 + 1] = el[1]; out[i * 3 + 2] = el[2]; }
  return out;
};

/**
 * Bakes one mesh's triangles into `soup` under `matrix` (column-major), with
 * the palette slot of each primitive's material. A mirroring matrix reverses
 * winding so front faces stay front. `skip(materialName)` drops primitives.
 * Returns the number of triangles added.
 */
export const bakeMesh = (mesh, matrix, soup, { context = 'exterior', storey = 0, skip = null, slotFor = null } = {}) => {
  const flip = det3(matrix) < 0;
  let added = 0;
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMode() !== Primitive.Mode.TRIANGLES) throw new Error(`mesh ${mesh.getName()}: primitive mode ${prim.getMode()} is not TRIANGLES`);
    const material = prim.getMaterial()?.getName() ?? '';
    if (skip && skip(material)) continue;
    const slot = slotFor ? slotFor(material) : slotOf(material, context);
    const pos = positions(prim.getAttribute('POSITION'));
    const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const i0 = idx[t] * 3, i1 = idx[t + (flip ? 2 : 1)] * 3, i2 = idx[t + (flip ? 1 : 2)] * 3;
      transformPoint(matrix, pos[i0], pos[i0 + 1], pos[i0 + 2], a);
      transformPoint(matrix, pos[i1], pos[i1 + 1], pos[i1 + 2], b);
      transformPoint(matrix, pos[i2], pos[i2 + 1], pos[i2 + 2], c);
      soup.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], slot, storey);
      added += 1;
    }
  }
  return added;
};

/** Local-frame [min, max] of the primitives of a mesh that pass `keep(materialName)`. */
export const meshBox = (mesh, keep = () => true) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const prim of mesh.listPrimitives()) {
    if (!keep(prim.getMaterial()?.getName() ?? '')) continue;
    const pos = positions(prim.getAttribute('POSITION'));
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k += 1) {
      if (pos[i + k] < lo[k]) lo[k] = pos[i + k];
      if (pos[i + k] > hi[k]) hi[k] = pos[i + k];
    }
  }
  return lo[0] === Infinity ? null : [lo, hi];
};

// ---- building documents ---------------------------------------------------------------

/** A fresh document with one buffer and the pack's three materials. */
export const newDoc = () => {
  const doc = new Document().setLogger(QUIET);
  doc.getRoot().getAsset().generator = 'scripts/estate/pack.mjs';
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  doc.getRoot().setDefaultScene(scene);
  const materials = {
    opaque: doc.createMaterial('opaque').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1),
    glass: doc.createMaterial('glass').setBaseColorFactor([1, 1, 1, 0.35]).setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(1),
    edge: doc.createMaterial('edge').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1),
  };
  return { doc, buffer, scene, materials };
};

/**
 * Indexed primitives from a soup (or a list of line segments), split so none
 * holds more than 65,535 vertices (step 7). A vertex is a position (float32)
 * plus its _META (x = slot, z = storey, y = w = 0); identical ones are shared.
 * `kind`: 'triangles' or 'lines' (soup-like { count, pos (6 per segment), slot, storey }).
 */
export const buildPrimitives = (ctx, soup, material, kind = 'triangles') => {
  const { doc, buffer } = ctx;
  const per = kind === 'lines' ? 2 : 3;
  const prims = [];
  let map = new Map(); let pos = []; let meta = []; let idx = [];
  const flush = () => {
    if (!idx.length) return;
    const verts = pos.length / 3;
    const prim = doc.createPrimitive()
      .setMode(kind === 'lines' ? Primitive.Mode.LINES : Primitive.Mode.TRIANGLES)
      .setMaterial(material)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
      .setAttribute('_META', doc.createAccessor().setType('VEC4').setArray(new Uint8Array(meta)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(verts <= 65535 ? new Uint16Array(idx) : new Uint32Array(idx)).setBuffer(buffer));
    prims.push(prim);
    map = new Map(); pos = []; meta = []; idx = [];
  };
  const p = soup.pos;
  for (let t = 0; t < soup.count; t += 1) {
    const keys = [];
    for (let v = 0; v < per; v += 1) {
      const o = t * per * 3 + v * 3;
      keys.push(`${Math.fround(p[o])},${Math.fround(p[o + 1])},${Math.fround(p[o + 2])},${soup.slot[t]},${soup.storey[t]}`);
    }
    const fresh = new Set(keys.filter((k) => !map.has(k))).size;
    if (map.size + fresh > MAX_PRIM_VERTS) flush();
    for (let v = 0; v < per; v += 1) {
      let i = map.get(keys[v]);
      if (i === undefined) {
        i = pos.length / 3;
        const o = t * per * 3 + v * 3;
        pos.push(p[o], p[o + 1], p[o + 2]);
        meta.push(soup.slot[t], 0, soup.storey[t], 0);
        map.set(keys[v], i);
      }
      idx.push(i);
    }
  }
  flush();
  return prims;
};

/** A mesh from an opaque soup and an optional glass soup (glass last, drawn after). */
export const buildMesh = (ctx, name, opaque, glass = null) => {
  const mesh = ctx.doc.createMesh(name);
  if (opaque && opaque.count) for (const prim of buildPrimitives(ctx, opaque, ctx.materials.opaque)) mesh.addPrimitive(prim);
  if (glass && glass.count) for (const prim of buildPrimitives(ctx, glass, ctx.materials.glass)) mesh.addPrimitive(prim);
  return mesh;
};

/** A soup of one mesh in its own frame (identity), for kits. */
export const meshSoup = (mesh, opts) => {
  const soup = new Soup(256);
  bakeMesh(mesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], soup, opts);
  return soup;
};

/**
 * Makes instanced batches with gltf-transform's instance() (EXT_mesh_gpu_instancing),
 * then names each batch node after its mesh and, when `storeyOf` is given,
 * appends a `_STOREY` instance attribute computed from each instance's
 * translation height. Every node with a mesh in the document at this point is
 * batched (min 1), so call it before adding plain meshes.
 *
 * `_STOREY` is u8 x 4 (x = storey index, y = z = w = 0), not a u8 scalar:
 * gltf-transform 4.5.1 meshopt-encodes a 1-byte instance attribute with a
 * 4-byte stride but writes no bufferView.byteStride, so every reader (three's
 * GLTFLoader included) unpacks it tightly and gets garbage. Four bytes per
 * instance is exactly aligned, the same layout as _META, and storeyRoundTrip()
 * checks the round trip on every file the pack writes.
 */
export const instanceAll = async (ctx, storeyOf = null) => {
  await ctx.doc.transform(instance({ min: 1 }));
  const batches = [];
  for (const node of ctx.doc.getRoot().listNodes()) {
    const batch = node.getExtension('EXT_mesh_gpu_instancing');
    if (!batch) continue;
    node.setName(node.getMesh().getName());
    const translation = batch.getAttribute('TRANSLATION');
    const count = (translation ?? batch.getAttribute('ROTATION') ?? batch.getAttribute('SCALE')).getCount();
    let storeys = null;
    if (storeyOf) {
      storeys = new Uint8Array(count); const el = [0, 0, 0];
      for (let i = 0; i < count; i += 1) { if (translation) translation.getElement(i, el); storeys[i] = storeyOf(el[1]); }
      const packed = new Uint8Array(count * 4);
      for (let i = 0; i < count; i += 1) packed[i * 4] = storeys[i];
      batch.setAttribute('_STOREY', ctx.doc.createAccessor().setType('VEC4').setArray(packed).setBuffer(ctx.buffer));
    }
    batches.push({ node, name: node.getName(), count, storeys });
  }
  return batches;
};

export const INSTANCING = EXTMeshGPUInstancing;

/**
 * Reads every batch's `_STOREY` back out of an encoded GLB, by node name, and
 * compares it with what instanceAll() wrote. Returns the first mismatch or null.
 */
export const storeyRoundTrip = async (glb, batches) => {
  const doc = await readGlb(glb);
  const byName = new Map(doc.getRoot().listNodes().filter((n) => n.getExtension('EXT_mesh_gpu_instancing')).map((n) => [n.getName(), n]));
  for (const b of batches) {
    if (!b.storeys) continue;
    const node = byName.get(b.name);
    const attr = node?.getExtension('EXT_mesh_gpu_instancing').getAttribute('_STOREY');
    if (!attr) return `${b.name}: no _STOREY after encoding`;
    if (attr.getType() !== 'VEC4' || attr.getComponentType() !== 5121) return `${b.name}: _STOREY is ${attr.getType()}/${attr.getComponentType()}, expected VEC4/u8`;
    const el = [0, 0, 0, 0];
    for (let i = 0; i < b.count; i += 1) {
      attr.getElement(i, el);
      if (el[0] !== b.storeys[i] || el[1] || el[2] || el[3]) return `${b.name}: instance ${i} decodes to storey ${el.join(',')}, built ${b.storeys[i]}`;
    }
  }
  return null;
};

/**
 * Step 8: weld → (reorder → quantize, inside meshopt) → meshopt 'high' with
 * EXT_meshopt_compression → prune. Positions are quantised to `bits` (14 for
 * massing, F and site; 16 for D and I); _META is already u8 and is left alone.
 * Returns the GLB bytes.
 */
export const encodeDoc = async (ctx, bits) => {
  const io = await getIO();
  await ctx.doc.transform(
    weld(),
    meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: bits }),
    prune({ keepAttributes: true, keepLeaves: false }),
  );
  return io.writeBinary(ctx.doc);
};

// ---- validation (step 9) ------------------------------------------------------------------

/** gltf-validator over the GLB; returns { errors, warnings, messages[] }. */
export const validateGlb = async (glb) => {
  const report = await validator.validateBytes(new Uint8Array(glb), { maxIssues: 50, writeTimestamp: false });
  const issues = report.issues;
  const messages = issues.messages.filter((m) => m.severity === 0).map((m) => `${m.code} ${m.pointer ?? ''} ${m.message}`);
  return { errors: issues.numErrors, warnings: issues.numWarnings, infos: issues.numInfos, messages, extensions: report.info?.extensionsUsed ?? [] };
};

/**
 * Decodes a GLB again and counts what it holds: triangles and vertices stored,
 * primitives, draws (one per primitive), the largest primitive, instances and
 * drawn triangles (an instanced triangle counts once per instance), and the
 * attribute names on every primitive and batch.
 */
export const countGlb = async (glb) => {
  const doc = await readGlb(glb);
  const out = { tris: 0, lines: 0, verts: 0, prims: 0, draws: 0, maxPrimVerts: 0, instances: 0, drawnTris: 0, attributes: new Set(), instanceAttributes: new Set(), nodes: [] };
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const batch = node.getExtension('EXT_mesh_gpu_instancing');
    const copies = batch ? (batch.getAttribute('TRANSLATION') ?? batch.getAttribute('ROTATION') ?? batch.getAttribute('SCALE')).getCount() : 1;
    if (batch) { out.instances += copies; for (const s of batch.listSemantics()) out.instanceAttributes.add(s); }
    let meshTris = 0;
    for (const prim of mesh.listPrimitives()) {
      const verts = prim.getAttribute('POSITION').getCount();
      const n = prim.getIndices() ? prim.getIndices().getCount() : verts;
      out.prims += 1; out.draws += 1; out.verts += verts;
      out.maxPrimVerts = Math.max(out.maxPrimVerts, verts);
      for (const s of prim.listSemantics()) out.attributes.add(s);
      if (prim.getMode() === Primitive.Mode.TRIANGLES) { out.tris += n / 3; meshTris += n / 3; } else out.lines += n / 2;
    }
    out.drawnTris += meshTris * copies;
    out.nodes.push({ name: node.getName(), mesh: mesh.getName(), copies, tris: meshTris, extras: node.getExtras() });
  }
  out.extensionsUsed = doc.getRoot().listExtensionsUsed().map((e) => e.extensionName).sort();
  out.extensionsRequired = doc.getRoot().listExtensionsRequired().map((e) => e.extensionName).sort();
  return out;
};
