import { beforeAll, describe, expect, it } from 'vitest';
import { boundsOf, decodeSheet, insideRing, type Massing, type Pts, type Rect, type SheetGeometry } from '../lib/drawings/decode';
import { inksFor, type DrawingTokens, type InkMode, type Inks } from '../lib/drawings/ink';
import {
  doorRect, doorsInPoche, linksOf, paintCropMarks, paintDimension, paintJambs, paintLinks, paintMassing, paintPlanLines,
  paintPlate, paintPoche, paintRuleIn, paintRuler, paintSite, paintTreads, planDimensions, riserCount, viewOf, type Ctx, type View,
} from '../lib/drawings/paint';
import { basis, DEG, planPose, posterPose, project, rotateByQuat, type Frame, type Pose } from '../lib/drawings/project';
import { planPenPaths, PenReveal, type PenPaths } from '../lib/drawings/reveal';
import { sceneOf, type Scene } from '../lib/drawings/scene';
import { SHEET_LOADERS } from '../lib/drawings/sheetLoaders.generated';
import { EXTENT, KERBS, POSTER, SITES } from '../lib/drawings/site.generated';

// The desk drawing set's painters (lib/drawings/paint.ts) and DRAW-IN's pen
// (lib/drawings/reveal.ts), run against a recording CanvasRenderingContext2D over
// the committed sheets. The painters are the drawing set's claims made visible
// (docs/portfolio/desk-drawing-set.md §1 "Derivations", "Never drawn"): the wall
// fill is ONE even-odd fill and none on a partial sheet, doors are openings cut
// out of the line work (erased on a cache, painted over in the plate's face
// colour on an opaque plate), never swings; a stair is one line per riser and its
// walking line arrives only with the last riser; massing is painted far to near
// and stops at the roof level plus the roof's rooms; and nothing is ever drawn in
// a colour that is not one of the inks. The pen strokes forward only and covers
// the pen order exactly once, with any number of pens — that is what makes a
// DRAW-IN end on the still, pixel for pixel.

// ---- a recording 2D context --------------------------------------------------------------

type Pt = [number, number];

interface State {
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  globalAlpha: number;
  globalCompositeOperation: string;
  lineCap: string;
  lineJoin: string;
  lineDash: number[];
}

interface Op {
  name: string;
  args: unknown[];
  /** The context's state when the call was made. */
  state: State;
  /** For a stroke, fill or clip: the current path (subpaths of px points); otherwise empty. */
  path: Pt[][];
}

const INITIAL: State = {
  strokeStyle: '#000000', fillStyle: '#000000', lineWidth: 1, globalAlpha: 1,
  globalCompositeOperation: 'source-over', lineCap: 'butt', lineJoin: 'miter', lineDash: [],
};

const copyState = (s: State): State => ({ ...s, lineDash: [...s.lineDash] });
const copyPath = (p: Pt[][]): Pt[][] => p.map((sub) => sub.map(([x, y]) => [x, y] as Pt));

/** Records every method call (any name, so a stray arc or curve is caught) and every property set. */
class Recorder {
  readonly ops: Op[] = [];
  readonly sets: { prop: string; value: unknown }[] = [];
  readonly ctx: Ctx;
  private state = copyState(INITIAL);
  private readonly stack: State[] = [];
  private path: Pt[][] = [];

  constructor() {
    const self = this;
    this.ctx = new Proxy({}, {
      get(_t, prop) {
        if (typeof prop !== 'string' || prop === 'then') return undefined;
        if (prop in self.state) return (self.state as unknown as Record<string, unknown>)[prop];
        return (...args: unknown[]) => self.call(prop, args);
      },
      set(_t, prop, value) {
        if (typeof prop !== 'string') return false;
        (self.state as unknown as Record<string, unknown>)[prop] = value;
        self.sets.push({ prop, value });
        return true;
      },
    }) as unknown as Ctx;
  }

  private call(name: string, args: unknown[]): unknown {
    switch (name) {
      case 'save': this.stack.push(copyState(this.state)); break;
      case 'restore': this.state = this.stack.pop() ?? this.state; break;
      case 'setLineDash': this.state.lineDash = [...(args[0] as number[])]; break;
      case 'getLineDash': return [...this.state.lineDash];
      case 'beginPath': this.path = []; break;
      case 'moveTo': this.path.push([[args[0] as number, args[1] as number]]); break;
      case 'lineTo': {
        const p: Pt = [args[0] as number, args[1] as number];
        if (this.path.length) this.path[this.path.length - 1].push(p); else this.path.push([p]);
        break;
      }
      case 'closePath': {
        const sub = this.path[this.path.length - 1];
        if (sub?.length) this.path.push([[sub[0][0], sub[0][1]]]);
        break;
      }
      default: break;
    }
    const drawing = name === 'stroke' || name === 'fill' || name === 'clip';
    this.ops.push({ name, args, state: copyState(this.state), path: drawing ? copyPath(this.path) : [] });
    return undefined;
  }

