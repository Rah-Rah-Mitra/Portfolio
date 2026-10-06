import {
  InstancedBufferAttribute, InstancedMesh, Matrix4,
  type BufferAttribute, type BufferGeometry, type LineSegments, type Material, type Mesh, type Object3D,
} from 'three';
import type { GroundGrid } from '../../../../lib/estate/ground';
import type { EstateStoreyTag } from '../../../../lib/estate/ids';
import type { EstateNav } from '../../../../lib/estate/nav';
import type { GpuRole } from '../../../../lib/estate/scheduler';
import type { PackStorey } from '../../../../lib/estate/schema';
import { BAND_CAPACITY } from '../../../../lib/estate/storeys';
import type { WalkFile } from '../../../../lib/estate/walk';

// What a decoded pack GLB holds, as the engine draws it: one Part per geometry
// (the scheduler's upload unit, plan §7.6 "≤ 1 geometry per frame"), with its
// GPU bytes and eviction role. The node structure is the pack's
// (docs/portfolio/estate-pack.md "What the files hold"):
//  - s0/massing: one Mesh per site id, block-local, the node TRS carrying the
//    quantisation (one part each, role massing);
//  - s0/site: quadrant_<qx>_<qy> Meshes (estate frame), tree_<species> and
//    crown_<species> InstancedMeshes (role site, but full trees are role trees:
//    the one thing eviction may take from stage 0, falling back to crowns);
//  - f/<ID>: the `facade` node (its TRS is the dequantisation) holding the
//    triangle Mesh(es) and one LineSegments of edges (role f);
//  - d/<ID>: one InstancedMesh per kit at the root, _STOREY per instance (role d);
//  - i/<ID> (P5, interiorParts): `typical` (T, relative to its storey floor:
//    the engine makes its own InstancedMeshes of it, opaque and glass, one
//    instance per typical storey in the band), `residual` (R, storey-tagged
//    per vertex), `special_<tag>` (one per special storey) and
//    `furniture_<kit>` / `proxy_<kit>` InstancedMeshes (_STOREY per instance),
//    all role i;
//  - w/, nav/ and site/ground (P5) are data the CPU reads (walk grids, rooms
//    and lifts, outdoor heights): no parts, nothing uploads.
// Parts are ordered so the scheduler uploads what matters first: within the
// site file, ground and crowns before full trees; within an interior, T, R
// and the specials before furniture, proxies before full furniture.

export type DrawObject = Mesh | InstancedMesh | LineSegments;

export interface Part {
  object: DrawObject;
  role: GpuRole;
  /** GPU bytes: vertex attributes, index and instance buffers (§7.7). */
  bytes: number;
  /** Set when the geometry is on the GPU (uploaded through the scheduler's ticket). */
  uploaded: boolean;
}

export interface MassingNode { node: Object3D; parts: Part[] }
export interface MassingParts { kind: 'massing'; parts: Part[]; bySite: Map<string, MassingNode> }
export interface SiteSpecies { name: string; full: Part | null; crown: Part | null }
export interface SiteParts { kind: 'site'; parts: Part[]; quadrants: Part[]; species: SiteSpecies[] }
export interface FacadeParts { kind: 'facade'; parts: Part[]; node: Object3D; meshes: Part[]; edges: Part[] }
export interface DetailParts { kind: 'detail'; parts: Part[] }

/**
 * T as the engine draws it: one InstancedMesh per primitive of the pack's
 * `typical` node (opaque, then glass), each holding up to BAND_CAPACITY
 * instances. Instance i sits at T(0, FFL_i, 0) · base (the node's TRS, which
 * carries KHR_mesh_quantization's dequantisation, times the primitive's own
 * matrix); the meshes' own matrices are identity. Each carries an `_STOREY`
 * instance attribute (u8 × 4, x = the storey index) the engine writes with the
 * instance, so the interior's uBand reads the real storey rather than WebGL's
 * default for a missing attribute (L1).
 */
export interface InteriorTypical {
  meshes: Part[];
  base: Matrix4[];
  /** Triangles each instance of meshes[k] draws. */
  tris: number[];
}

