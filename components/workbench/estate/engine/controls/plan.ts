import { BufferAttribute, BufferGeometry, LineSegments, Mesh, ShapeUtils, Vector2, type Scene } from 'three';
import type { Vec2 } from '../../../../../lib/estate/frames';
import type { EstateNav } from '../../../../../lib/estate/nav';
import { extraSlot } from '../../../../../lib/estate/palette';
import type { EstatePlanRoom } from '../../engineApi';
import { createStoreyUniforms, type MaterialKit } from '../materials';

// Plan's pieces that need three (plan §8.1): the room list a storey shows, and
// the marker on the picked room's floor. controls/index.ts runs Plan itself;
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

/** The marker sits this far above the room's floor, m: clear of the slab's own depth. */
export const MARKER_LIFT = 0.03;

/**
 * The picked room, drawn on its floor (§8.1 "picking"): its outline in the edge
 * colour (--color-accent-700, the line program) over a translucent fill in the
 * interior-glass colour (--color-accent-300 at 35 %, the glass program), so a
 * pick adds no program. In world coordinates under the scene root, depth-tested
 * (walls and furniture in front hide it), never masked or cut. Its geometry is
 * made per pick and freed on the next: never per frame.
 */
export class PlanMarker {
  private readonly fill: Mesh;
  private readonly outline: LineSegments;

  constructor(kit: MaterialKit, root: Scene) {
    const uniforms = createStoreyUniforms();
    const glass = kit.glass(uniforms);
    const edge = kit.edge(uniforms);
    this.fill = new Mesh(new BufferGeometry(), glass);
    this.outline = new LineSegments(new BufferGeometry(), edge);
    // After the interior's glass (renderOrder 1, scene.ts).
    this.fill.renderOrder = 2;
    for (const object of [this.fill, this.outline]) {
      object.name = 'planMarker';
      object.visible = false;
      object.frustumCulled = false;
      object.matrixAutoUpdate = false;
      root.add(object);
    }
  }

  /** Mark `ring` (block-local [x, y], open) of a building at estate `at` on the floor at block-local Z `floorZ`. */
  show(ring: readonly Vec2[], at: ArrayLike<number>, floorZ: number): void {
    const n = ring.length;
    if (n < 3) { this.hide(); return; }
    const y = floorZ + MARKER_LIFT;
    const positions = new Float32Array(3 * n);
    for (let i = 0; i < n; i += 1) {
      positions[3 * i] = at[0] + ring[i][0];
      positions[3 * i + 1] = y;
      positions[3 * i + 2] = -(at[1] + ring[i][1]);
    }
    const faces = ShapeUtils.triangulateShape(ring.map(([x, ry]) => new Vector2(x, ry)), []);
    const index = new Uint32Array(3 * faces.length);
    faces.forEach((face, f) => { index[3 * f] = face[0]; index[3 * f + 1] = face[1]; index[3 * f + 2] = face[2]; });
    const lines = new Uint32Array(2 * n);
    for (let i = 0; i < n; i += 1) { lines[2 * i] = i; lines[2 * i + 1] = (i + 1) % n; }
    this.fill.geometry.dispose();
    this.outline.geometry.dispose();
    this.fill.geometry = markerGeometry(positions, index, extraSlot('glass-interior'));
    this.outline.geometry = markerGeometry(positions, lines, extraSlot('edge'));
    this.fill.visible = faces.length > 0;
    this.outline.visible = true;
  }

  hide(): void {
    this.fill.visible = false;
    this.outline.visible = false;
  }

  get visible(): boolean { return this.outline.visible; }

  /**
   * Off the scene. Its GPU objects are left to the engine's forced context
   * loss, as every other estate object is (core.ts dispose): freeing them one
   * by one would reach into a context about to go.
   */
  dispose(): void {
    this.fill.removeFromParent();
    this.outline.removeFromParent();
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