  /** Save/restore are balanced and the state is back where it started. */
  get pristine(): boolean {
    return this.stack.length === 0 && JSON.stringify(this.state) === JSON.stringify(INITIAL);
  }

  named(name: string): Op[] {
    return this.ops.filter((o) => o.name === name);
  }

  /** The subpaths with at least one segment, of a stroke or fill. */
  static drawn(op: Op): Pt[][] {
    return op.path.filter((sub) => sub.length > 1);
  }
}

const record = (paint: (ctx: Ctx) => void): Recorder => {
  const rec = new Recorder();
  paint(rec.ctx);
  return rec;
};

// ---- fixtures ------------------------------------------------------------------------------

/** index.css's tokens (palette.ts reads them off :root at run time). */
const TOKENS: DrawingTokens = {
  bg: '#f2f2f3', text: '#1d1f20', accent700: '#416180', accent900: '#1d2d3d', neutral500: '#98989b', neutral700: '#5d5d60',
};
const DESK = inksFor(TOKENS, 'desk');

/** Plans drawn at 10 px/m, north up, centred on the footprint. */
const S = 10;
const FRAME: Frame = { x: 0, y: 0, w: 1200, h: 1000 };
const planView = (g: SheetGeometry): View => {
  const b = boundsOf([g.fp]);
  return viewOf(planPose((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, FRAME.h / (2 * S)), FRAME);
};
/** A plan view's px back to block-local metres. */
const toWorld = (v: View, [X, Y]: Pt): Pt => [v.pose.cx + (X - FRAME.x - FRAME.w / 2) / S, v.pose.cy - (Y - FRAME.y - FRAME.h / 2) / S];

const length = (sub: readonly Pt[]): number => {
  let l = 0;
  for (let i = 1; i < sub.length; i += 1) l += Math.hypot(sub[i][0] - sub[i - 1][0], sub[i][1] - sub[i - 1][1]);
  return l;
};
const perimeter = (ring: Pts): number => {
  let l = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    l += Math.hypot(ring[j] - ring[i], ring[j + 1] - ring[i + 1]);
  }
  return l;
};

interface PlanSheet { id: string; g: SheetGeometry }

let SHEETS: PlanSheet[] = [];
const sheet = (id: string, key: string): SheetGeometry => {
  const found = SHEETS.find((s) => s.id === id && s.g.key === key);
  if (!found) throw new Error(`no sheet ${id} ${key}`);
  return found.g;
};
let scene: Scene;

beforeAll(async () => {
  const out: PlanSheet[] = [];
  for (const site of SITES) {
    const mod = await SHEET_LOADERS[site.id]();
    expect(mod.SITE_ID).toBe(site.id);
    for (const s of mod.SHEETS) out.push({ id: site.id, g: decodeSheet(site, s) });
  }
  SHEETS = out;
  scene = sceneOf(SITES, KERBS, EXTENT, POSTER);
});

// ---- plan layers -----------------------------------------------------------------------------

describe('paintPoche — the wall fill', () => {
  it('is exactly one even-odd fill of the footprint, the rooms less the islands, the cores, voids, strips and door cuts, and strokes nothing', () => {
    const solid = SHEETS.filter((s) => !s.g.partial);
    expect(solid).toHaveLength(40);
    for (const { id, g } of solid) {
      const v = planView(g);
      const rec = record((ctx) => paintPoche(ctx, v, g, DESK));
      const fills = rec.named('fill');
      expect(fills, `${id} ${g.key}`).toHaveLength(1);
      expect(fills[0].args).toEqual(['evenodd']);
      expect(fills[0].state.fillStyle).toBe(DESK.poche.color);
      expect(rec.named('stroke')).toHaveLength(0);
      const rings = 1 + (g.rooms.length - g.skip.size) + g.cores.length + g.voids.length + g.bands.length + doorsInPoche(g).length;
      expect(Recorder.drawn(fills[0]), `${id} ${g.key}`).toHaveLength(rings);
      expect(rec.named('moveTo')).toHaveLength(rings);
      expect(rec.pristine).toBe(true);
    }
  });

  it('draws nothing on a partial sheet (only NC 514’s L2, its shop block over the hall), nor at alpha 0', () => {
    const partial = SHEETS.filter((s) => s.g.partial);
    expect(partial.map((s) => `${s.id} ${s.g.key}`)).toEqual(['NC_514 L2']);
    const g = sheet('NC_514', 'L2');
    const rec = record((ctx) => paintPoche(ctx, planView(g), g, DESK));
    expect(rec.ops).toHaveLength(0);
    expect(rec.sets).toHaveLength(0);
    const typ = sheet('BLK_501', 'TYP');
    const faded = record((ctx) => paintPoche(ctx, planView(typ), typ, DESK, 0, 0));
    expect(faded.ops).toHaveLength(0);
  });
});

