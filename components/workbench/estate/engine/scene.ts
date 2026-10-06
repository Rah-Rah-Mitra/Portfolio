import {
  Frustum, Group, Scene, Sphere, Vector3, type InstancedMesh, type LineSegments, type Material, type Matrix4, type Mesh,
  type Object3D,
} from 'three';
import { ESTATE_STOREY_FFL } from '../../../../lib/estate/ids';
import { LOD_DETAIL, LOD_FACADE, LOD_MASSING } from '../../../../lib/estate/lod';
import type { EstateScheduler, Eviction } from '../../../../lib/estate/scheduler';
import type { EstatePack, PackBuilding } from '../../../../lib/estate/schema';
import { createStoreyUniforms, setMassingLines, setPlanSides, setStoreyMask, type MaterialKit, type StoreyUniforms } from './materials';
import {
  isGlass, type DecodedParts, type DetailParts, type FacadeParts, type InteriorParts, type MassingNode, type Part, type SiteParts,
  type SiteSpecies,
} from './parts';
import { createTreePartition, gatherMatrices, partitionTrees, TREE_REPARTITION_M, type TreePartition } from './trees';

// The scene graph (plan §7.2). Every object has matrixAutoUpdate = false and
// the scene matrixWorldAutoUpdate = false: nothing moves after it is placed, so
// world matrices are computed once, when a file is attached.
//
//   scene ─ groundGrid (1 quad)                                         1 draw
//         ─ site: 4 quadrant Meshes · per species near (full) + far (crown) InstancedMesh
//         └ building ×14: Group at (at.x, 0, −at.y), turned by rot about +Y
//             ├ massing  Mesh                         (stage 0)
//             ├ facade   node (dequant TRS) › Mesh + edges LineSegments
//             ├ detail   InstancedMesh per kit (_STOREY)
//             └ interior Group (P5: shown only while resident and active,
//                 interior.ts): T InstancedMesh ×2 · R · specials · furniture
//
// Culling is the engine's own, by bounding spheres from pack.json (§7.2), so
// three's per-object frustum test is off everywhere (and no geometry ever pays
// for a computed bounding sphere). One material instance per building per class
// carries that building's uniforms; they share programs (materials.ts). A
// material never serves both a Mesh and an InstancedMesh: three keys its
// program on `instancing`, so one shared by both re-resolves its program and
// re-uploads every uniform twice a frame (measured: the site's quadrants and
// trees did). The site gets one of each over one uniforms object; P5's
// interior (T instanced beside R) keeps the same rule. Per-frame loops below
// are indexed, not for…of (§7.8: no allocation per frame).

const LEVEL_NONE = -1;

export interface BuildingNode {
  readonly index: number;
  readonly site: PackBuilding;
  readonly group: Group;
  /** Bounding sphere, three world: the centre of pack bounds, pack radius. */
  readonly sphere: Sphere;
  /** Shared by the building's F, D and edge materials (and P5's interior). */
  readonly storey: StoreyUniforms;
  readonly materials: { massing: Material; facade: Material; detail: Material; edge: Material };
  /** The interior's objects (P5): hidden unless interior.ts says it is resident and active. */
  readonly interior: Group;
  /**
   * The interior's own uniforms: uStoreyMask stays MASK_OFF (the interior is
   * never masked) and uBand is the band, so R's other storeys collapse and T's
   * and furniture's instances read their own storeys.
   */
  readonly interiorUniforms: StoreyUniforms;
  /** Its interior file's objects, once decoded and attached (interior.ts draws them). */
  interiorParts: InteriorParts | null;
  /** The interior's two opaque materials (plain, instanced): Plan turns them two-sided (materials.ts setPlanSides). */
  interiorOpaque: Material[];
  interiorId: string | null;
  massing: MassingNode | null;
  facade: FacadeParts | null;
  detail: DetailParts | null;
  facadeId: string | null;
  detailId: string | null;
  /** The level drawn last frame (lod.ts numbers; −1 nothing). */
  shown: number;
  /** The building passed the frustum test this frame. */
  inView: boolean;
}

interface Species {
  name: string;
  full: Part | null;
  crown: Part | null;
  fullSource: Float32Array | null;
  crownSource: Float32Array | null;
  centres: Float32Array;
  count: number;
  partition: TreePartition;
  fullTris: number;
  crownTris: number;
}

interface Quadrant { part: Part; sphere: Sphere; tris: number; inView: boolean }

const trianglesOf = (object: Mesh | InstancedMesh): number => {
  const g = object.geometry;
  const n = g.index ? g.index.count : g.attributes.position.count;
  return Math.floor(n / 3);
};