export interface InteriorNode {
  node: Object3D;
  parts: Part[];
  /** Triangles drawn when shown (all its primitives). */
  tris: number;
}

export interface InteriorSpecial extends InteriorNode {
  /** Storey index (ids.ts / the pack's storeys) and its tag. */
  storey: number;
  tag: EstateStoreyTag;
}

/**
 * One furniture kit: the full mesh near the camera, the 12-triangle box beyond
 * (§8.5, the tier's furniture radius). `matrices` and `storeys` are the CPU
 * copies of every instance (16 floats; u8 × 4 with the storey in x), and
 * `centres` their block-local glTF (x, z): each partition gathers the chosen
 * instances to the front of each mesh's buffers and sets its count.
 */
export interface InteriorFurniture {
  kit: string;
  full: Part | null;
  proxy: Part | null;
  count: number;
  matrices: Float32Array;
  storeys: Uint8Array;
  centres: Float32Array;
  fullTris: number;
  proxyTris: number;
}

export interface InteriorParts {
  kind: 'interior';
  parts: Part[];
  typical: InteriorTypical | null;
  residual: InteriorNode | null;
  /** Bottom-up by storey. */
  specials: InteriorSpecial[];
  furniture: InteriorFurniture[];
}

/** A walk grid (SN5W), decoded with its site: layer i is storey i. CPU only. */
export interface WalkData { kind: 'walk'; parts: Part[]; walk: WalkFile }
/** A nav file, parsed with its site. CPU only. */
export interface NavData { kind: 'nav'; parts: Part[]; nav: EstateNav }
/** The outdoor ground heights (SN5G). CPU only. */
export interface GroundData { kind: 'ground'; parts: Part[]; ground: GroundGrid }

export type DecodedParts = MassingParts | SiteParts | FacadeParts | DetailParts | InteriorParts | WalkData | NavData | GroundData;

const isDrawable = (o: Object3D): o is DrawObject =>
  (o as Mesh).isMesh === true || (o as LineSegments).isLineSegments === true;

/** Bytes a geometry (and an InstancedMesh's instance buffers) takes on the GPU. Shared arrays count once. */
export const gpuBytes = (object: { geometry: BufferGeometry; isInstancedMesh?: boolean; instanceMatrix?: { array: ArrayLike<number> & { byteLength: number } }; instanceColor?: { array: { byteLength: number } } | null }): number => {
  const seen = new Set<unknown>();
  let bytes = 0;
  const add = (array: { byteLength: number } | undefined | null) => {
    if (!array || seen.has(array)) return;
    seen.add(array);
    bytes += array.byteLength;
  };
  const geometry = object.geometry;
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.attributes[name] as unknown as { array?: { byteLength: number }; data?: { array: { byteLength: number } } };
    add(attribute.data ? attribute.data.array : attribute.array);
  }
  if (geometry.index) add(geometry.index.array as unknown as { byteLength: number });
  if (object.isInstancedMesh) {
    add(object.instanceMatrix?.array);
    add(object.instanceColor?.array);
  }
  return bytes;
};

const part = (object: DrawObject, role: GpuRole): Part => ({ object, role, bytes: gpuBytes(object), uploaded: false });

/** Every drawable directly under `root` or in its subtree, in document order. */
const drawables = (root: Object3D): DrawObject[] => {
  const out: DrawObject[] = [];
  root.traverse((o) => { if (isDrawable(o)) out.push(o); });
  return out;
};

export const massingParts = (root: Object3D): MassingParts => {
  // One node per site id, directly under the scene root: the Mesh itself when
  // the site's massing is one primitive, else a Group named by the id. The node
  // keeps its TRS (the quantisation), so it is the node that moves.
  const bySite = new Map<string, MassingNode>();
  const parts: Part[] = [];
  for (const node of [...root.children]) {
    const nodeParts = drawables(node).map((object) => part(object, 'massing'));
    if (nodeParts.length === 0) continue;
    parts.push(...nodeParts);
    if (!bySite.has(node.name)) bySite.set(node.name, { node, parts: nodeParts });
  }
  return { kind: 'massing', parts, bySite };
};