describe('doorsInPoche', () => {
  it('cuts all but the car park roof’s two island doors out of the wall fill (852 of 854)', () => {
    let all = 0;
    const outside: { id: string; key: string; d: SheetGeometry['doors'][number]; g: SheetGeometry }[] = [];
    for (const { id, g } of SHEETS) {
      const inPoche = doorsInPoche(g);
      all += g.doors.length;
      for (const d of g.doors) if (!inPoche.includes(d)) outside.push({ id, key: g.key, d, g });
    }
    expect(all).toBe(854);
    expect(outside.map((o) => `${o.id} ${o.key}`)).toEqual(['MSCP_513 RF', 'MSCP_513 RF']);
    // Each is a stair door on an island (a room wholly inside the roof garden, left
    // out of the fill): its opening abuts the island and lies in the garden.
    const g = outside[0].g;
    expect([...g.skip]).toEqual([0, 2]);
    const islands = [...g.skip].map((i) => boundsOf([g.rooms[i]]));
    const abuts = (r: Rect, b: Rect) => {
      const gapX = Math.max(b.x0 - r.x1, r.x0 - b.x1, 0);
      const gapY = Math.max(b.y0 - r.y1, r.y0 - b.y1, 0);
      return Math.hypot(gapX, gapY) < 1e-3;
    };
    for (const { d } of outside) {
      const r = doorRect(d);
      expect(islands.some((b) => abuts(r, b))).toBe(true);
      const cx = (r.x0 + r.x1) / 2;
      const cy = (r.y0 + r.y1) / 2;
      expect(g.codes.filter((_, i) => !g.skip.has(i) && insideRing(g.rooms[i], cx, cy))).toEqual(['GARDEN']);
    }
  });
});

describe('paintPlanLines — door openings', () => {
  it('on a cache (no ground) erases them with destination-out, after all the line work, one rect per door', () => {
    for (const { id, g } of SHEETS) {
      if (!g.doors.length) continue;
      const v = planView(g);
      const rec = record((ctx) => paintPlanLines(ctx, v, g, DESK));
      const fills = rec.named('fill');
      expect(fills, `${id} ${g.key}`).toHaveLength(1);
      const cut = fills[0];
      expect(cut.state.globalCompositeOperation).toBe('destination-out');
      expect(cut.state.lineDash).toEqual([]);
      // The cut comes last: nothing is stroked over the openings afterwards.
      const at = rec.ops.indexOf(cut);
      expect(rec.ops.slice(at + 1).filter((o) => o.name === 'stroke' || o.name === 'fill')).toHaveLength(0);
      // Each opening: the door's rect between its faces, padded by the room line's width + 1 px.
      const pad = (DESK.room.width + 1) / S;
      const rects = Recorder.drawn(cut);
      expect(rects).toHaveLength(g.doors.length);
      rects.forEach((sub, i) => {
        const want = doorRect(g.doors[i], pad);
        const pts = sub.map((p) => toWorld(v, p));
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        expect(Math.min(...xs)).toBeCloseTo(want.x0, 9);
        expect(Math.max(...xs)).toBeCloseTo(want.x1, 9);
        expect(Math.min(...ys)).toBeCloseTo(want.y0, 9);
        expect(Math.max(...ys)).toBeCloseTo(want.y1, 9);
      });
      // The line work itself is drawn normally; only cuts erase.
      const lines = rec.named('stroke').filter((o) => o.state.globalCompositeOperation === 'source-over');
      expect(lines.length).toBeGreaterThan(0);
      for (const o of rec.named('stroke')) {
        if (o.state.globalCompositeOperation === 'destination-out') expect(o.state.lineDash).toEqual([]);
      }
      expect(rec.pristine).toBe(true);
    }
  });

  it('on an opaque plate paints the plate’s face colour over them instead, and never erases', () => {
    const ground = DESK.face.color;
    for (const { id, g } of SHEETS) {
      const v = planView(g);
      const rec = record((ctx) => paintPlanLines(ctx, v, g, DESK, { ground, footprint: false }));
      expect(rec.ops.filter((o) => o.state.globalCompositeOperation !== 'source-over'), `${id} ${g.key}`).toHaveLength(0);
      const fills = rec.named('fill');
      expect(fills).toHaveLength(g.doors.length ? 1 : 0);
      if (fills.length) {
        expect(fills[0].state.fillStyle).toBe(ground);
        expect(Recorder.drawn(fills[0])).toHaveLength(g.doors.length);
      }
      // Slab edges and shared boundaries are cut the same way: a solid stroke of the ground first.
      const cuts = rec.named('stroke').filter((o) => o.state.strokeStyle === ground);
      expect(cuts).toHaveLength((g.slabs.length ? 1 : 0) + (g.shared.length ? 1 : 0));
      for (const o of cuts) expect(o.state.lineDash).toEqual([]);
      expect(rec.pristine).toBe(true);
    }
  });

  it('draws a partial sheet’s footprint dashed in the hidden ink (NC 514 L2: OUTLINE OF L1 BELOW), a whole one in the hero ink', () => {
    const outline = (g: SheetGeometry) => {
      const v = planView(g);
      const rec = record((ctx) => paintPlanLines(ctx, v, g, DESK));
      // The footprint is the stroke whose one subpath has the footprint's vertices.
      return rec.named('stroke').find((o) => {
        const subs = Recorder.drawn(o);
        return subs.length === 1 && subs[0].length === g.fp.length / 2;
      })!;
    };
    const partial = outline(sheet('NC_514', 'L2'));
    expect(partial.state.strokeStyle).toBe(DESK.hidden.color);
    expect(partial.state.lineDash).toEqual([...DESK.hidden.dash!]);
    const whole = outline(sheet('NC_514', 'L1'));
    expect(whole.state.strokeStyle).toBe(DESK.hero.color);
    expect(whole.state.lineDash).toEqual([]);
  });
});

