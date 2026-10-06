import { BufferAttribute, BufferGeometry, Mesh, ShapeUtils, Vector2, type Scene } from 'three';
import type { Vec2 } from '../../../../../lib/estate/frames';
import type { EstateNav } from '../../../../../lib/estate/nav';
import { extraSlot } from '../../../../../lib/estate/palette';
import type { EstatePlanRoom } from '../../engineApi';
import { createStoreyUniforms, type MaterialKit } from '../materials';

// Plan's pieces that need three (plan §8.1): the room list a storey shows, and
// the marker on the picked room, just under the cut. controls/index.ts runs Plan itself;
// lib/estate/plan.ts holds its pure rules.

const EMPTY: readonly EstatePlanRoom[] = Object.freeze([]);
const LISTS = new WeakMap<EstateNav, Map<number, readonly EstatePlanRoom[]>>();

/**
 * Storey `storey`'s rooms from a nav file, as Plan lists them (the file's own
 * order: flat by flat, then the common areas), one frozen array per storey and
 * file, so view.plan.rooms keeps its identity while the storey does.
 */
export const planRooms = (nav: EstateNav, storey: number): readonly EstatePlanRoom[] => {
  let byStorey = LISTS.get(nav);
  if (!byStorey) { byStorey = new Map(); LISTS.set(nav, byStorey); }
  let list = byStorey.get(storey);
  if (!list) {
    const rooms = nav.rooms[storey];
    list = rooms ? Object.freeze(rooms.map((r) => Object.freeze({ name: r.name, label: r.label, flat: r.flat }))) : EMPTY;
    byStorey.set(storey, list);
  }
  return list;
};

/** The marker's lid and band sit this far under the cut, m: below the plane every cut wall stops at. */
export const MARKER_UNDER_CUT = 0.02;
/** The lid's opacity over the room (of --color-accent-700). */
export const MARKER_LID_OPACITY = 0.22;
/** The band's width on screen when the room is picked, px… */
export const MARKER_BAND_PX = 3;
/** …held between these, m. */
export const MARKER_BAND_MIN = 0.08;
export const MARKER_BAND_MAX = 0.8;

/**
 * The band's width in metres that shows MARKER_BAND_PX wide on a canvas
 * `cssHeight` px tall, seen from `distance` m with a vertical field of view of
 * `fovDeg` (clamped to [MARKER_BAND_MIN, MARKER_BAND_MAX]): a pick reads at
 * whatever zoom it was made, and a zoom in afterwards only thickens it.
 */
export const markerBandWidth = (distance: number, fovDeg: number, cssHeight: number): number => {
  const metresPerPx = (2 * Math.max(0, distance) * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, cssHeight);
  const width = MARKER_BAND_PX * metresPerPx;
  return Math.min(MARKER_BAND_MAX, Math.max(MARKER_BAND_MIN, Number.isFinite(width) ? width : MARKER_BAND_MIN));
};

/**
 * The band: one quad per edge of `ring` (open, [x, y]), from the edge to `width`
 * inside it (the ring's winding says which side that is), as [x, y] corners in
 * quad order (edge start, edge end, inner end, inner start). Inside, so it sits
 * on the room's light floor and lid, never on the dark section of the wall.
 */
export const bandQuads = (ring: readonly Vec2[], width: number): Vec2[] => {
  const n = ring.length;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  const side = area >= 0 ? 1 : -1;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(length > 1e-6)) continue;
    // The left normal for a counter-clockwise ring, the right for a clockwise one.
    const nx = (-(b[1] - a[1]) / length) * side * width;
    const ny = ((b[0] - a[0]) / length) * side * width;
    out.push([a[0], a[1]], [b[0], b[1]], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]);
  }
  return out;
};

