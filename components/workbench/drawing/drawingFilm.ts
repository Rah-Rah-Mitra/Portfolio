import { onGpuClaimChange, isGpuClaimed } from '../../../lib/gpuClaim';
import { motionHalted, onMotionChange } from '../../../lib/motion';
import { chipBox, drawingArea, placePlan, type PlanPlacement } from '../../../lib/drawings/compose';
import { decodeSheet, type SheetGeometry } from '../../../lib/drawings/decode';
import { drawInMs, ease, EFFECT_MS, HOLD_MS, penCount, window01 } from '../../../lib/drawings/effects';
import { inksFor, type DrawingTokens, type InkMode, type Inks } from '../../../lib/drawings/ink';
import { geometryLabels, placeGeometryLabel, roomLabels, type Label, type Measure } from '../../../lib/drawings/labels';
import type { Box, Region } from '../../../lib/drawings/occupancy';
import {
  linksOf, paintCropMarks, paintDimension, paintJambs, paintLinks, paintMassing, paintPlanLines, paintPlate, paintPoche,
  paintRuleIn, paintRuler, paintSite, paintTreads, planDimensions, rulerTicks, shiftView, viewOf, type Dimension,
  type View,
} from '../../../lib/drawings/paint';
import { AXO_PHI, AXO_PSI, fitOrtho, lerpPose, project, type Frame, type Pose } from '../../../lib/drawings/project';
import { massingPenPaths, planPenPaths, PenReveal, sitePenPaths } from '../../../lib/drawings/reveal';
import { aerialLayout, paintAerial, type Scene } from '../../../lib/drawings/scene';
import { Scheduler, type Step } from '../../../lib/drawings/schedule';
import {
  CHIP_QUALIFIER, chipNotes, chipTitle, deskCycle, fflText, HERO_ORDER, plateLines, readingCycle, sheetsFor, type ChipFacts,
  type PlateState, type SheetDef, type Shot,
} from '../../../lib/drawings/sequence';
import type { DeskSnapshot } from '../../../lib/drawings/deskWatch';
import type { DrawingSheet } from '../../../lib/drawings/types';
import { SHEET_LOADERS } from '../../../lib/drawings/sheetLoaders.generated';

// The desk drawing set's film (docs/portfolio/desk-drawing-set.md §1, §2, §5): the
// only part of the drawing that animates, loaded only when the drawing may move.
// It plays the sequence (lib/drawings/sequence.ts) on the scheduler
// (lib/drawings/schedule.ts): acts request frames, holds sleep on one timer, and
// at rest — a hold, a halt, a freeze — nothing is pending at all.
//
// It subscribes to the GPU claim, the motion switches and page visibility itself,
// so the Estate window taking the GPU, "Pause all motion" or a hidden tab stop it
// synchronously, before React re-renders anything; the FX fields (one ambient
// motion at a time) come in through setFx.

export interface FilmHost {
  canvas: HTMLCanvasElement;
  labels: HTMLElement;
  chip: HTMLElement;
  setPlate(lines: [string, string] | null): void;
  setAttrs(attrs: Record<string, string | undefined>): void;
  tokens: DrawingTokens;
  measure: Measure;
  /** The sheet chip's height, px, for these lines at this max width (DrawingField measures it with the chip's own metrics). */
  chipHeight(lines: readonly string[], width: number): number;
  scene: Scene;
  credit: string;
  startHero: number;
  onWarn(error: unknown): void;
}

export interface Film {
  setDesk(snapshot: DeskSnapshot): void;
  setFx(fx: boolean): void;
  input(): void;
  dispose(): void;
}

const MAX_BACKING = 2_400_000;
const MASK_WIDTH = 3.4;

interface Run {
  /** The arrival at `ms` (0 … arrive). */
  arrive(ms: number): void;
  /** The finished sheet at `alpha` (the hold and the exit's fade). */
  finished(alpha: number): void;
  /** Its labels, shown once it has arrived. */
  labels: Label[];
}

interface Layout {
  region: Region;
  /** The canvas's rectangle (desk px) = the region. */
  canvas: Box;
  chip: Box;
  plan: PlanPlacement | null;
  site: PlanPlacement | null;
  /** The 3D sheets' area (desk px). */
  area: Box;
}