export const siteParts = (root: Object3D): SiteParts => {
  const quadrants: Part[] = [];
  const speciesByName = new Map<string, SiteSpecies>();
  const lookup = (name: string) => {
    let s = speciesByName.get(name);
    if (!s) { s = { name, full: null, crown: null }; speciesByName.set(name, s); }
    return s;
  };
  const crowns: Part[] = [];
  const full: Part[] = [];
  for (const object of drawables(root)) {
    const name = object.name;
    if (name.startsWith('tree_') && (object as InstancedMesh).isInstancedMesh) {
      const p = part(object, 'trees');
      lookup(name.slice('tree_'.length)).full = p;
      full.push(p);
    } else if (name.startsWith('crown_') && (object as InstancedMesh).isInstancedMesh) {
      const p = part(object, 'site');
      lookup(name.slice('crown_'.length)).crown = p;
      crowns.push(p);
    } else {
      quadrants.push(part(object, 'site'));
    }
  }
  return { kind: 'site', parts: [...quadrants, ...crowns, ...full], quadrants, species: [...speciesByName.values()] };
};

export const facadeParts = (root: Object3D): FacadeParts => {
  const node = root.getObjectByName('facade') ?? root;
  const meshes: Part[] = [];
  const edges: Part[] = [];
  for (const object of drawables(node)) {
    if ((object as LineSegments).isLineSegments) edges.push(part(object, 'f'));
    else meshes.push(part(object, 'f'));
  }
  return { kind: 'facade', parts: [...meshes, ...edges], node, meshes, edges };
};

export const detailParts = (root: Object3D): DetailParts => ({
  kind: 'detail',
  parts: drawables(root).map((object) => part(object, 'd')),
});

// ---- interiors (P5) -----------------------------------------------------------------

const trianglesIn = (object: Mesh | InstancedMesh): number => {
  const g = object.geometry;
  return Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3);
};

/** Glass primitives come out of the loader with the pack's `glass` material; everything else is opaque. */
export const isGlass = (object: { material: Material | Material[] }): boolean => {
  const m = object.material;
  return !Array.isArray(m) && m.name === 'glass';
};

const meshesUnder = (node: Object3D): Mesh[] => {
  const out: Mesh[] = [];
  node.traverse((o) => { if ((o as Mesh).isMesh && !(o as InstancedMesh).isInstancedMesh) out.push(o as Mesh); });
  return out;
};

export const STOREY_ATTRIBUTE = '_STOREY';

/** T's InstancedMeshes, built from the pack's `typical` node (a Mesh, or a Group of one Mesh per primitive). */
const typicalOf = (node: Object3D, capacity: number): InteriorTypical => {
  node.updateMatrix();
  const meshes: Part[] = [];
  const base: Matrix4[] = [];
  const tris: number[] = [];
  const sources = meshesUnder(node);
  // Opaque first: it is drawn first anyway, and uploads first.
  sources.sort((a, b) => Number(isGlass(a)) - Number(isGlass(b)));
  for (const mesh of sources) {
    // The primitive's matrix relative to the node (identity under a Group), then the node's own TRS.
    const matrix = new Matrix4();
    for (let o: Object3D | null = mesh; o !== null && o !== node; o = o.parent) {
      o.updateMatrix();
      matrix.premultiply(o.matrix);
    }
    matrix.premultiply(node.matrix);
    const geometry = mesh.geometry;
    geometry.setAttribute(STOREY_ATTRIBUTE, new InstancedBufferAttribute(new Uint8Array(4 * capacity), 4));
    const instanced = new InstancedMesh(geometry, mesh.material, capacity);
    instanced.name = `typical_${isGlass(mesh) ? 'glass' : 'opaque'}`;
    instanced.count = 0;
    meshes.push(part(instanced, 'i'));
    base.push(matrix);
    tris.push(trianglesIn(mesh));
  }
  return { meshes, base, tris };
};

