import type { BufferGeometry, InstancedMesh, LineSegments, Mesh, Object3D } from 'three';
import type { GpuRole } from '../../../../lib/estate/scheduler';

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
//  - d/<ID>: one InstancedMesh per kit at the root, _STOREY per instance (role d).
// Parts are ordered so the scheduler uploads what matters first: within the
// site file, ground and crowns before full trees.

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
export type DecodedParts = MassingParts | SiteParts | FacadeParts | DetailParts;

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