describe('plan painters — no door swings', () => {
  it('never call arc, or any curve, on any sheet: doors are openings with jambs, nothing more', () => {
    const curve = /arc|ellipse|curve/i;
    for (const { id, g } of SHEETS) {
      const v = planView(g);
      const rec = record((ctx) => {
        paintPoche(ctx, v, g, DESK);
        paintPlanLines(ctx, v, g, DESK);
        paintPlanLines(ctx, v, g, DESK, { ground: DESK.face.color, footprint: false });
        paintJambs(ctx, v, g, DESK);
        paintTreads(ctx, v, g, DESK);
        for (const d of planDimensions(g, v)) paintDimension(ctx, v, d, DESK, 1);
        paintPlate(ctx, v, g, DESK, { z: 3.6, detail: true, dx: 5, dy: -3 });
      });
      expect(rec.ops.filter((o) => curve.test(o.name)).map((o) => o.name), `${id} ${g.key}`).toEqual([]);
    }
  });

  it('paintJambs draws a jamb at each end of every opening, face to face, and two ticks per lift landing', () => {
    for (const { id, g } of SHEETS) {
      const v = planView(g);
      const rec = record((ctx) => paintJambs(ctx, v, g, DESK));
      const strokes = rec.named('stroke');
      expect(strokes).toHaveLength(1);
      expect(strokes[0].state.strokeStyle).toBe(DESK.jamb.color);
      const subs = Recorder.drawn(strokes[0]);
      expect(subs, `${id} ${g.key}`).toHaveLength(2 * g.doors.length + 2 * g.lifts.length);
      g.doors.forEach((d, i) => {
        for (const sub of subs.slice(2 * i, 2 * i + 2)) expect(length(sub) / S).toBeCloseTo(d.o2 - d.o1, 9);
      });
    }
  });
});

// ---- stairs ---------------------------------------------------------------------------------

/** paintTreads' two strokes: the risers and stringers (tread ink), and the walking line with its arrows (jamb ink). */
const treads = (g: SheetGeometry, v: View, shown = Infinity) => {
  const rec = record((ctx) => paintTreads(ctx, v, g, DESK, 0, shown));
  const strokes = rec.named('stroke');
  return {
    rec,
    risers: strokes.find((o) => o.state.strokeStyle === DESK.tread.color) ?? null,
    walk: strokes.find((o) => o.state.strokeStyle === DESK.jamb.color) ?? null,
  };
};