const freeze = (object: Object3D) => {
  object.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
    o.frustumCulled = false;
  });
};

// The loader's materials are placeholders (MeshStandardMaterial by name); every
// object draws with the kit's. They were never compiled, so disposing is free.
const replaceMaterial = (object: Mesh | InstancedMesh | LineSegments, material: Material) => {
  const old = object.material;
  if (Array.isArray(old)) old.forEach((m) => m.dispose());
  else if (old !== material) old.dispose();
  object.material = material;
};

/** Shows uploaded parts when `on`, hides the rest. Indexed: called per building per frame. */
const showParts = (parts: readonly Part[], on: boolean) => {
  for (let i = 0; i < parts.length; i += 1) parts[i].object.visible = on && parts[i].uploaded;
};

/** The building's storey floors above L1, block-local Z: the massing storey lines. */

const massingFloors = (site: PackBuilding): number[] => ESTATE_STOREY_FFL[site.id].slice(1);

export class EstateScene {
  readonly root = new Scene();
  readonly buildings: BuildingNode[];
  readonly quadrants: Quadrant[] = [];
  readonly species: Species[] = [];
  readonly siteGroup = new Group();
  private readonly kit: MaterialKit;
  private readonly frustum = new Frustum();
  private readonly treeCamera = new Vector3(Number.NaN, 0, Number.NaN);
  private treeRadius = -1;
  private siteFiles: string[] = [];