const nodePart = (node: Object3D): InteriorNode => {
  const parts = meshesUnder(node).map((m) => part(m, 'i'));
  let tris = 0;
  for (const p of parts) tris += trianglesIn(p.object as Mesh);
  return { node, parts, tris };
};

const furnitureSource = (mesh: InstancedMesh): { matrices: Float32Array; storeys: Uint8Array } => {
  const attribute = mesh.geometry.getAttribute(STOREY_ATTRIBUTE) as BufferAttribute | undefined;
  const storeys = new Uint8Array(4 * mesh.count);
  if (attribute) {
    const array = attribute.array as ArrayLike<number>;
    for (let i = 0; i < 4 * mesh.count; i += 1) storeys[i] = array[i];
  }
  return { matrices: new Float32Array((mesh.instanceMatrix.array as Float32Array).subarray(0, 16 * mesh.count)), storeys };
};

/**
 * An interior file's parts. `storeys` are its building's (pack.json, bottom-up),
 * so a `special_<tag>` node becomes that storey's index; a tag the building
 * does not have throws. `capacity` is T's instance capacity (the largest band).
 */
export const interiorParts = (root: Object3D, storeys: readonly Pick<PackStorey, 'tag'>[], capacity = BAND_CAPACITY): InteriorParts => {
  let typical: InteriorTypical | null = null;
  let residual: InteriorNode | null = null;
  const specials: InteriorSpecial[] = [];
  const kits = new Map<string, { full: InstancedMesh | null; proxy: InstancedMesh | null }>();
  for (const node of [...root.children]) {
    const name = node.name;
    if (name === 'typical') typical = typicalOf(node, capacity);
    else if (name === 'residual') residual = nodePart(node);
    else if (name.startsWith('special_')) {
      const tag = name.slice('special_'.length) as EstateStoreyTag;
      const storey = storeys.findIndex((s) => s.tag === tag);
      if (storey < 0) throw new Error(`interior: ${name} names a storey the building does not have`);
      specials.push({ ...nodePart(node), storey, tag });
    } else if ((node as InstancedMesh).isInstancedMesh && (name.startsWith('furniture_') || name.startsWith('proxy_'))) {
      const full = name.startsWith('furniture_');
      const kit = name.slice(full ? 'furniture_'.length : 'proxy_'.length);
      const entry = kits.get(kit) ?? { full: null, proxy: null };
      if (full) entry.full = node as InstancedMesh; else entry.proxy = node as InstancedMesh;
      kits.set(kit, entry);
    }
  }
  specials.sort((a, b) => a.storey - b.storey);
  const furniture: InteriorFurniture[] = [];
  for (const [kit, { full, proxy }] of kits) {
    const sourceMesh = full ?? proxy;
    if (!sourceMesh) continue;
    const { matrices, storeys: storeyBytes } = furnitureSource(sourceMesh);
    const count = sourceMesh.count;
    const centres = new Float32Array(2 * count);
    for (let i = 0; i < count; i += 1) { centres[2 * i] = matrices[16 * i + 12]; centres[2 * i + 1] = matrices[16 * i + 14]; }
    furniture.push({
      kit,
      full: full ? part(full, 'i') : null,
      proxy: proxy ? part(proxy, 'i') : null,
      count,
      matrices,
      storeys: storeyBytes,
      centres,
      fullTris: full ? trianglesIn(full) : 0,
      proxyTris: proxy ? trianglesIn(proxy) : 0,
    });
    // Nothing drawn until a partition says which instances go where.
    for (const mesh of [full, proxy]) if (mesh) mesh.count = 0;
  }
  const parts: Part[] = [
    ...(typical?.meshes ?? []),
    ...(residual?.parts ?? []),
    ...specials.flatMap((s) => s.parts),
    ...furniture.flatMap((f) => (f.proxy ? [f.proxy] : [])),
    ...furniture.flatMap((f) => (f.full ? [f.full] : [])),
  ];
  return { kind: 'interior', parts, typical, residual, specials, furniture };
};