describe('paintTreads', () => {
  it('draws one riser line per riser, each the flight’s width, then both stringers of each flight', () => {
    let sheets = 0;
    for (const { id, g } of SHEETS) {
      if (!g.flights.length) continue;
      sheets += 1;
      const v = planView(g);
      const { risers, rec } = treads(g, v);
      const subs = Recorder.drawn(risers!);
      // One moveTo/lineTo pair per riser and per stringer.
      expect(subs.every((s) => s.length === 2)).toBe(true);
      expect(subs, `${id} ${g.key}`).toHaveLength(riserCount(g) + 2 * g.flights.length);
      let at = 0;
      for (const f of g.flights) {
        for (let i = 0; i < f.risers; i += 1) expect(length(subs[at + i]) / S).toBeCloseTo(f.width, 9);
        const len = Math.hypot(f.ex - f.sx, f.ey - f.sy);
        for (const stringer of subs.slice(at + f.risers, at + f.risers + 2)) expect(length(stringer) / S).toBeCloseTo(len, 9);
        at += f.risers + 2;
      }
      expect(rec.pristine).toBe(true);
    }
    expect(sheets).toBe(SHEETS.filter((s) => s.g.flights.length).length);
  });

  it('ticks the risers in one at a time and sets the walking line only once every riser is down', () => {
    const g = sheet('BLK_501', 'L1');
    const v = planView(g);
    const most = Math.max(...g.flights.map((f) => f.risers));
    expect(g.flights.map((f) => f.risers)).toEqual([11, 10, 11, 10]);
    expect(treads(g, v, 0).rec.ops).toHaveLength(0);
    for (let shown = 1; shown <= most + 1; shown += 1) {
      const { risers, walk } = treads(g, v, shown);
      const subs = Recorder.drawn(risers!);
      const ticks = g.flights.reduce((n, f) => n + Math.min(f.risers, shown), 0);
      const stringers = g.flights.reduce((n, f) => n + (shown >= f.risers ? 2 : 0), 0);
      expect(subs, `shown ${shown}`).toHaveLength(ticks + stringers);
      expect(walk !== null, `shown ${shown}`).toBe(shown >= most);
    }
  });

  /**
   * Each stair's walking line and its arrowhead (paintTreads draws them as
   * alternating subpaths per stair). An arrowhead at the end of a line has its
   * barbs back along the line from its tip: (barb − tip) · (line − tip) > 0.
   */
  const arrows = (dir: 1 | -1) => {
    const out: { where: string; barbsBack: boolean[] }[] = [];
    for (const { id, g } of SHEETS) {
      if (!g.flights.length || g.flights[0].dir !== dir) continue;
      expect(new Set(g.flights.map((f) => f.dir)).size).toBe(1);
      const v = planView(g);
      const subs = Recorder.drawn(treads(g, v).walk!);
      const stairs = new Set(g.flights.map((f) => f.stair)).size;
      expect(subs).toHaveLength(2 * stairs);
      for (let k = 0; k < stairs; k += 1) {
        const line = subs[2 * k];
        const head = subs[2 * k + 1];
        expect(head).toHaveLength(3);
        const tip = head[1];
        const atStart = Math.hypot(tip[0] - line[0][0], tip[1] - line[0][1]) < 1e-6;
        const atEnd = Math.hypot(tip[0] - line[line.length - 1][0], tip[1] - line[line.length - 1][1]) < 1e-6;
        expect(atStart || atEnd).toBe(true);
        const next = atEnd ? line[line.length - 2] : line[1];
        const back = [next[0] - tip[0], next[1] - tip[1]];
        out.push({
          where: `${id} ${g.key} stair ${k + 1}`,
          barbsBack: [head[0], head[2]].map((b) => (b[0] - tip[0]) * back[0] + (b[1] - tip[1]) * back[1] > 0),
        });
      }
    }
    return out;
  };

  it('ends an UP stair’s walking line in an arrowhead pointing out of its top', () => {
    const up = arrows(1);
    expect(up.length).toBeGreaterThan(0);
    for (const a of up) expect(a.barbsBack, a.where).toEqual([true, true]);
  });

  // A DN stair's tip is the foot of its first flight, so its barbs trail back along
  // that flight (every stair here is a dog-leg: the flights run opposite ways).
  it('ends a DN stair’s walking line in an arrowhead pointing out of its end too (dog-leg stairs)', () => {
    const dn = arrows(-1);
    expect(dn.length).toBeGreaterThan(0);
    for (const a of dn) expect(a.barbsBack, a.where).toEqual([true, true]);
  });
});

// ---- inks ---------------------------------------------------------------------------------------