  constructor(pack: EstatePack, kit: MaterialKit) {
    this.kit = kit;
    const root = this.root;
    root.matrixWorldAutoUpdate = false;
    root.matrixAutoUpdate = false;
    root.background = kit.palette.scene.background.clone();
    root.fog = kit.fog;
    root.add(kit.gridMesh, kit.hemisphere, kit.sun, this.siteGroup);
    this.siteGroup.name = 'site';
    this.buildings = pack.sites.map((site, index) => {
      const group = new Group();
      group.name = site.id;
      group.position.set(site.at[0], 0, -site.at[1]);
      group.rotation.y = 0;
      group.updateMatrix();
      group.matrixAutoUpdate = false;
      root.add(group);
      const [lo, hi] = site.bounds;
      const sphere = new Sphere(
        new Vector3((lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2, -(lo[1] + hi[1]) / 2),
        site.radius,
      );
      const storey = createStoreyUniforms();
      const massingStorey = createStoreyUniforms();
      const interiorUniforms = createStoreyUniforms();
      const interior = new Group();
      interior.name = 'interior';
      interior.visible = false;
      interior.matrixAutoUpdate = false;
      group.add(interior);
      return {
        index,
        site,
        group,
        sphere,
        storey,
        interior,
        interiorUniforms,
        interiorParts: null,
        interiorOpaque: [],
        interiorId: site.interior?.path ?? null,
        materials: {
          massing: kit.opaque(massingStorey, massingFloors(site)),
          facade: kit.opaque(storey),
          detail: kit.opaque(storey),
          edge: kit.edge(storey),
        },
        massing: null,
        facade: null,
        detail: null,
        facadeId: site.facade?.path ?? null,
        detailId: site.detail?.path ?? null,
        shown: LEVEL_NONE,
        inView: false,
      };
    });
    this.siteGroup.matrixAutoUpdate = false;
    root.updateMatrixWorld(true);
  }

  /** Where a decoded file's objects go. They stay hidden until uploaded and chosen. */
  attach(id: string, decoded: DecodedParts, siteIndex: number | null): void {
    switch (decoded.kind) {
      case 'massing': {
        for (const building of this.buildings) {
          const entry = decoded.bySite.get(building.site.id);
          if (!entry) continue;
          for (const p of entry.parts) {
            replaceMaterial(p.object, building.materials.massing);
            p.object.visible = false;
          }
          entry.node.removeFromParent();
          building.group.add(entry.node);
          freeze(entry.node);
          building.group.updateMatrixWorld(true);
          building.massing = entry;
        }
        this.siteFiles.push(id);
        return;
      }
      case 'site':
        this.attachSite(decoded);
        this.siteFiles.push(id);
        return;
      case 'facade': {
        const building = siteIndex === null ? null : this.buildings[siteIndex];
        if (!building) return;
        for (const p of decoded.meshes) replaceMaterial(p.object, building.materials.facade);
        for (const p of decoded.edges) replaceMaterial(p.object, building.materials.edge);
        for (const p of decoded.parts) p.object.visible = false;
        decoded.node.removeFromParent();
        building.group.add(decoded.node);
        freeze(decoded.node);
        building.group.updateMatrixWorld(true);
        building.facade = decoded;
        return;
      }
      case 'detail': {
        const building = siteIndex === null ? null : this.buildings[siteIndex];
        if (!building) return;
        for (const p of decoded.parts) {
          replaceMaterial(p.object, building.materials.detail);
          p.object.visible = false;
          p.object.removeFromParent();
          building.group.add(p.object);
          freeze(p.object);
        }
        building.group.updateMatrixWorld(true);
        building.detail = decoded;
        return;
      }
      case 'interior': {
        const building = siteIndex === null ? null : this.buildings[siteIndex];
        if (building) this.attachInterior(building, decoded);
        return;
      }
      default:
        // Walk grids, nav files and the ground are CPU data: interior.ts keeps them.
    }
  }

  /**
   * An interior file's objects go under the building's interior group, hidden.
   * Four materials over the interior's uniforms, one per program (a material
   * never serves both a Mesh and an InstancedMesh): opaque and glass, plain and
   * instanced. Nodes keep their TRS (the dequantisation); T's InstancedMeshes
   * sit at identity, their instances carrying T(0, FFL, 0) · base.
   */
  private attachInterior(building: BuildingNode, decoded: InteriorParts) {
    if (building.interiorParts) return;
    const u = building.interiorUniforms;
    const opaque = this.kit.opaque(u);
    const opaqueInstanced = this.kit.opaque(u);
    const glass = this.kit.glass(u);
    const glassInstanced = this.kit.glass(u);
    const group = building.interior;
    for (const p of decoded.parts) {
      const object = p.object as Mesh | InstancedMesh;
      const instanced = (object as InstancedMesh).isInstancedMesh === true;
      const clear = isGlass(object);
      replaceMaterial(object, clear ? (instanced ? glassInstanced : glass) : (instanced ? opaqueInstanced : opaque));
      // Glass sorts after everything else transparent: in Plan the interior's
      // opaque parts are transparent-sorted too (materials.ts), and glass drawn
      // first would be overwritten by an opaque part behind it.
      if (clear) object.renderOrder = 1;
      object.visible = false;
    }
    building.interiorOpaque = [opaque, opaqueInstanced];
    // T and furniture are added as they are; R and the specials by their node (its TRS).
    const add = (object: Object3D) => {
      object.removeFromParent();
      group.add(object);
      freeze(object);
    };
    for (const p of decoded.typical?.meshes ?? []) add(p.object);
    if (decoded.residual) add(decoded.residual.node);
    for (const special of decoded.specials) add(special.node);
    for (const f of decoded.furniture) {
      if (f.full) add(f.full.object);
      if (f.proxy) add(f.proxy.object);
    }
    group.visible = false;
    building.group.updateMatrixWorld(true);
    building.interiorParts = decoded;
  }

  private attachSite(decoded: SiteParts) {
    const uniforms = createStoreyUniforms();
    const siteMaterial = this.kit.opaque(uniforms);
    const treeMaterial = this.kit.opaque(uniforms);
    for (const p of decoded.quadrants) {
      replaceMaterial(p.object, siteMaterial);
      p.object.visible = false;
      p.object.removeFromParent();
      this.siteGroup.add(p.object);
      freeze(p.object);
      const g = p.object.geometry;
      g.computeBoundingSphere();
      const sphere = (g.boundingSphere as Sphere).clone();
      this.quadrants.push({ part: p, sphere, tris: trianglesOf(p.object as Mesh), inView: false });
    }
    for (const s of decoded.species) this.species.push(this.attachSpecies(s, treeMaterial));
    this.siteGroup.updateMatrixWorld(true);
    for (const q of this.quadrants) q.sphere.applyMatrix4(q.part.object.matrixWorld);
  }

  private attachSpecies(s: SiteSpecies, material: Material): Species {
    const full = s.full;
    const crown = s.crown;
    for (const p of [full, crown]) {
      if (!p) continue;
      replaceMaterial(p.object, material);
      p.object.visible = false;
      p.object.removeFromParent();
      this.siteGroup.add(p.object);
      freeze(p.object);
    }
    const fullMesh = full?.object as InstancedMesh | undefined;
    const crownMesh = crown?.object as InstancedMesh | undefined;
    const count = fullMesh?.count ?? crownMesh?.count ?? 0;
    const fullSource = fullMesh ? new Float32Array(fullMesh.instanceMatrix.array as Float32Array) : null;
    const crownSource = crownMesh ? new Float32Array(crownMesh.instanceMatrix.array as Float32Array) : null;
    const centres = new Float32Array(2 * count);
    const source = fullSource ?? crownSource;
    if (source) {
      for (let i = 0; i < count; i += 1) {
        centres[2 * i] = source[16 * i + 12];
        centres[2 * i + 1] = source[16 * i + 14];
      }
    }
    return {
      name: s.name, full, crown, fullSource, crownSource, centres, count,
      partition: createTreePartition(count),
      fullTris: fullMesh ? trianglesOf(fullMesh) : 0,
      crownTris: crownMesh ? trianglesOf(crownMesh) : 0,
    };
  }

  // ---- per frame ------------------------------------------------------------------

  /** Frustum tests for every building and quadrant (bounding spheres). Writes `visible[i]`. */
  cull(projScreen: Matrix4, reversedDepth: boolean, visible: boolean[]): void {
    const frustum = this.frustum;
    frustum.setFromProjectionMatrix(projScreen, undefined, reversedDepth);
    const buildings = this.buildings;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      b.inView = frustum.intersectsSphere(b.sphere);
      visible[b.index] = b.inView;
    }
    const quadrants = this.quadrants;
    for (let i = 0; i < quadrants.length; i += 1) quadrants[i].inView = frustum.intersectsSphere(quadrants[i].sphere);
  }

