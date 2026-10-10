import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CREDIT, DRAWING_SET_SCHEMA, EXTENT, KERBS, POSTER, SITES } from '../../../lib/drawings/site.generated';
import { drawingArea } from '../../../lib/drawings/compose';
import { inksFor } from '../../../lib/drawings/ink';
import { fallbackMeasure, type LabelKind, type Measure } from '../../../lib/drawings/labels';
import { paintCropMarks, viewOf } from '../../../lib/drawings/paint';
import { aerialLayout, paintAerial, sceneOf, type Scene } from '../../../lib/drawings/scene';
import { CHIP_QUALIFIER, chipNotes, chipTitle, HERO_ORDER, plateLines, sheetsFor, startHero } from '../../../lib/drawings/sequence';
import type { DeskSnapshot } from '../../../lib/drawings/deskWatch';
import type { DrawingScope } from '../../../lib/drawings/policy';
import { readDrawingTokens } from './palette';
import type { Film } from './drawingFilm';

// The desk drawing set's field (docs/portfolio/desk-drawing-set.md §5): a lazy
// chunk the desk-backdrop layer loads once the desk has room for a sheet. It owns
// the canvas (one per effect run, so StrictMode's double run leaves one), the
// label and chip text, and the title plate's caption (a portal into the plate's
// slot). On a light policy (Save-Data, reduced motion at boot) it paints one
// finished still — the estate's aerial through the poster camera — and never
// downloads the film; otherwise it imports the film (drawingFilm.ts), which plays
// the sequence. Everything here reads the DOM in effects only (App is prerendered).

export interface DrawingFieldProps {
  scope: DrawingScope;
  /** Room on the desk and where (the layer's desk watcher). */
  snapshot: DeskSnapshot | null;
  /** An N-body field or smoke animating: the drawing holds still. */
  fx: boolean;
  /** The layer's two hosts: the canvas goes before the FX layer, the text after it. */
  canvasHost: HTMLElement;
  textHost: HTMLElement;
}

const scene: Scene = sceneOf(SITES, KERBS, EXTENT, POSTER);

/** Text widths from the real fonts once loaded, with the tracking and padding the CSS adds. */
const makeMeasure = (): Measure => {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return fallbackMeasure;
  const fonts: Record<LabelKind, [string, number]> = {
    room: ['500 9.5px Barlow, sans-serif', 0.06 * 9.5],
    geometry: ['500 9.5px Barlow, sans-serif', 0.06 * 9.5],
    unit: ['600 11px "Barlow Condensed", sans-serif', 0.04 * 11],
  };
  return (text, kind) => {
    const [font, tracking] = fonts[kind];
    probe.font = font;
    return probe.measureText(text).width + tracking * text.length + 8;
  };
};

const idle = (fn: () => void): (() => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout: 2000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 1200);
  return () => window.clearTimeout(id);
};

let warned = false;
const warn = (error: unknown) => {
  if (warned) return;
  warned = true;
  console.warn('[backdrop:drawing]', error);
};

const DrawingField: React.FC<DrawingFieldProps> = ({ scope, snapshot, fx, canvasHost, textHost }) => {
  const [plate, setPlate] = useState<[string, string] | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const fxRef = useRef(fx);
  fxRef.current = fx;
  const filmRef = useRef<Film | null>(null);
  const coverRef = useRef<((s: DeskSnapshot) => void) | null>(null);

  useEffect(() => {
    let disposed = false;
    const canvas = document.createElement('canvas');
    canvas.className = 'wb-drawing-canvas';
    canvas.dataset.drawingCanvas = '';
    const labels = document.createElement('div');
    labels.className = 'wb-drawing-labels';
    const chip = document.createElement('div');
    chip.className = 'wb-drawing-chip';
    chip.hidden = true;
    canvasHost.append(canvas);
    textHost.append(labels, chip);
    canvasHost.dataset.drawingSchema = DRAWING_SET_SCHEMA;
    setSlot(canvasHost.closest('[data-desk]')?.querySelector<HTMLElement>('.wb-plate-slot') ?? null);
    const setAttrs = (attrs: Record<string, string | undefined>) => {
      for (const [key, value] of Object.entries(attrs)) {
        const name = `drawing${key[0].toUpperCase()}${key.slice(1)}`;
        if (value === undefined) delete canvasHost.dataset[name]; else canvasHost.dataset[name] = value;
      }
    };
    const tokens = readDrawingTokens();
    const ctx = canvas.getContext('2d');
    let cancelIdle: (() => void) | null = null;
    if (!tokens || !ctx) {
      setAttrs({ unavailable: 'true' });
    } else {
      const start = () => {
        if (disposed) return;
        const measure = makeMeasure();
        if (scope === 'cover') {
          coverRef.current = coverPainter(canvas, ctx, chip, tokens, measure, setPlate);
          if (snapshotRef.current) coverRef.current(snapshotRef.current);
          return;
        }
        // Not destructured in the parameter: the prerender's SSR build (no preload
        // wrapper) tree-shook `createFilm` out of that form and shipped an empty chunk.
        import('./drawingFilm').then((filmModule) => {
          if (disposed) return;
          try {
            const film = filmModule.createFilm({
              canvas, labels, chip, setPlate, setAttrs, tokens, measure, scene, credit: CREDIT,
              startHero: startHero(Date.now()), onWarn: warn,
            });
            filmRef.current = film;
            film.setFx(fxRef.current);
            if (snapshotRef.current) film.setDesk(snapshotRef.current);
          } catch (error) {
            warn(error);
          }
        }).catch((error) => {
          // The film's chunk would not load: the drawing stands as the cover still.
          warn(error);
          if (disposed) return;
          coverRef.current = coverPainter(canvas, ctx, chip, tokens, makeMeasure(), setPlate);
          if (snapshotRef.current) coverRef.current(snapshotRef.current);
        });
      };
      const fontsReady = typeof document.fonts?.load === 'function'
        ? Promise.race([
          Promise.all([document.fonts.load('500 9.5px Barlow'), document.fonts.load('600 11px "Barlow Condensed"')]),
          new Promise((resolve) => { window.setTimeout(resolve, 1000); }),
        ])
        : Promise.resolve();
      void fontsReady.catch(() => undefined).then(() => { if (!disposed) cancelIdle = idle(start); });
    }
    return () => {
      disposed = true;
      cancelIdle?.();
      filmRef.current?.dispose();
      filmRef.current = null;
      coverRef.current = null;
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
      labels.remove();
      chip.remove();
      delete canvasHost.dataset.drawingSchema;
      setPlate(null);
    };
  }, [scope, canvasHost, textHost]);

  useEffect(() => {
    if (!snapshot) return;
    filmRef.current?.setDesk(snapshot);
    coverRef.current?.(snapshot);
  }, [snapshot]);

  useEffect(() => {
    filmRef.current?.setFx(fx);
  }, [fx]);

  if (!slot || !plate) return null;
  return createPortal(
    <>
      <div className="wb-plate-key">SHEET</div>
      <div className="wb-plate-val wb-plate-lines"><span>{plate[0]}</span><span>{plate[1]}</span></div>
    </>,
    slot,
  );
};