describe('inks', () => {
  it.each<InkMode>(['desk', 'reading'])('every colour any painter sets is one of inksFor’s %s inks, and each leaves the context as it found it', (mode) => {
    const inks: Inks = inksFor(TOKENS, mode);
    const palette = new Set(Object.values(inks).map((i) => i.color));
    const check = (what: string, paint: (ctx: Ctx) => void) => {
      const rec = record(paint);
      const colours = rec.sets.filter((s) => s.prop === 'strokeStyle' || s.prop === 'fillStyle').map((s) => s.value as string);
      expect(colours.filter((c) => !palette.has(c)), what).toEqual([]);
      expect(rec.pristine, what).toBe(true);
    };
    for (const { id, g } of SHEETS) {
      const v = planView(g);
      const what = `${id} ${g.key}`;
      check(`${what} poché`, (ctx) => paintPoche(ctx, v, g, inks));
      check(`${what} lines`, (ctx) => paintPlanLines(ctx, v, g, inks));
      check(`${what} lines on a plate`, (ctx) => paintPlanLines(ctx, v, g, inks, { ground: inks.face.color }));
      check(`${what} jambs`, (ctx) => paintJambs(ctx, v, g, inks));
      check(`${what} treads`, (ctx) => { paintTreads(ctx, v, g, inks); paintTreads(ctx, v, g, inks, 0, 3); });
      check(`${what} dims`, (ctx) => { for (const d of planDimensions(g, v)) { paintDimension(ctx, v, d, inks, 0.5); paintDimension(ctx, v, d, inks, 1); } });
      check(`${what} plate`, (ctx) => {
        paintPlate(ctx, v, g, inks, { z: 3.6, detail: true, alpha: 0.6, dx: 4, dy: -2 });
        paintPlate(ctx, v, g, inks, { z: 6.4, detail: false });
      });
    }
    const poster = viewOf(posterPose(POSTER), { x: 0, y: 0, w: POSTER.w, h: POSTER.h });
    const site = { extent: scene.extent, kerbs: scene.kerbs, buildings: scene.buildings };
    check('site', (ctx) => paintSite(ctx, poster, site, inks, { hero: 'BLK_501', lid: 0.6, context: 0.8 }));
    check('rule-in', (ctx) => paintRuleIn(ctx, poster, scene.extent, inks, 0.7, [0, 0]));
    check('massing', (ctx) => {
      paintMassing(ctx, poster, scene.buildings, inks, { hero: 'BLK_509', storeys: true, context: 0.5, faces: 0.8 });
      paintMassing(ctx, poster, scene.buildings, inks, { hero: 'BLK_509', cut: 8.4, heroRise: 0.7, zScale: 0.5 });
    });
    const typ = sheet('BLK_501', 'TYP');
    const links = linksOf(SHEETS.filter((s) => s.id === 'BLK_501').map((s) => s.g));
    check('links', (ctx) => paintLinks(ctx, poster, links, inks, 0, 56.8, 0.6, 0.8, 255, 345));
    check('ruler', (ctx) => paintRuler(ctx, poster, 255, 345, scene.buildings[0].ffl, inks));
    check('crop marks', (ctx) => paintCropMarks(ctx, planView(typ).frame, inks));
  });
});

// ---- massing ---------------------------------------------------------------------------------