/**
 * The picked room (§8.1 "picking"), drawn where Plan's own section is: just
 * under the cut, not on the floor, which the cut walls hide from 55° above. A
 * lid over the whole room (--color-accent-700 at MARKER_LID_OPACITY) tints
 * everything in it, and a solid band of the same colour runs inside its
 * outline (markerBandWidth wide), so a pick reads at the opening view of a
 * long slab without zooming. Both draw with the interior glass's program
 * (two-sided, alpha from the palette, no depth write), so a pick adds no
 * program; depth-tested, so another building in front still hides it, but
 * nothing of its own storey can (everything there stops at the cut). In world
 * coordinates under the scene root, never masked or cut. Its geometry is made
 * per pick (and per cut step) and freed on the next: never per frame.
 */
export class PlanMarker {
  private readonly lid: Mesh;
  private readonly band: Mesh;

  constructor(kit: MaterialKit, root: Scene) {
    const uniforms = createStoreyUniforms();
    const lid = kit.glass(uniforms);
    lid.opacity = MARKER_LID_OPACITY;
    const band = kit.glass(uniforms);
    this.lid = new Mesh(new BufferGeometry(), lid);
    this.band = new Mesh(new BufferGeometry(), band);
    // After the interior's glass (renderOrder 1, scene.ts), the band over the lid.
    this.lid.renderOrder = 2;
    this.band.renderOrder = 3;
    for (const object of [this.lid, this.band]) {
      object.name = 'planMarker';
      object.visible = false;
      object.frustumCulled = false;
      object.matrixAutoUpdate = false;
      root.add(object);
    }
  }

  /**
   * Mark `ring` (block-local [x, y], open) of a building at estate `at`, at
   * block-local Z `cutZ` (the storey's floor plus the cut), with a band
   * `width` m wide.
   */
  show(ring: readonly Vec2[], at: ArrayLike<number>, cutZ: number, width: number): void {
    const n = ring.length;
    if (n < 3) { this.hide(); return; }
    const y = cutZ - MARKER_UNDER_CUT;
    const place = (points: readonly Vec2[]) => {
      const positions = new Float32Array(3 * points.length);
      points.forEach(([x, py], i) => {
        positions[3 * i] = at[0] + x;
        positions[3 * i + 1] = y;
        positions[3 * i + 2] = -(at[1] + py);
      });
      return positions;
    };
    const faces = ShapeUtils.triangulateShape(ring.map(([x, ry]) => new Vector2(x, ry)), []);
    const lidIndex = new Uint32Array(3 * faces.length);
    faces.forEach((face, f) => { lidIndex[3 * f] = face[0]; lidIndex[3 * f + 1] = face[1]; lidIndex[3 * f + 2] = face[2]; });
    const quads = bandQuads(ring, width);
    const bandIndex = new Uint32Array((6 * quads.length) / 4);
    for (let q = 0; q < quads.length / 4; q += 1) {
      const k = 4 * q;
      bandIndex.set([k, k + 1, k + 2, k, k + 2, k + 3], 6 * q);
    }
    const slot = extraSlot('edge');
    this.lid.geometry.dispose();
    this.band.geometry.dispose();
    this.lid.geometry = markerGeometry(place(ring), lidIndex, slot);
    this.band.geometry = markerGeometry(place(quads), bandIndex, slot);
    this.lid.visible = faces.length > 0;
    this.band.visible = quads.length > 0;
  }

  hide(): void {
    this.lid.visible = false;
    this.band.visible = false;
  }

  get visible(): boolean { return this.lid.visible || this.band.visible; }

  /**
   * Off the scene. Its GPU objects are left to the engine's forced context
   * loss, as every other estate object is (core.ts dispose): freeing them one
   * by one would reach into a context about to go.
   */
  dispose(): void {
    this.lid.removeFromParent();
    this.band.removeFromParent();
  }
}

/** Positions, an index, and _meta (the palette slot every vertex draws with; storey 0, which no mask hides). */
const markerGeometry = (positions: Float32Array, index: Uint32Array, slot: number): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const meta = new Uint8Array(4 * (positions.length / 3));
  for (let i = 0; i < meta.length; i += 4) meta[i] = slot;
  geometry.setAttribute('_meta', new BufferAttribute(meta, 4));
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
};