/**
 * The cover still (Save-Data, reduced motion at boot): the estate's aerial
 * through the poster camera, cropped on the day's building, with its chip. Painted
 * once per desk geometry; no frame, no timer.
 */
const coverPainter = (
  canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, chip: HTMLElement, tokens: NonNullable<ReturnType<typeof readDrawingTokens>>,
  measure: Measure, setPlate: (lines: [string, string] | null) => void,
) => (snapshot: DeskSnapshot) => {
  const region = snapshot.regions[0];
  if (!snapshot.room || !region) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    chip.hidden = true;
    setPlate(null);
    return;
  }
  const hero = HERO_ORDER[startHero(Date.now())];
  const site = SITES.find((s) => s.id === hero) ?? SITES[0];
  const d = Math.min(snapshot.dpr, 2, Math.max(1, Math.sqrt(2_400_000 / (region.w * region.h))));
  canvas.style.left = `${region.x}px`;
  canvas.style.top = `${region.y}px`;
  canvas.style.width = `${region.w}px`;
  canvas.style.height = `${region.h}px`;
  canvas.width = Math.max(1, Math.round(region.w * d));
  canvas.height = Math.max(1, Math.round(region.h * d));
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const inks = inksFor(tokens, snapshot.windowsOpen ? 'reading' : 'desk');
  const chipLines = (crop: { x: number; y: number; w: number; h: number } | null) => {
    const def = sheetsFor(site).find((s) => s.kind === 'aerial')!;
    return [chipTitle(site, def), chipNotes(site, def, { crop }), CREDIT, CHIP_QUALIFIER];
  };
  const chipH = chipLines(null).reduce((rows, line, i) => rows + Math.max(1, Math.ceil((measure(line, i === 0 ? 'unit' : 'geometry') - 8) / Math.max(40, Math.min(region.w - 16, 420) - 18))), 0) * 14 + 12;
  const area = drawingArea(region, { chip: chipH + 8, chipWidth: Math.min(region.w - 16, 420), dims: false });
  const placed = aerialLayout(scene, area, site.id);
  const frame = { ...placed.view.frame, x: placed.view.frame.x - region.x, y: placed.view.frame.y - region.y };
  const v = viewOf(scene.posterPose, frame);
  paintAerial(ctx, v, scene, inks, { hero: site.id, storeys: true });
  if (!placed.crop) paintCropMarks(ctx, { x: Math.max(frame.x, 18), y: Math.max(frame.y, 18), w: Math.min(frame.w, region.w - 36), h: Math.min(frame.h, region.h - 36) }, inks);
  chip.hidden = false;
  chip.style.left = `${region.x + 8}px`;
  chip.style.top = `${region.y + region.h - chipH}px`;
  chip.style.maxWidth = `${Math.min(region.w - 16, 420)}px`;
  chip.replaceChildren(...chipLines(placed.crop).map((text, i) => {
    const div = document.createElement('div');
    div.className = i === 0 ? 'wb-drawing-chip-title' : 'wb-drawing-chip-line';
    div.textContent = text;
    return div;
  }));
  const def = sheetsFor(site).find((s) => s.kind === 'aerial')!;
  setPlate(plateLines(site, def, 'STILL'));
};

export default DrawingField;