  /** Near/far trees about the camera (three x, z). Re-partitions after TREE_REPARTITION_M of travel or a radius change. */
  updateTrees(cx: number, cz: number, radius: number): boolean {
    const moved = Math.hypot(cx - this.treeCamera.x, cz - this.treeCamera.z);
    if (radius === this.treeRadius && moved < TREE_REPARTITION_M) return false;
    this.treeCamera.set(cx, 0, cz);
    this.treeRadius = radius;
    let changed = false;
    for (let k = 0; k < this.species.length; k += 1) {
      const s = this.species[k];
      const fullReady = s.full !== null && s.full.uploaded && s.fullSource !== null;
      const r = fullReady ? radius : 0;
      if (!partitionTrees(s.centres, s.count, cx, cz, r, s.partition)) continue;
      changed = true;
      if (s.full && s.fullSource) {
        const mesh = s.full.object as InstancedMesh;
        gatherMatrices(s.fullSource, s.partition.near, s.partition.nearCount, mesh.instanceMatrix.array as Float32Array);
        mesh.count = s.partition.nearCount;
        mesh.instanceMatrix.needsUpdate = true;
      }
      if (s.crown && s.crownSource) {
        const mesh = s.crown.object as InstancedMesh;
        gatherMatrices(s.crownSource, s.partition.far, s.partition.farCount, mesh.instanceMatrix.array as Float32Array);
        mesh.count = s.partition.farCount;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    return changed;
  }

  /** Forces the next updateTrees() to re-partition (full trees arrived or left the GPU). */
  invalidateTrees(): void {
    this.treeRadius = -1;
  }

  /**
   * Shows each building at its level and the site as culled. `levels[i]` is
   * lod.ts' shown level. Edge lines draw where the tier allows them and the
   * building is within `edgeReach` metres (`distances[i]`, eye to its box), and
   * the massing storey lines within the same reach: beyond it storeys are a few
   * pixels apart and 1 px lines only alias into a dark mass. Returns the number of buildings whose level changed (a
   * geometry swap: two settle frames, §7.8).
   */
  applyLevels(levels: ArrayLike<number>, edges: boolean, distances: ArrayLike<number>, edgeReach: number): number {
    let swaps = 0;
    const buildings = this.buildings;
    for (let k = 0; k < buildings.length; k += 1) {
      const b = buildings[k];
      const level = levels[b.index];
      const near = distances[b.index] <= edgeReach;
      const lined = edges && near;
      if (level !== b.shown) swaps += 1;
      b.shown = level;
      b.group.visible = b.inView && level !== LEVEL_NONE;
      const massing = level === LOD_MASSING;
      const facade = level === LOD_FACADE || level === LOD_DETAIL;
      const detail = level === LOD_DETAIL;
      if (b.massing) showParts(b.massing.parts, massing);
      if (b.facade) {
        showParts(b.facade.meshes, facade);
        showParts(b.facade.edges, facade && lined);
        // polygonOffset(1, 1) on F and massing whenever edge lines draw (§7.2).
        this.setOffset(b.materials.facade, lined);
      }
      this.setOffset(b.materials.massing, lined);
      setMassingLines(b.materials.massing, near);
      if (b.detail) showParts(b.detail.parts, detail);
    }
    const quadrants = this.quadrants;
    for (let i = 0; i < quadrants.length; i += 1) quadrants[i].part.object.visible = quadrants[i].inView && quadrants[i].part.uploaded;
    for (let i = 0; i < this.species.length; i += 1) {
      const s = this.species[i];
      if (s.full) s.full.object.visible = s.full.uploaded && s.partition.nearCount > 0;
      if (s.crown) s.crown.object.visible = s.crown.uploaded && s.partition.farCount > 0;
    }
    return swaps;
  }

  private setOffset(material: Material, on: boolean) {
    if (material.polygonOffset === on) return;
    material.polygonOffset = on;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
  }

  /** What the site and grid will draw (lod.ts' reserve): quadrants in view, trees by partition, the grid. */
  reserve(out: { tris: number; draws: number }): { tris: number; draws: number } {
    let tris = 2;
    let draws = 1;
    for (let i = 0; i < this.quadrants.length; i += 1) {
      const q = this.quadrants[i];
      if (!q.inView || !q.part.uploaded) continue;
      tris += q.tris;
      draws += 1;
    }
    for (let i = 0; i < this.species.length; i += 1) {
      const s = this.species[i];
      if (s.full?.uploaded && s.partition.nearCount > 0) { tris += s.partition.nearCount * s.fullTris; draws += 1; }
      if (s.crown?.uploaded && s.partition.farCount > 0) { tris += s.partition.farCount * s.crownTris; draws += 1; }
    }
    out.tris = tris;
    out.draws = draws;
    return out;
  }

  /**
   * The façade mask (§7.5, P5): building `index`'s F, D and edges hide storeys
   * lo…hi (storey indices). MASK_OFF (0, −1) hides nothing. Only once the
   * interior is resident and active; returns whether anything changed (a band
   * change owes two settle frames).
   */
  setFacadeMask(index: number, lo: number, hi: number): boolean {
    const building = this.buildings[index];
    return building ? setStoreyMask(building.storey, lo, hi) : false;
  }

  /**
   * Plan's sides on building `index`'s interior (P6, materials.ts setPlanSides):
   * two-sided and transparent-sorted while its storey is cut, so the cut solids
   * show their filled insides; back to front faces only after. Returns whether
   * anything changed.
   */
  setPlanSides(index: number, on: boolean): boolean {
    const building = this.buildings[index];
    if (!building) return false;
    let changed = false;
    for (const material of building.interiorOpaque) if (setPlanSides(material, on)) changed = true;
    return changed;
  }

  /** Hides building `index`'s massing box (Plan, when detail selection fell back to it: it would hide the cut storey). */
  hideMassing(index: number): void {
    const massing = this.buildings[index]?.massing;
    if (massing) showParts(massing.parts, false);
  }

  /** Tells the scheduler which files drew this frame (eviction's "not seen for" clocks). */
  markSeen(scheduler: EstateScheduler, now: number): void {
    for (let i = 0; i < this.siteFiles.length; i += 1) scheduler.seen(this.siteFiles[i], now);
    for (let i = 0; i < this.buildings.length; i += 1) {
      const b = this.buildings[i];
      if (!b.group.visible) continue;
      if (b.shown >= LOD_FACADE && b.facadeId) scheduler.seen(b.facadeId, now);
      if (b.shown >= LOD_DETAIL && b.detailId) scheduler.seen(b.detailId, now);
    }
  }

  /** The scheduler freed these (§7.7): their GPU buffers go, the CPU copies stay for a re-upload. */
  evict(evictions: readonly Eviction[], partsOf: (id: string) => readonly Part[] | null, release?: (object: Part['object']) => void): boolean {
    let trees = false;
    for (let i = 0; i < evictions.length; i += 1) {
      const e = evictions[i];
      const parts = partsOf(e.id);
      if (!parts) continue;
      for (let j = 0; j < parts.length; j += 1) {
        const p = parts[j];

        if (p.role !== e.role || !p.uploaded) continue;
        p.uploaded = false;
        p.object.visible = false;
        p.object.geometry.dispose();
        if ((p.object as InstancedMesh).isInstancedMesh) (p.object as InstancedMesh).dispose();
        // Uploaded by a stand-in and never drawn here: the stand-in holds three's dispose hook (upload.ts).
        release?.(p.object);
        if (p.role === 'trees') trees = true;
      }
    }
    if (trees) this.invalidateTrees();
    return evictions.length > 0;
  }

  /** The context was lost: nothing is on the GPU any more. */
  markAllNotUploaded(all: Iterable<readonly Part[]>): void {
    for (const parts of all) for (const p of parts) { p.uploaded = false; p.object.visible = false; }
    for (const b of this.buildings) {
      b.shown = LEVEL_NONE;
      b.interior.visible = false;
    }
    this.invalidateTrees();
  }
}