describe('paintMassing', () => {
  it('paints the estate far to near from the poster camera: the first face filled is the farthest building’s, each building’s faces together', () => {
    const pose = posterPose(POSTER);
    const frame: Frame = { x: 0, y: 0, w: POSTER.w, h: POSTER.h };
    const v = viewOf(pose, frame);
    const b = basis(pose);
    const key = (p: readonly number[]) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
    // Every point a building's faces can start from: its footprint at 0 and the
    // roof, its caps at the roof and their tops.
    const owner = new Map<string, string>();
    const claim = (m: Massing, ring: Pts, z: number) => {
      const p = [0, 0];
      for (let i = 0; i < ring.length; i += 2) {
        expect(project(pose, b, frame, ring[i], ring[i + 1], z, p)).toBe(true);
        const k = key(p);
        expect(owner.get(k) ?? m.id).toBe(m.id);
        owner.set(k, m.id);
      }
    };
    for (const m of scene.buildings) {
      const roof = m.ffl[m.ffl.length - 1];
      claim(m, m.fp, 0);
      claim(m, m.fp, roof);
      for (const c of m.caps) { claim(m, c.ring, roof); claim(m, c.ring, roof + c.h); }
    }
    const rec = record((ctx) => paintMassing(ctx, v, scene.buildings, DESK, { hero: 'BLK_501', storeys: true }));
    const faces = rec.named('fill').filter((o) => o.state.fillStyle === DESK.face.color);
    const seq = faces.map((o) => owner.get(key(Recorder.drawn(o)[0][0])));
    expect(seq.every(Boolean)).toBe(true);
    const order = seq.filter((id, i) => i === 0 || id !== seq[i - 1]);
    // Contiguous: each building once.
    expect(order).toHaveLength(scene.buildings.length);
    expect(new Set(order).size).toBe(scene.buildings.length);
    // Far to near along the poster camera's own view direction (pack quaternion).
    const f = rotateByQuat(POSTER.quat, [0, 0, -1]);
    const along = (m: Massing) => {
      let x = 0; let y = 0;
      for (let i = 0; i < m.fp.length; i += 2) { x += m.fp[i]; y += m.fp[i + 1]; }
      const n = m.fp.length / 2;
      return (x / n - POSTER.eye[0]) * f[0] + (y / n - POSTER.eye[1]) * f[1] + (0 - POSTER.eye[2]) * f[2];
    };
    const farToNear = [...scene.buildings].sort((p, q) => along(q) - along(p)).map((m) => m.id);
    expect(order[0]).toBe(farToNear[0]);
    expect(order).toEqual(farToNear);
    // The hero in the massing ink, the estate in the context ink.
    const strokes = rec.named('stroke');
    expect(strokes.some((o) => o.state.strokeStyle === DESK.massing.color)).toBe(true);
    expect(strokes.every((o) => o.state.strokeStyle === DESK.massing.color || o.state.strokeStyle === DESK.context.color)).toBe(true);
    expect(rec.pristine).toBe(true);
  });

  /** An orthographic elevation (φ = 0) at ψ: screen y is height alone, so every drawn point's z can be read back. */
  const elevation = (m: Massing, psi: number): { v: View; z: (p: Pt) => number } => {
    const b = boundsOf([m.fp]);
    const frame: Frame = { x: 0, y: 0, w: 1600, h: 1000 };
    const pose: Pose = { psi, phi: 0, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, cz: 0, k: 50, p: 0, sigma: 0, sigmaX: 0 };
    const s = frame.h / (2 * pose.k);
    return { v: viewOf(pose, frame), z: ([, Y]) => (frame.y + frame.h / 2 - Y) / s };
  };

  it('stops every building at its roof level and stands only the roof’s rooms on it, by their clear height — never the pack’s roofTop', () => {
    let belowTop = 0;
    for (const m of scene.buildings) {
      const roof = m.ffl[m.ffl.length - 1];
      const cap = Math.max(0, ...m.caps.map((c) => c.h));
      // The only heights the massing may draw at: the ground, the pack's FFLs, the caps' tops.
      const allowed = [0, ...m.ffl, ...m.caps.map((c) => roof + c.h)];
      for (const psi of [0, 90, 135, 225, 300].map((d) => d * DEG)) {
        const { v, z } = elevation(m, psi);
        const rec = record((ctx) => paintMassing(ctx, v, [m], DESK, { hero: m.id, storeys: true }));
        const zs = rec.ops.filter((o) => o.name === 'stroke' || o.name === 'fill').flatMap((o) => Recorder.drawn(o).flat().map(z));
        expect(zs.length).toBeGreaterThan(0);
        expect(Math.max(...zs), m.id).toBeCloseTo(roof + cap, 6);
        for (const h of zs) expect(allowed.some((a) => Math.abs(a - h) < 1e-6), `${m.id} draws at ${h}`).toBe(true);
      }
      if (roof + cap < m.top - 1e-6) belowTop += 1;
    }
    // The pack's roofTop is the model's top, a tag only: the massing stays under it.
    expect(belowTop).toBeGreaterThan(0);
  });

  it('cut in place: the hero up to the cut, the rest to its roof level as hidden dashes, its caps not drawn', () => {
    const m = scene.buildings.find((b) => b.id === 'BLK_501')!;
    const roof = m.ffl[m.ffl.length - 1];
    const cut = m.ffl[2] + 1.2;
    const { v, z } = elevation(m, 225 * DEG);
    const rec = record((ctx) => paintMassing(ctx, v, [m], DESK, { hero: m.id, cut, storeys: true }));
    const drawn = rec.ops.filter((o) => o.name === 'stroke' || o.name === 'fill');
    const solid = drawn.filter((o) => o.state.strokeStyle !== DESK.hidden.color || o.name === 'fill');
    const hidden = drawn.filter((o) => o.name === 'stroke' && o.state.strokeStyle === DESK.hidden.color);
    expect(hidden).toHaveLength(1);
    expect(hidden[0].state.lineDash).toEqual([...DESK.hidden.dash!]);
    expect(Math.max(...solid.flatMap((o) => Recorder.drawn(o).flat().map(z)))).toBeCloseTo(cut, 6);
    const dashed = Recorder.drawn(hidden[0]).flat().map(z);
    expect(Math.min(...dashed)).toBeCloseTo(cut, 6);
    expect(Math.max(...dashed)).toBeCloseTo(roof, 6);
  });
});

// ---- the pen ------------------------------------------------------------------------------------

/** The px length a reveal's strokeTo call traced into the mask. */
const traced = (rec: Recorder): number => rec.named('stroke').reduce((n, o) => n + Recorder.drawn(o).reduce((l, s) => l + length(s), 0), 0);