export const createFilm = (host: FilmHost): Film => {
  const { canvas, scene } = host;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('drawing film: no 2D context');
  const cache = { lines: document.createElement('canvas'), mask: document.createElement('canvas') };
  let dpr = 1;
  /** The device pixel ratio the backing store was last sized for. */
  let sizedFor = 0;
  let desk: DeskSnapshot | null = null;
  let layout: Layout | null = null;
  let mode: 'desk' | 'reading' = 'reading';
  let inkMode: InkMode = 'reading';
  let inks: Inks = inksFor(host.tokens, inkMode);
  let hero = host.startHero % HERO_ORDER.length;
  let cycle: Shot[] = [];
  let cursor = -1;
  let welcomed = false;
  let opened = false;
  let queue: Step[] = [];
  let run: Run | null = null;
  let shot: Shot | null = null;
  let sheetDef: SheetDef | null = null;
  let disposed = false;
  let fx = false;
  let slow = false;
  const frameTimes: number[] = [];
  let lastFrame = 0;
  // The previous shot's view, which a camera move starts from.
  let lastView: View | null = null;
  const sheets = new Map<string, Map<string, SheetGeometry>>();
  const loading = new Map<string, Promise<void>>();

  // ---- canvas ---------------------------------------------------------------------------

  const local = (b: Box): Frame => ({ x: b.x - (layout?.canvas.x ?? 0), y: b.y - (layout?.canvas.y ?? 0), w: b.w, h: b.h });
  /** The whole canvas, less a little margin: where labels and leaders may stand. */
  const canvasBounds = (): Frame => ({ x: 4, y: 4, w: (layout?.canvas.w ?? 0) - 8, h: (layout?.canvas.h ?? 0) - 8 });

  const sizeCanvas = (box: Box, deviceRatio: number) => {
    let d = Math.min(deviceRatio, 2);
    if (box.w * box.h * d * d > MAX_BACKING) d = Math.max(Math.min(deviceRatio, 1), Math.sqrt(MAX_BACKING / (box.w * box.h)));
    dpr = d;
    sizedFor = deviceRatio;
    canvas.style.left = `${box.x}px`;
    canvas.style.top = `${box.y}px`;
    canvas.style.width = `${box.w}px`;
    canvas.style.height = `${box.h}px`;
    const w = Math.max(1, Math.round(box.w * d));
    const h = Math.max(1, Math.round(box.h * d));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  };

  const prepare = (c: CanvasRenderingContext2D) => {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  };

  const clear = (c: CanvasRenderingContext2D = ctx) => {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    prepare(c);
  };

  const cacheCtx = (which: 'lines' | 'mask'): CanvasRenderingContext2D => {
    const c = cache[which];
    if (c.width !== canvas.width) c.width = canvas.width;
    if (c.height !== canvas.height) c.height = canvas.height;
    const cc = c.getContext('2d')!;
    clear(cc);
    return cc;
  };

  const releaseCaches = () => {
    for (const c of Object.values(cache)) { c.width = 0; c.height = 0; }
  };

  const blit = (source: HTMLCanvasElement, alpha = 1) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  };

  /** The lines cache shown only where the pen mask has passed. */
  const blitMasked = () => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cache.mask, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(cache.lines, 0, 0);
    ctx.restore();
  };

  // ---- text ------------------------------------------------------------------------------

  const showLabels = (labels: readonly Label[]) => {
    const host2 = host.labels;
    host2.replaceChildren();
    if (!layout) return;
    for (const l of labels) {
      const span = document.createElement('span');
      span.className = `wb-drawing-label wb-drawing-label-${l.kind}`;
      span.textContent = l.text;
      span.style.left = `${l.x + layout.canvas.x}px`;
      span.style.top = `${l.y + layout.canvas.y}px`;
      host2.append(span);
    }
  };

  /** The leaders of labels that stand beside what they describe. */
  const paintLeaders = (labels: readonly Label[]) => {
    const withLeader = labels.filter((l) => l.leader);
    if (!withLeader.length) return;
    ctx.save();
    ctx.strokeStyle = inks.leader.color;
    ctx.lineWidth = inks.leader.width;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const l of withLeader) {
      const [x, y] = l.leader!;
      const ex = Math.min(Math.max(x, l.x), l.x + l.w);
      const ey = Math.min(Math.max(y, l.y), l.y + l.h);
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
    }
    ctx.stroke();
    ctx.restore();
  };

  const setChip = (lines: string[] | null) => {
    const chip = host.chip;
    if (!lines || !layout) {
      chip.hidden = true;
      chip.replaceChildren();
      return;
    }
    chip.hidden = false;
    chip.style.left = `${layout.chip.x}px`;
    chip.style.top = `${layout.chip.y}px`;
    chip.style.maxWidth = `${layout.chip.w}px`;
    chip.replaceChildren(...lines.map((text, i) => {
      const div = document.createElement('div');
      div.className = i === 0 ? 'wb-drawing-chip-title' : 'wb-drawing-chip-line';
      div.textContent = text;
      return div;
    }));
  };

  const plateState = (): PlateState => {
    if (scheduler.phase === 'rest') return 'AT REST';
    if (!scheduler.isRunning) return isGpuClaimed() || document.hidden ? 'HELD' : 'STILL';
    return 'LIVE';
  };

  const syncPlate = () => {
    if (!layout || !run) { host.setPlate(null); return; }
    const site = scene.sites.find((s) => s.id === HERO_ORDER[hero]) ?? null;
    host.setPlate(plateLines(shot?.id === 'W' ? null : site, shot?.id === 'W' ? null : sheetDef, plateState()));
  };

  // ---- data ------------------------------------------------------------------------------

  const heroId = () => HERO_ORDER[hero];
  const heroSite = () => scene.sites.find((s) => s.id === heroId())!;
  const heroMassing = () => scene.buildings.find((b) => b.id === heroId())!;

  const loadSheets = (id: string): Promise<void> => {
    if (sheets.has(id)) return Promise.resolve();
    const pending = loading.get(id);
    if (pending) return pending;
    const site = scene.sites.find((s) => s.id === id)!;
    const promise = SHEET_LOADERS[id]().then((mod) => {
      if (disposed) return;
      const map = new Map<string, SheetGeometry>();
      for (const sheet of mod.SHEETS as readonly DrawingSheet[]) map.set(sheet.key, decodeSheet(site, sheet));
      sheets.set(id, map);
      if (id === heroId()) heroSheetsArrived();
    }).catch((error) => {
      loading.delete(id);
      host.onWarn(error);
    });
    loading.set(id, promise);
    return promise;
  };

  const sheetOf = (key: string | null): SheetGeometry | null => (key ? sheets.get(heroId())?.get(key) ?? null : null);
  /** The plan S8 cuts into the hero's aerial. */
  const cutPlan = () => sheetOf('TYP') ?? sheetOf('L2');

  /**
   * A film that may not move, sitting on the wait for sheets that are here, has no
   * timer to end it: it shows the first sheet's end state now, in one paint, with
   * no frame and no timer. Called when the sheets arrive, and when a halt or freeze
   * lands on a wait whose sheets came in while the film still ran.
   */
  const leaveWait = () => {
    const waiting = scheduler.step?.id === 'wait' && !scheduler.isRunning && (scheduler.phase === 'still' || scheduler.phase === 'hold');
    if (waiting && sheets.has(heroId())) scheduler.restart();
  };

  /** The hero's sheets are here: its plans can be placed, and a held film goes on from its wait. */
  const heroSheetsArrived = () => {
    if (!layout) return;
    layout = layoutFor(layout.region);
    leaveWait();
  };

  // ---- layout ----------------------------------------------------------------------------

  /** The chip's lines for a sheet, or for the welcome (`def` null), as `lay` places it. */
  const chipLines = (def: SheetDef | null, lay: Layout): string[] => {
    const site = heroSite();
    if (!def) {
      // Registered to the Estate window's still only where the welcome stands in exactly its rectangle;
      // the fallback frame is the whole poster.
      const aerial = sheetsFor(site).find((d) => d.kind === 'aerial')!;
      const registered = welcomeFrame(lay)?.registered ?? false;
      return ['SAMPLE TOWN N5 · 07 AERIAL NE · POSTER CAMERA', chipNotes(site, aerial, { registered }), host.credit, CHIP_QUALIFIER];
    }
    const g = sheetOf(def.key);
    const plan = lay.plan;
    let facts: ChipFacts = {};
    if (def.kind === 'site') facts = { squareM: lay.site ? 24 / lay.site.scale : undefined };
    else if (def.kind === 'plan') {
      facts = { squareM: plan ? 24 / plan.scale : undefined, northRight: plan ? Math.abs(plan.psi - Math.PI) < 0.01 : false, lots: g?.lots, partial: g?.partial, openAir: (g?.ext.size ?? 0) > 0 };
    } else if (def.kind === 'aerial') {
      // The crop the sheet draws (aerialRun's own layout), and on the desk (S8) the hero's plan cut into it.
      facts = { crop: aerialLayout(scene, lay.area, heroId()).crop, cut: mode === 'desk' && cutPlan() !== null };
    }
    return [chipTitle(site, def), chipNotes(site, def, facts), host.credit, CHIP_QUALIFIER];
  };

  /** The tallest chip the hero's cycle shows in `lay`: every sheet with its own facts, and the welcome while it is still to come. */
  const tallestChip = (lay: Layout): number => {
    const shown: (SheetDef | null)[] = [...sheetsFor(heroSite())];
    if (mode === 'desk' && !welcomed) shown.push(null);
    return Math.max(...shown.map((def) => host.chipHeight(chipLines(def, lay), lay.chip.w)));
  };

  const layoutFor = (region: Region): Layout => {
    const chipW = Math.min(region.w - 16, 420);
    // The chip's band is the tallest chip the cycle will show here, and what a
    // chip says (its scale, its crop) depends on the room the band leaves; a taller
    // band only lowers a scale, so a fixed point settles it, in two rounds as a rule.
    let chipH = 0;
    for (let round = 0; ; round += 1) {
      const lay = layoutWith(region, chipW, chipH);
      const need = tallestChip(lay);
      if (need <= chipH) return lay;
      // Unsettled after four: the chip still gets the band its own facts need.
      if (round === 3) return { ...lay, chip: chipBox(region, need) };
      chipH = need;
    }
  };

  const layoutWith = (region: Region, chipW: number, chipH: number): Layout => {
    const site = heroSite();
    const bands = { chip: chipH + 8, chipWidth: chipW, dims: true };
    const g = sheets.get(site.id)?.values().next().value as SheetGeometry | undefined;
    let plan: PlanPlacement | null = null;
    if (g) {
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (let i = 0; i < g.fp.length; i += 2) { x0 = Math.min(x0, g.fp[i]); x1 = Math.max(x1, g.fp[i]); y0 = Math.min(y0, g.fp[i + 1]); y1 = Math.max(y1, g.fp[i + 1]); }
      plan = placePlan([region], { x0, y0, x1, y1 }, bands, desk?.h ?? region.y + region.h, 2.4);
    }
    const e = scene.extent;
    const sitePlacement = placePlan([region], e, { chip: chipH + 8, chipWidth: chipW, dims: false }, desk?.h ?? region.y + region.h, 0.6);
    return {
      region,
      canvas: { x: region.x, y: region.y, w: region.w, h: region.h },
      chip: chipBox(region, chipH),
      plan,
      site: sitePlacement,
      area: drawingArea(region, { chip: chipH + 8, chipWidth: chipW, dims: false }),
    };
  };

  // ---- the shots ------------------------------------------------------------------------------

  const at = () => heroMassing().at;
  /** A view of block-local geometry at the hero's place in the estate. */
  const blockView = (v: View) => shiftView(v, at()[0], at()[1]);

  /** The plan placement's pose in the estate frame. */
  const planPoseEstate = (): Pose | null => {
    if (!layout?.plan) return null;
    const p = layout.plan.pose;
    return { ...p, cx: p.cx + at()[0], cy: p.cy + at()[1] };
  };

  const planViewLocal = (): View | null => (layout?.plan ? viewOf(layout.plan.pose, local(layout.plan.area)) : null);
  const siteView = (): View | null => (layout?.site ? viewOf(layout.site.pose, local(layout.site.area)) : null);

  interface PlanParts { g: SheetGeometry; v: View; dims: { dim: Dimension; label: Label }[]; labels: Label[] }

  const planParts = (g: SheetGeometry): PlanParts | null => {
    const v = planViewLocal();
    if (!v) return null;
    const labels: Label[] = [];
    const dims: { dim: Dimension; label: Label }[] = [];
    for (const dim of planDimensions(g, v)) {
      const mx = (dim.a[0] + dim.b[0]) / 2 + dim.off[0] * dim.dist;
      const my = (dim.a[1] + dim.b[1]) / 2 + dim.off[1] * dim.dist;
      const p = [0, 0];
      if (!project(v.pose, v.b, v.frame, mx, my, 0, p)) continue;
      const label = placeGeometryLabel(dim.text, { x0: p[0] - 2, y0: p[1] - 2, x1: p[0] + 2, y1: p[1] + 2 }, v, host.measure, labels, canvasBounds());
      // A dimension whose value cannot be placed is not drawn.
      if (!label) continue;
      dims.push({ dim, label });
      labels.push(label);
    }
    labels.push(...roomLabels(g, v, host.measure, undefined, labels));
    labels.push(...geometryLabels(g, v, host.measure, labels, canvasBounds()));
    return { g, v, dims, labels };
  };

  const paintLinesCache = (g: SheetGeometry, v: View) => {
    const lc = cacheCtx('lines');
    paintPlanLines(lc, v, g, inks);
  };

  /** A plan sheet's finished layers, with each layer's share. */
  const planFinished = (parts: PlanParts, a: { poche?: number; lines?: number; jambs?: number; treads?: number; dims?: number; alpha?: number } = {}) => {
    const alpha = a.alpha ?? 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    paintPoche(ctx, parts.v, parts.g, inks, 0, a.poche ?? 1);
    ctx.restore();
    blit(cache.lines, alpha * (a.lines ?? 1));
    ctx.save();
    ctx.globalAlpha = alpha;
    paintJambs(ctx, parts.v, parts.g, inks, 0, a.jambs ?? 1);
    paintTreads(ctx, parts.v, parts.g, inks, 0, a.treads ?? Infinity);
    parts.dims.forEach(({ dim }) => paintDimension(ctx, parts.v, dim, inks, a.dims ?? 1));
    ctx.restore();
  };

  const planRun = (g: SheetGeometry, kind: 'flood' | 'drawIn' | 'wipe', arrive: number, reading: boolean): Run | null => {
    const parts = planParts(g);
    if (!parts) return null;
    paintLinesCache(g, parts.v);
    const finishedAll = (alpha: number) => { clear(); planFinished(parts, { alpha }); if (alpha >= 1) paintLeaders(parts.labels); };
    if (kind === 'flood') {
      // E6 POCHÉ FLOOD from the lifts, then E4 the outlines and jambs, then E8 the treads.
      const landing = g.lifts[0] ?? null;
      const centre = [0, 0];
      const p = landing ? [landing.x, landing.y] : [(g.fp[0] + g.fp[4]) / 2, (g.fp[1] + g.fp[5]) / 2];
      project(parts.v.pose, parts.v.b, parts.v.frame, p[0], p[1], 0, centre);
      const reach = Math.hypot(parts.v.frame.w, parts.v.frame.h);
      const flood = reading ? arrive * 0.5 : EFFECT_MS.pocheFlood;
      return {
        labels: parts.labels,
        finished: finishedAll,
        arrive(ms) {
          clear();
          ctx.save();
          ctx.beginPath();
          ctx.arc(centre[0], centre[1], reach * ease.outQuart(ms / flood), 0, Math.PI * 2);
          ctx.clip();
          paintPoche(ctx, parts.v, g, inks);
          ctx.restore();
          const outline = ease.outCubic(window01(ms, flood, flood + 600));
          blit(cache.lines, outline);
          paintJambs(ctx, parts.v, g, inks, 0, outline);
          const treadStart = flood + 300;
          paintTreads(ctx, parts.v, g, inks, 0, Math.floor(Math.max(0, ms - treadStart) / EFFECT_MS.riser));
          parts.dims.forEach(({ dim }) => paintDimension(ctx, parts.v, dim, inks, window01(ms, arrive - 400, arrive)));
          if (ms >= arrive) paintLeaders(parts.labels);
        },
      };
    }
    if (kind === 'wipe') {
      // E5 SCAN WIPE along the sheet's long axis.
      const f = parts.v.frame;
      const horizontal = f.w >= f.h;
      return {
        labels: parts.labels,
        finished: finishedAll,
        arrive(ms) {
          clear();
          const t = ease.sine(ms / arrive);
          ctx.save();
          ctx.beginPath();
          if (horizontal) ctx.rect(f.x - 40, f.y - 60, (f.w + 80) * t, f.h + 120);
          else ctx.rect(f.x - 60, f.y - 40, f.w + 120, (f.h + 80) * t);
          ctx.clip();
          planFinished(parts);
          ctx.restore();
          if (ms >= arrive) paintLeaders(parts.labels);
        },
      };
    }
    // E2 DRAW-IN, then the wall fill and jambs fade in, the treads tick in, the dimensions run out.
    const drawIn = reading ? Math.min(arrive - 600, 1400) : Math.min(drawInMs(g.rooms.length), arrive - 636);
    const paths = planPenPaths(parts.v, g);
    const reveal = new PenReveal(paths, 1);
    const pens = penCount(reveal.total, drawIn);
    const pen = new PenReveal(paths, pens);
    const mask = cacheCtx('mask');
    return {
      labels: parts.labels,
      finished: finishedAll,
      arrive(ms) {
        if (ms < drawIn) {
          if (ms > 0) pen.strokeTo(mask, ms / drawIn, MASK_WIDTH);
          clear();
          blitMasked();
          return;
        }
        clear();
        const after = ms - drawIn;
        planFinished(parts, {
          poche: ease.outCubic(after / 300),
          jambs: ease.outCubic(after / 300),
          treads: Math.floor(after / EFFECT_MS.riser),
          dims: 0,
        });
        parts.dims.forEach(({ dim }, i) => paintDimension(ctx, parts.v, dim, inks, window01(after, i * EFFECT_MS.dimensionStagger, i * EFFECT_MS.dimensionStagger + EFFECT_MS.dimension)));
        if (ms >= arrive) paintLeaders(parts.labels);
      },
    };
  };

  const siteLabels = (v: View): Label[] => {
    const out: Label[] = [];
    const m = heroMassing();
    const p = [0, 0];
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (let i = 0; i < m.fp.length; i += 2) {
      if (!project(v.pose, v.b, v.frame, m.fp[i], m.fp[i + 1], 0, p)) continue;
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    const name = placeGeometryLabel(m.short, { x0, y0, x1, y1 }, v, host.measure, out);
    if (name) out.push({ ...name, kind: 'unit' });
    const e = scene.extent;
    project(v.pose, v.b, v.frame, e.x0, e.y1, 0, p);
    const extent = placeGeometryLabel('ESTATE EXTENT 400 × 400 M', { x0: p[0] + 6, y0: p[1] + 6, x1: p[0] + 400, y1: p[1] + 26 }, v, host.measure, out);
    if (extent) out.push({ ...extent, leader: null });
    return out;
  };

  const siteRun = (arrive: number, liftFrom: View | null): Run | null => {
    const v = siteView();
    if (!v) return null;
    const labels = siteLabels(v);
    const lc = cacheCtx('lines');
    paintSite(lc, v, { extent: scene.extent, kerbs: scene.kerbs, buildings: scene.buildings }, inks, { hero: heroId(), extent: false });
    const finished = (alpha: number) => {
      clear();
      ctx.save();
      ctx.globalAlpha = alpha;
      paintSite(ctx, v, { extent: scene.extent, kerbs: scene.kerbs, buildings: scene.buildings }, inks, { hero: heroId(), lid: 1 });
      ctx.restore();
    };
    if (liftFrom) {
      // E18 LIFT TO PLAN: the aerial's camera rises to straight down, the estate flattening into its plan.
      return {
        labels,
        finished,
        arrive(ms) {
          const t = ease.cubic(ms / arrive);
          if (t >= 1 || slow) { finished(1); return; }
          clear();
          const view = viewOf(lerpPose(liftFrom.pose, v.pose, t), lerpFrame(liftFrom.frame, v.frame, t));
          paintSite(ctx, view, { extent: scene.extent, kerbs: scene.kerbs, buildings: [] }, inks, { hero: null });
          paintMassing(ctx, view, scene.buildings, inks, { hero: heroId(), zScale: 1 - t, faces: 1 - t, storeys: false });
        },
      };
    }
    const reveal = new PenReveal(sitePenPaths(v, scene.buildings, scene.kerbs), 4);
    const mask = cacheCtx('mask');
    const corner: [number, number] = [v.frame.x + v.frame.w, v.frame.y + v.frame.h];
    return {
      labels,
      finished,
      arrive(ms) {
        const draw = arrive - EFFECT_MS.fadeIn + 100;
        if (ms > 0) reveal.strokeTo(mask, ms / draw, MASK_WIDTH);
        clear();
        blitMasked();
        paintRuleIn(ctx, v, scene.extent, inks, ease.sine(ms / EFFECT_MS.ruleIn), corner);
        const lid = ease.outCubic(window01(ms, arrive - 300, arrive));
        if (lid > 0) paintSite(ctx, v, { extent: scene.extent, kerbs: [], buildings: scene.buildings.filter((b) => b.id === heroId()) }, inks, { hero: heroId(), lid, extent: false, context: 0 });
        if (ms >= arrive) finished(1);
      },
    };
  };

  /** E9 DOLLY: the site plan's camera closes on the hero, the estate fading over the first 60 %. */
  const dollyRun = (arrive: number, back: boolean): Run | null => {
    const from = siteView();
    const toPose = planPoseEstate();
    if (!from || !toPose || !layout?.plan) return null;
    const to = viewOf(toPose, local(layout.plan.area));
    const [a, b] = back ? [lastView ?? to, from] : [from, to];
    const paint = (t: number) => {
      clear();
      const view = viewOf(lerpPose(a.pose, b.pose, t), lerpFrame(a.frame, b.frame, t));
      const context = back ? window01(t, 0.4, 1) : 1 - window01(t, 0, 0.6);
      paintSite(ctx, view, { extent: scene.extent, kerbs: scene.kerbs, buildings: scene.buildings }, inks, { hero: heroId(), context, lid: back ? t : 1 - t });
    };
    return { labels: [], finished: () => paint(1), arrive: (ms) => paint(slow ? 1 : ease.cubic(ms / arrive)) };
  };

  // 3D: the hero's plates, exploded and closed, its block, the estate.

  const heroPlates = (): { g: SheetGeometry; key: string; z: number }[] => {
    const site = heroSite();
    return site.sheets.map((key, i) => ({ g: sheetOf(key)!, key, z: i })).filter((p) => p.g);
  };

  const gap = (): number => {
    const m = heroMassing();
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (let i = 0; i < m.fp.length; i += 2) { x0 = Math.min(x0, m.fp[i]); x1 = Math.max(x1, m.fp[i]); y0 = Math.min(y0, m.fp[i + 1]); y1 = Math.max(y1, m.fp[i + 1]); }
    return Math.min(40, Math.max(12, 0.5 * Math.max(x1 - x0, y1 - y0)));
  };

  const fitHero = (zTop: number): View | null => {
    if (!layout) return null;
    const m = heroMassing();
    const pts: number[] = [];
    for (let i = 0; i < m.fp.length; i += 2) pts.push(m.fp[i], m.fp[i + 1], 0, m.fp[i], m.fp[i + 1], zTop);
    const f = local(layout.area);
    return viewOf(fitOrtho(AXO_PSI, AXO_PHI, pts, f.w / f.h, 0.08), f);
  };

  /** A view's 3D px/m (for the plans-only rule). */
  const scaleOf = (v: View | null) => (v ? v.frame.h / (2 * v.pose.k) : 0);

  const plateTag = (key: string): string => {
    const site = heroSite();
    if (key === 'TYP') {
      const s = sheetsFor(site).find((d) => d.key === 'TYP')!;
      return s.title.replace(/^\d+ (TYPICAL|DECK) PLAN /, '').replace(/ · FFL .*$/, '');
    }
    const index = site.sheets.indexOf(key);
    const storey = [...site.plan].indexOf(String(index));
    return `${key} ${fflText(site.ffl[storey] / 100)}`;
  };

  const plateLabels = (v: View, plates: { g: SheetGeometry; key: string; z: number }[], zOf: (i: number) => number): Label[] => {
    const out: Label[] = [];
    const p = [0, 0];
    plates.forEach((plate, i) => {
      let left = Infinity; let y = 0;
      for (let k = 0; k < plate.g.fp.length; k += 2) {
        if (!project(v.pose, v.b, v.frame, plate.g.fp[k] + at()[0], plate.g.fp[k + 1] + at()[1], zOf(i), p)) continue;
        if (p[0] < left) { left = p[0]; y = p[1]; }
      }
      const label = placeGeometryLabel(plateTag(plate.key), { x0: left - 60, y0: y - 2, x1: left - 56, y1: y + 2 }, v, host.measure, out);
      if (label) out.push(label);
    });
    return out;
  };

  const explodedRun = (arrive: number, reading: boolean): Run | null => {
    const plates = heroPlates();
    if (!plates.length || !layout) return null;
    const G = gap();
    const top = (plates.length - 1) * G;
    const end = fitHero(top);
    if (!end) return null;
    const startView = reading ? end : lastView ?? end;
    const links = linksOf(plates.map((p) => p.g));
    const labels = plateLabels(end, plates, (i) => i * G);
    const draw = (pose: Pose, frame: Frame, u: number, fade: number, link: number, alpha = 1) => {
      clear();
      const v = blockView(viewOf(pose, frame));
      plates.forEach((plate, i) => {
        const isTop = i === plates.length - 1;
        paintPlate(ctx, v, plate.g, inks, { z: i * G * u, detail: true, alpha: alpha * (isTop || reading ? 1 : fade) });
      });
      paintLinks(ctx, v, links, inks, 0, top * u, link, alpha);
    };
    const finished = (alpha: number) => draw(end.pose, end.frame, 1, 1, 1, alpha);
    return {
      labels,
      finished,
      arrive(ms) {
        if (slow) { finished(1); return; }
        if (reading) {
          draw(end.pose, end.frame, ease.cubic(ms / arrive), 1, window01(ms, arrive * 0.7, arrive));
          return;
        }
        const tilt = ease.cubic(ms / EFFECT_MS.tilt);
        const pose = lerpPose(startView.pose, end.pose, tilt);
        const frame = lerpFrame(startView.frame, end.frame, tilt);
        draw(pose, frame, ease.cubic(window01(ms, 800, EFFECT_MS.tilt)), window01(ms / EFFECT_MS.tilt, 0.2, 0.7), ease.outQuad(window01(ms, EFFECT_MS.tilt, EFFECT_MS.tilt + EFFECT_MS.link)));
      },
    };
  };

  const blockRun = (arrive: number, reading: boolean): Run | null => {
    const plates = heroPlates();
    if (!plates.length || !layout) return null;
    const site = heroSite();
    const m = heroMassing();
    const ffl = m.ffl;
    const roof = ffl[ffl.length - 1];
    const capTop = roof + Math.max(0, ...m.caps.map((c) => c.h));
    const end = fitHero(capTop);
    if (!end) return null;
    const G = gap();
    const startView = reading ? end : lastView ?? end;
    const links = linksOf(plates.map((p) => p.g));
    const typ = plates.find((p) => p.key === 'TYP') ?? plates[Math.min(1, plates.length - 1)];
    const typIndex = plates.indexOf(typ);
    const typStoreys = [...site.plan].flatMap((c, i) => (c === String(site.sheets.indexOf(typ.key)) ? [i] : []));
    const first = ffl[typStoreys[0] ?? 1] ?? ffl[1];
    const pitch = typStoreys.length > 1 ? ffl[typStoreys[1]] - ffl[typStoreys[0]] : (ffl[2] ?? roof) - (ffl[1] ?? 0);
    const stamps = typStoreys.map((s) => ffl[s]);
    const rulerAt = (() => {
      let best = 0;
      for (let i = 2; i < m.fp.length; i += 2) if (m.fp[i] + m.fp[i + 1] > m.fp[best] + m.fp[best + 1]) best = i;
      return [m.fp[best] + 2, m.fp[best + 1] + 2];
    })();
    const levelLabels = (v: View): Label[] => {
      const out: Label[] = [];
      const ticks = rulerTicks(v, rulerAt[0], rulerAt[1], ffl);
      const pick = new Set([0, typStoreys[0] ?? 1, typStoreys[typStoreys.length - 1] ?? ffl.length - 2, ffl.length - 1]);
      ticks.forEach(([x, y], i) => {
        if (!pick.has(i)) return;
        const tag = i === ffl.length - 1 ? 'RF' : `L${i + 1}`;
        const label = placeGeometryLabel(`${tag} ${fflText(ffl[i])}`, { x0: x + 2, y0: y - 1, x1: x + 4, y1: y + 1 }, v, host.measure, out, canvasBounds());
        if (label) out.push({ ...label, leader: null });
      });
      return out;
    };
    const labels = levelLabels(end);
    const draw = (v0: View, phase: { close: number; extrude: number; stack: number; silhouette: number; ruler: number; links: number }, alpha = 1) => {
      clear();
      const v = blockView(v0);
      ctx.save();
      ctx.globalAlpha = alpha;
      const plateAlpha = 1 - phase.silhouette;
      if (plateAlpha > 0) {
        // The plates close onto the block's first storeys.
        const zClosed = (i: number) => (i === 0 ? 0 : i === typIndex ? first : first + pitch);
        const zOf = (i: number) => i * G * (1 - phase.close) + zClosed(i) * phase.close;
        // Stamps: the typical storey printed up the block, the roof riding on top.
        const shown = Math.floor(phase.stack * (stamps.length - 1) + 1e-6);
        plates.forEach((plate, i) => {
          if (i === typIndex) {
            for (let k = 0; k <= shown; k += 1) {
              const z = k === 0 ? zOf(i) : stamps[k];
              paintPlate(ctx, v, plate.g, inks, { z, detail: k === shown, alpha: plateAlpha });
            }
            if (phase.extrude > 0 && phase.extrude < 1) {
              // E13: the typical storey's outline rises through one storey's pitch, to the next level.
              const z = zOf(i);
              ctx.save();
              ctx.globalAlpha = plateAlpha;
              paintPlate(ctx, v, plate.g, inks, { z: z + pitch * phase.extrude, detail: false, alpha: 0.6 });
              ctx.restore();
            }
          } else if (i === plates.length - 1 && i !== 0) {
            const lid = shown > 0 ? stamps[shown] + pitch : zOf(i) + (phase.extrude > 0 ? pitch * phase.extrude - pitch * (1 - phase.close) * 0 : 0);
            paintPlate(ctx, v, plate.g, inks, { z: phase.stack >= 1 ? roof : Math.max(zOf(i), lid), detail: true, alpha: plateAlpha });
          } else paintPlate(ctx, v, plate.g, inks, { z: zOf(i), detail: true, alpha: plateAlpha });
        });
        paintLinks(ctx, v, links, inks, 0, (plates.length - 1) * G, 1, phase.links * plateAlpha);
      }
      if (phase.silhouette > 0) {
        ctx.save();
        ctx.globalAlpha = alpha * phase.silhouette;
        paintMassing(ctx, v0, [m], inks, { hero: m.id, storeys: true });
        ctx.restore();
      }
      if (phase.ruler > 0) paintRuler(ctx, v0, rulerAt[0], rulerAt[1], ffl, inks, ffl[0] + (roof - ffl[0]) * phase.ruler);
      ctx.restore();
    };
    const finished = (alpha: number) => {
      draw(end, { close: 1, extrude: 1, stack: 1, silhouette: 1, ruler: 1, links: 0 }, alpha);
      if (alpha >= 1) paintLeaders(labels);
    };
    const stackMs = Math.min(EFFECT_MS.stackMax, EFFECT_MS.stackStorey * Math.max(0, stamps.length - 1));
    return {
      labels,
      finished,
      arrive(ms) {
        if (slow) { finished(1); return; }
        if (reading) {
          const stack = window01(ms, 0, arrive - EFFECT_MS.silhouette);
          draw(end, { close: 1, extrude: 1, stack, silhouette: ease.outCubic(window01(ms, arrive - EFFECT_MS.silhouette, arrive)), ruler: window01(ms, arrive - 200, arrive), links: 0 });
          return;
        }
        const t1 = EFFECT_MS.retract;
        const t2 = t1 + EFFECT_MS.close;
        const t3 = t2 + EFFECT_MS.extrude;
        const t4 = t3 + stackMs;
        const t5 = t4 + EFFECT_MS.silhouette;
        const close = ease.cubic(window01(ms, t1, t2));
        const v = viewOf(lerpPose(startView.pose, end.pose, close), lerpFrame(startView.frame, end.frame, close));
        draw(v, {
          links: 1 - window01(ms, 0, t1),
          close,
          extrude: ease.outCubic(window01(ms, t2, t3)),
          stack: window01(ms, t3, t4),
          silhouette: ease.outCubic(window01(ms, t4, t5)),
          ruler: ease.outCubic(window01(ms, t5, arrive)),
        });
        if (ms >= arrive) paintLeaders(labels);
      },
    };
  };

  const aerialRun = (arrive: number, reading: boolean, welcome: boolean): Run | null => {
    if (!layout) return null;
    const posterFrame = welcome ? welcomeFrame(layout)?.frame ?? null : null;
    const placed = posterFrame ? null : aerialLayout(scene, layout.area, heroId());
    const frame = posterFrame ? local(posterFrame) : local(placed!.view.frame);
    const v = viewOf(scene.posterPose, frame);
    const crop = placed?.crop ?? null;
    const m = heroMassing();
    const labels: Label[] = [];
    {
      const p = [0, 0];
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (let i = 0; i < m.fp.length; i += 2) {
        for (const z of [0, m.ffl[m.ffl.length - 1]]) {
          if (!project(v.pose, v.b, v.frame, m.fp[i], m.fp[i + 1], z, p)) continue;
          x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
        }
      }
      const name = placeGeometryLabel(m.short, { x0, y0: y0 - 24, x1, y1: y0 - 20 }, v, host.measure, labels);
      if (name) labels.push({ ...name, kind: 'unit', leader: null });
    }
    const typ = cutPlan();
    const cut = typ && !welcome ? m.ffl[1] + 1.2 : null;
    const canvasFrame: Frame = { x: 0, y: 0, w: layout.canvas.w, h: layout.canvas.h };
    const finished = (alpha: number) => {
      clear();
      ctx.save();
      ctx.globalAlpha = alpha;
      paintAerial(ctx, v, scene, inks, { hero: m.id, storeys: true, cut: reading ? null : cut });
      if (typ && cut !== null && !reading) paintPlate(ctx, shiftView(v, m.at[0], m.at[1]), typ, inks, { z: cut, detail: true });
      if (!crop && !reading) paintCropMarks(ctx, clipFrame(frame, canvasFrame), inks);
      ctx.restore();
    };
    if (reading || welcome) {
      // E1 RULE-IN ∥ E2 DRAW-IN, the massing revealed nearest first; the welcome then brings up the hero's storeys.
      const lc = cacheCtx('lines');
      paintAerial(lc, v, scene, inks, { hero: m.id, storeys: false });
      const reveal = new PenReveal(massingPenPaths(v, scene.buildings, (b) => b.ffl[b.ffl.length - 1]), 6);
      const mask = cacheCtx('mask');
      const start = welcome ? EFFECT_MS.ruleIn : 0;
      const span = welcome ? 3000 : arrive;
      const corner: [number, number] = [frame.x + frame.w, frame.y + frame.h];
      return {
        labels,
        finished: (alpha) => {
          clear();
          ctx.save();
          ctx.globalAlpha = alpha;
          paintAerial(ctx, v, scene, inks, { hero: m.id, storeys: true });
          ctx.restore();
        },
        arrive(ms) {
          if (ms > start) reveal.strokeTo(mask, (ms - start) / span, MASK_WIDTH * 1.4);
          clear();
          blitMasked();
          paintRuleIn(ctx, v, scene.extent, inks, ease.sine(ms / EFFECT_MS.ruleIn), corner);
          const storeys = welcome ? ease.outCubic(window01(ms, start + span, arrive)) : 0;
          if (storeys > 0) {
            ctx.save();
            ctx.globalAlpha = storeys;
            paintMassing(ctx, v, [m], inks, { hero: m.id, storeys: true });
            ctx.restore();
          }
          if (ms >= arrive) {
            clear();
            paintAerial(ctx, v, scene, inks, { hero: m.id, storeys: true });
          }
        },
      };
    }
    // E16 DOLLY-ZOOM from the block's axonometric into the poster camera, then E17 the cut in place.
    const startView = lastView ?? v;
    return {
      labels,
      finished,
      arrive(ms) {
        if (slow) { finished(1); return; }
        const t = ease.sine(ms / EFFECT_MS.dollyZoom);
        if (ms < EFFECT_MS.dollyZoom) {
          clear();
          const pose = lerpPose(startView.pose, v.pose, t);
          const view = viewOf(pose, lerpFrame(startView.frame, frame, t));
          paintAerial(ctx, view, scene, inks, { hero: m.id, storeys: true, context: window01(t, 0.3, 1) });
          return;
        }
        clear();
        const e = ease.outCubic(window01(ms, EFFECT_MS.dollyZoom, arrive));
        paintAerial(ctx, v, scene, inks, { hero: m.id, storeys: true, cut: e > 0 ? cut : null });
        if (typ && cut !== null) paintPlate(ctx, shiftView(v, m.at[0], m.at[1]), typ, inks, { z: cut, detail: true, alpha: e });
        if (!crop && ms >= arrive) paintCropMarks(ctx, clipFrame(frame, canvasFrame), inks);
      },
    };
  };

  /**
   * Where the welcome stands: in the Estate window's poster rectangle when the
   * region holds 90 % of it (registered to that still), else the whole poster
   * centred in the sheet's area.
   */
  const welcomeFrame = (lay: Layout | null): { frame: Box; registered: boolean } | null => {
    if (!lay || !desk) return null;
    const r = lay.region;
    const p = desk.poster;
    if (p) {
      const ix = Math.max(0, Math.min(p.x + p.w, r.x + r.w) - Math.max(p.x, r.x));
      const iy = Math.max(0, Math.min(p.y + p.h, r.y + r.h) - Math.max(p.y, r.y));
      if (ix * iy >= 0.9 * p.w * p.h) return { frame: p, registered: true };
    }
    const a = lay.area;
    const w = Math.min(a.w, (a.h * 4) / 3);
    const h = (w * 3) / 4;
    return { frame: { x: a.x + (a.w - w) / 2, y: a.y + (a.h - h) / 2, w, h }, registered: false };
  };

  // ---- the sequence -------------------------------------------------------------------------------

  const factsFor = () => {
    const site = heroSite();
    const map = sheets.get(site.id);
    const typ = map?.get('TYP') ?? map?.get('L1');
    const typIndex = site.sheets.indexOf('TYP');
    const typicalCount = typIndex >= 0 ? [...site.plan].filter((c) => c === String(typIndex)).length : 1;
    const l1 = map?.get('L1');
    const view = fitHero(heroMassing().ffl[heroMassing().ffl.length - 1]);
    return {
      typicalRooms: typ?.rooms.length ?? 0,
      typicalCount,
      l1Risers: l1 ? Math.max(0, ...l1.flights.map((f) => f.risers)) : 0,
      plansOnly: scaleOf(view) < 3,
    };
  };

  const newCycle = () => {
    const site = heroSite();
    const facts = factsFor();
    cycle = mode === 'desk' ? deskCycle(site, facts) : readingCycle(site, facts, !opened);
    if (mode === 'reading') opened = true;
    cursor = -1;
    // Prefetch the next building while this one plays.
    void loadSheets(HERO_ORDER[(hero + 1) % HERO_ORDER.length]);
  };

  const makeRun = (s: Shot, def: SheetDef | null): Run | null => {
    const reading = mode === 'reading';
    if (s.id === 'W') return aerialRun(s.arrive, false, true);
    if (s.id === 'S2') return dollyRun(s.arrive, cursor > 2);
    if (!def) return null;
    switch (def.kind) {
      case 'site': return siteRun(s.arrive, s.id === 'S1' && lastView ? lastView : null);
      case 'plan': {
        const g = sheetOf(def.key);
        if (!g) return null;
        const kind = s.id === 'S3' || s.id === 'R2' ? 'flood' : s.id === 'S5' || s.id === 'R4' ? 'wipe' : 'drawIn';
        return planRun(g, kind, s.arrive, reading);
      }
      case 'exploded': return explodedRun(s.arrive, reading);
      case 'block': return blockRun(s.arrive, reading);
      case 'aerial': return aerialRun(s.arrive, reading, false);
      default: return null;
    }
  };

  /** The next shot's steps, or a short wait while its building's sheets load. */
  const nextStep = (): Step | null => {
    if (disposed) return null;
    if (queue.length) return queue.shift()!;
    if (!layout || !desk?.room) return null;
    const id = heroId();
    if (!sheets.has(id)) {
      void loadSheets(id);
      if (!(mode === 'desk' && !welcomed)) return { kind: 'hold', id: 'wait', ms: 300, rest: false };
    }
    // The welcome, once per visit, on the first uncovered desk.
    let s: Shot | null = null;
    if (mode === 'desk' && !welcomed) {
      welcomed = true;
      s = { id: 'W', sheet: -1, arrive: EFFECT_MS.ruleIn + 3000 + 1200, hold: HOLD_MS.welcome, exit: 0 };
    } else {
      if (!cycle.length || cursor >= cycle.length - 1) {
        if (cycle.length) hero = (hero + 1) % HERO_ORDER.length;
        if (!sheets.has(heroId())) { void loadSheets(heroId()); cycle = []; return { kind: 'hold', id: 'wait', ms: 300, rest: false }; }
        layout = layoutFor(layout.region);
        newCycle();
      }
      cursor += 1;
      s = cycle[cursor];
    }
    const site = heroSite();
    const def = s.sheet >= 0 ? sheetsFor(site)[s.sheet] : null;
    let made: Run | null = null;
    try {
      made = makeRun(s, def);
    } catch (error) {
      host.onWarn(error);
    }
    if (!made) {
      // Nothing to draw here (no room at a readable scale): go on.
      return { kind: 'hold', id: `skip:${s.id}`, ms: 0, rest: false };
    }
    // The camera moves start from where the last shot's view stood.
    shot = s;
    sheetDef = def;
    run = made;
    lastView = viewForShot(s, def);
    host.labels.replaceChildren();
    if (s.id !== 'S2') setChip(chipLines(s.id === 'W' ? null : def, layout));
    syncPlate();
    host.setAttrs({ sheet: `${site.id}:${s.id}`, mode });
    const current = made;
    const steps: Step[] = [];
    if (s.arrive > 0) {
      steps.push({
        kind: 'act', id: `${s.id}:arrive`, ms: s.arrive, draw: (ms) => {
          measureFrame();
          current.arrive(ms);
          if (ms >= s.arrive) showLabels(current.labels);
        },
      });
    }
    if (s.hold > 0) steps.push({ kind: 'hold', id: `${s.id}:hold`, ms: s.hold });
    if (s.exit > 0) {
      steps.push({
        kind: 'act', id: `${s.id}:exit`, ms: s.exit, draw: (ms) => {
          // A halt mid-fade paints the act's end: the sheet stays up, finished, under the
          // chip and plate that name it, rather than faded out from under them.
          if (ms >= s.exit && !scheduler.isRunning) {
            current.finished(1);
            showLabels(current.labels);
            return;
          }
          host.labels.replaceChildren();
          current.finished(1 - ease.cubic(ms / s.exit));
        },
      });
    }
    queue = steps;
    return queue.shift() ?? { kind: 'hold', id: 'empty', ms: 0, rest: false };
  };

  /** The view a shot ends on (the next camera move starts there). */
  const viewForShot = (s: Shot, def: SheetDef | null): View | null => {
    if (!layout) return null;
    if (s.id === 'S2') return planPoseEstate() && layout.plan ? viewOf(planPoseEstate()!, local(layout.plan.area)) : null;
    if (s.id === 'W' || def?.kind === 'aerial') {
      const wf = s.id === 'W' ? welcomeFrame(layout)?.frame ?? null : null;
      const placed = aerialLayout(scene, wf ?? layout.area, heroId());
      return viewOf(scene.posterPose, wf ? local(wf) : local(placed.view.frame));
    }
    if (def?.kind === 'site') return siteView();
    if (def?.kind === 'plan') return planPoseEstate() && layout.plan ? viewOf(planPoseEstate()!, local(layout.plan.area)) : null;
    if (def?.kind === 'exploded') {
      const plates = heroPlates();
      return fitHero((plates.length - 1) * gap());
    }
    if (def?.kind === 'block') {
      const m = heroMassing();
      return fitHero(m.ffl[m.ffl.length - 1] + Math.max(0, ...m.caps.map((c) => c.h)));
    }
    return null;
  };

  const measureFrame = () => {
    const now = performance.now();
    if (lastFrame) {
      frameTimes.push(now - lastFrame);
      if (frameTimes.length > 60) frameTimes.shift();
      if (frameTimes.length === 60 && frameTimes.filter((t) => t > 20).length > 15) slow = true;
    }
    lastFrame = now;
  };

  const scheduler = new Scheduler(
    {
      now: () => performance.now(),
      requestFrame: (cb) => requestAnimationFrame(cb),
      cancelFrame: (id) => cancelAnimationFrame(id),
      setTimer: (cb, ms) => window.setTimeout(cb, ms),
      clearTimer: (id) => window.clearTimeout(id),
    },
    () => {
      try {
        return nextStep();
      } catch (error) {
        host.onWarn(error);
        return null;
      }
    },
    (phase) => {
      lastFrame = 0;
      host.setAttrs({ phase });
      syncPlate();
    },
  );

  // ---- activity --------------------------------------------------------------------------------

  const flags = { claimed: isGpuClaimed(), halted: motionHalted(), hidden: document.hidden };
  const readFlags = () => {
    flags.claimed = isGpuClaimed();
    flags.halted = motionHalted();
    flags.hidden = document.hidden;
  };

  const sync = () => {
    if (disposed) return;
    if (flags.halted || fx) scheduler.halt();
    else if (flags.hidden || flags.claimed) scheduler.freeze();
    else scheduler.resume();
    leaveWait();
    syncPlate();
  };

  const stopClaim = onGpuClaimChange(() => { flags.claimed = isGpuClaimed(); sync(); });
  const stopMotion = onMotionChange(() => { flags.halted = motionHalted(); sync(); });
  const onVisibility = () => { flags.hidden = document.hidden; sync(); };
  document.addEventListener('visibilitychange', onVisibility);
  const onInput = () => scheduler.input();
  const inputs = ['pointerdown', 'keydown', 'wheel', 'pointermove'] as const;
  for (const type of inputs) document.addEventListener(type, onInput, { capture: true, passive: true });

  const park = () => {
    clear();
    releaseCaches();
    host.labels.replaceChildren();
    setChip(null);
    run = null;
    host.setPlate(null);
    scheduler.park();
    host.setAttrs({ sheet: undefined });
  };

  const relayoutNow = (snapshot: DeskSnapshot) => {
    const region = snapshot.regions[0];
    const nextMode = snapshot.windowsOpen ? 'reading' : 'desk';
    // Back from a park the canvas is blank, so even the same place is a new one; and a
    // new pixel ratio (the window taken to another screen) needs a new backing store
    // where nothing on the desk moved.
    const parked = scheduler.phase === 'park';
    const changed = parked || nextMode !== mode || !layout || snapshot.dpr !== sizedFor || layout.region.x !== region.x
      || layout.region.y !== region.y || layout.region.w !== region.w || layout.region.h !== region.h;
    if (!changed) return;
    const restart = nextMode !== mode || !layout;
    mode = nextMode;
    inkMode = mode;
    inks = inksFor(host.tokens, inkMode);
    layout = layoutFor(region);
    sizeCanvas(layout.canvas, snapshot.dpr);
    // The caches follow the backing store: the run the restart makes draws them afresh.
    releaseCaches();
    host.setAttrs({ mode });
    // A new place or a new way of watching: the building's cycle starts over there.
    queue = [];
    if (restart) { cycle = []; cursor = -1; } else cursor = Math.max(-1, cursor - 1);
    lastView = null;
    if (parked) {
      // Whether it may move now: a film parked before it ever started was never told.
      readFlags();
      sync();
      scheduler.unpark();
    } else scheduler.restart();
  };

  return {
    setDesk(snapshot) {
      if (disposed) return;
      desk = snapshot;
      if (!snapshot.room) { park(); return; }
      if (scheduler.phase === 'idle') {
        mode = snapshot.windowsOpen ? 'reading' : 'desk';
        inkMode = mode;
        inks = inksFor(host.tokens, inkMode);
        layout = layoutFor(snapshot.regions[0]);
        sizeCanvas(layout.canvas, snapshot.dpr);
        host.setAttrs({ mode });
        void loadSheets(heroId());
        readFlags();
        scheduler.start(!(flags.halted || fx || flags.hidden || flags.claimed));
        syncPlate();
        return;
      }
      relayoutNow(snapshot);
    },
    setFx(next) {
      if (fx === next) return;
      fx = next;
      sync();
    },
    input() {
      scheduler.input();
    },
    dispose() {
      disposed = true;
      scheduler.dispose();
      stopClaim();
      stopMotion();
      document.removeEventListener('visibilitychange', onVisibility);
      for (const type of inputs) document.removeEventListener(type, onInput, { capture: true });
      releaseCaches();
      host.labels.replaceChildren();
      host.setPlate(null);
    },
  };
};

const lerpFrame = (a: Frame, b: Frame, t: number): Frame => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t,
});

const clipFrame = (f: Frame, to: Frame): Frame => {
  const x0 = Math.max(f.x, to.x + 18);
  const y0 = Math.max(f.y, to.y + 18);
  const x1 = Math.min(f.x + f.w, to.x + to.w - 18);
  const y1 = Math.min(f.y + f.h, to.y + to.h - 18);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
};