const step = (pen: PenReveal, t: number) => {
  const rec = new Recorder();
  pen.strokeTo(rec.ctx, t, 3);
  return rec;
};

describe('PenReveal', () => {
  it('measures a plan’s pen order: the footprint, then every room, each closed, in px', () => {
    for (const { id, g } of SHEETS) {
      const paths = planPenPaths(planView(g), g);
      expect(paths).toHaveLength(1 + g.rooms.length);
      const want = (perimeter(g.fp) + g.rooms.reduce((n, r) => n + perimeter(r), 0)) * S;
      expect(new PenReveal(paths, 1).total / want, `${id} ${g.key}`).toBeCloseTo(1, 12);
    }
  });

  it('strokes forward only: a call at or behind its progress draws nothing, and progress never falls', () => {
    const g = sheet('BLK_509', 'TYP');
    const pen = new PenReveal(planPenPaths(planView(g), g), 3);
    let last = 0;
    for (const t of [0, 0.2, 0.2, 0.1, 0.45, -1, 0.9, 1, 1.4, 0.5]) {
      const rec = step(pen, t);
      const want = Math.max(last, Math.min(1, t));
      if (want <= last) expect(rec.ops, `t ${t}`).toHaveLength(0);
      else expect(traced(rec) / ((want - last) * pen.total), `t ${t}`).toBeCloseTo(1, 9);
      expect(pen.progress).toBe(want);
      expect(pen.progress).toBeGreaterThanOrEqual(last);
      last = pen.progress;
    }
    expect(pen.progress).toBe(1);
  });

  it.each([1, 3, 8])('covers the whole pen order exactly once across many calls, with %i pen(s)', (pens) => {
    for (const key of ['L1', 'TYP', 'RF']) {
      const g = sheet('BLK_510', key);
      const pen = new PenReveal(planPenPaths(planView(g), g), pens);
      expect(pen.pens).toBe(pens);
      let sum = 0;
      for (let i = 1; i <= 37; i += 1) sum += traced(step(pen, (i / 37) ** 1.7));
      expect(sum / pen.total).toBeCloseTo(1, 9);
      expect(traced(step(pen, 1))).toBe(0);
    }
  });

  it('with several pens, lays every stretch of every path down once: no gaps, no overlaps, across path ends and zero-length edges', () => {
    // Three straight paths along x at y = 0, 10, 20: arc length is x plus the earlier paths' lengths.
    const paths: PenPaths = [
      new Float64Array([0, 0, 30, 0, 60, 0]),
      new Float64Array([0, 10, 40, 10]),
      new Float64Array([0, 20, 10, 20, 10, 20, 25, 20]),
    ];
    const offset = new Map([[0, 0], [10, 60], [20, 100]]);
    const pen = new PenReveal(paths, 3);
    expect(pen.total).toBe(125);
    const spans: [number, number][] = [];
    for (const t of [0.07, 0.07, 0.31, 0.2, 0.5, 0.77, 0.999, 1, 1.5]) {
      for (const o of step(pen, t).named('stroke')) {
        for (const sub of Recorder.drawn(o)) {
          for (let i = 1; i < sub.length; i += 1) {
            expect(sub[i][1]).toBe(sub[i - 1][1]);
            const base = offset.get(sub[i][1])!;
            spans.push([base + Math.min(sub[i - 1][0], sub[i][0]), base + Math.max(sub[i - 1][0], sub[i][0])]);
          }
        }
      }
    }
    spans.sort((a, b) => a[0] - b[0]);
    expect(spans[0][0]).toBeCloseTo(0, 9);
    for (let i = 1; i < spans.length; i += 1) expect(spans[i][0]).toBeCloseTo(spans[i - 1][1], 9);
    expect(spans[spans.length - 1][1]).toBeCloseTo(125, 9);
    expect(spans.reduce((n, [a, b]) => n + (b - a), 0)).toBeCloseTo(125, 9);
  });

  it('strokes the mask solid and undashed with round caps at the given width, and restores the mask’s state', () => {
    const g = sheet('BLK_501', 'L1');
    const pen = new PenReveal(planPenPaths(planView(g), g), 2);
    const rec = new Recorder();
    pen.strokeTo(rec.ctx, 0.5, 4.5);
    const strokes = rec.named('stroke');
    expect(strokes).toHaveLength(1);
    expect(strokes[0].state).toMatchObject({
      globalCompositeOperation: 'source-over', lineDash: [], lineCap: 'round', lineJoin: 'round', lineWidth: 4.5,
    });
    expect(rec.named('beginPath')).toHaveLength(1);
    expect(rec.pristine).toBe(true);
  });
});
