import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFilm, type Film, type FilmHost } from '../components/workbench/drawing/drawingFilm';
import { makeChipHeight } from '../components/workbench/drawing/DrawingField';
import { drawingArea } from '../lib/drawings/compose';
import type { DeskSnapshot } from '../lib/drawings/deskWatch';
import type { DrawingTokens } from '../lib/drawings/ink';
import { fallbackMeasure } from '../lib/drawings/labels';
import { CELL, type Box, type Region } from '../lib/drawings/occupancy';
import { aerialLayout, sceneOf } from '../lib/drawings/scene';
import { chipNotes, HERO_ORDER, sheetsFor } from '../lib/drawings/sequence';
import { SHEET_LOADERS } from '../lib/drawings/sheetLoaders.generated';
import { CREDIT, EXTENT, KERBS, POSTER, SITES } from '../lib/drawings/site.generated';

// The desk drawing set's film (components/workbench/drawing/drawingFilm.ts) driven
// directly, with fake desk snapshots, a fake 2D context, a hand-run frame queue and
// fake timers: what its sheet chip says and the band it reserves for it, and how it
// comes back from a park, a held start and a new pixel ratio. The scheduler's own
// rules are pinned in drawing-schedule; the field around the film in desk-drawing.

const TOKENS: DrawingTokens = {
  bg: '#f2f2f3', text: '#1d1f20', accent700: '#416180', accent900: '#1d2d3d', neutral500: '#98989b', neutral700: '#5d5d60',
};
const scene = sceneOf(SITES, KERBS, EXTENT, POSTER);

/** The globalAlpha of every stroke, fill and image the film's own canvas takes. */
let paints: number[];

/** Enough of a 2D context for the painters: every method a no-op, every property settable, text 6 px a character. */
const fake2d = (canvas: HTMLCanvasElement) => {
  const state: Record<string | symbol, unknown> = { canvas, globalAlpha: 1 };
  const saved: unknown[] = [];
  return new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return (text: string) => ({ width: text.length * 6 });
      if (key === 'getLineDash') return () => [];
      if (key === 'save') return () => { saved.push(target.globalAlpha); };
      if (key === 'restore') return () => { if (saved.length) target.globalAlpha = saved.pop(); };
      if (key === 'stroke' || key === 'fill' || key === 'drawImage') {
        return () => { if (canvas.hasAttribute('data-film')) paints.push(target.globalAlpha as number); };
      }
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
};

/**
 * The chip's height by index.css .wb-drawing-chip, worked out here from the fake
 * context's 6 px a character: 10 px lines with 0.1em (1 px) tracking, the 11 px
 * title with 0.05em, broken at spaces in the width less 9 px padding and 1 px
 * border a side; 14 px rows, 5 px padding and 1 px border top and bottom.
 */
const chipEstimate = (lines: readonly string[], maxWidth: number): number => {
  const room = maxWidth - 20;
  let rows = 0;
  lines.forEach((line, i) => {
    const perChar = 6 + (i === 0 ? 0.55 : 1);
    let used = 0;
    rows += 1;
    for (const word of line.split(' ')) {
      const w = word.length * perChar;
      if (used > 0 && used + perChar + w > room) { rows += 1; used = w; } else used += (used > 0 ? perChar : 0) + w;
    }
  });
  return rows * 14 + 12;
};

const W = 1824;
const H = 1034;
const regionOf = (col: number, row: number, cols: number, rows: number): Region => ({
  col, row, cols, rows, x: col * CELL, y: H - CELL * (row + rows), w: cols * CELL, h: rows * CELL,
});
const snap = (region: Region | null, o: { windowsOpen?: boolean; poster?: Box | null; dpr?: number } = {}): DeskSnapshot => ({
  w: W, h: H, obstacles: [], windowsOpen: o.windowsOpen ?? true, regions: region ? [region] : [], room: region !== null,
  poster: o.poster ?? null, dpr: o.dpr ?? 1,
});

/** The 16-square column the reviewers measured (a 368 px chip), and the 1920 × 1080 boot's reading band. */
const SIXTEEN = regionOf(3, 0, 16, 20);
const BAND_1920 = regionOf(3, 0, 58, 10);

let frames: Map<number, FrameRequestCallback>;
let frameId: number;
const runFrames = () => {
  const due = [...frames.values()];
  frames.clear();
  for (const cb of due) cb(performance.now());
};
/** The sheet chunks are cached by beforeAll: they resolve in microtasks, which fake timers leave alone. */
const settle = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };

const mount = (hero: string) => {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('data-film', '');
  const labels = document.createElement('div');
  const chip = document.createElement('div');
  chip.hidden = true;
  document.body.append(canvas, labels, chip);
  const attrs: Record<string, string | undefined> = {};
  const plate: { lines: [string, string] | null } = { lines: null };
  const warnings: unknown[] = [];
  const host: FilmHost = {
    canvas, labels, chip,
    setPlate: (lines) => { plate.lines = lines; },
    setAttrs: (next) => { Object.assign(attrs, next); },
    tokens: TOKENS, measure: fallbackMeasure, chipHeight: makeChipHeight(), scene, credit: CREDIT,
    startHero: HERO_ORDER.indexOf(hero as (typeof HERO_ORDER)[number]), onWarn: (error) => warnings.push(error),
  };
  const film = createFilm(host);
  films.push(film);
  const chipLines = () => [...chip.children].map((c) => c.textContent ?? '');
  /** Plays `ms` in 100 ms steps (input on each, so the film never rests), calling `each` after every step. */
  const play = (ms: number, each?: () => void) => {
    for (let t = 0; t < ms; t += 100) {
      film.input();
      vi.advanceTimersByTime(100);
      runFrames();
      each?.();
    }
  };
  return { film, canvas, labels, chip, attrs, plate, warnings, chipLines, play };
};

let films: Film[];

beforeAll(async () => {
  for (const load of Object.values(SHEET_LOADERS)) await load();
});

beforeEach(() => {
  paints = [];
  films = [];
  frames = new Map();
  frameId = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { frameId += 1; frames.set(frameId, cb); return frameId; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { frames.delete(id); }));
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return fake2d(this) as never;
  });
});

afterEach(() => {
  for (const film of films) film.dispose();
  document.body.replaceChildren();
  document.documentElement.removeAttribute('data-motion-paused');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the film’s sheet chip', () => {
  interface Seen { sheet: string; lines: string[]; band: number; maxWidth: number }

  /** Plays one building's whole cycle, keeping every chip it shows and the band reserved under it. */
  const playCycle = async (hero: string, region: Region, o: Parameters<typeof snap>[1] = {}) => {
    const f = mount(hero);
    f.film.setDesk(snap(region, o));
    await settle();
    const seen = new Map<string, Seen>();
    const keep = () => {
      if (f.chip.hidden) return;
      const lines = f.chipLines();
      const key = `${f.attrs.sheet}|${lines.join('|')}`;
      if (!seen.has(key)) {
        seen.set(key, { sheet: f.attrs.sheet ?? '', lines, band: region.y + region.h - parseFloat(f.chip.style.top), maxWidth: parseFloat(f.chip.style.maxWidth) });
      }
    };
    keep();
    // Until the next building's first sheet: one cycle, with its welcome on the desk.
    for (let t = 0; t < 260_000 && !(f.attrs.sheet && !f.attrs.sheet.startsWith(hero)); t += 1000) f.play(1000, keep);
    expect(f.warnings).toEqual([]);
    return { ...f, seen: [...seen.values()].filter((s) => s.sheet.startsWith(hero)) };
  };

  it.each([
    ['BLK_501', 'the 16-square column, reading', SIXTEEN, {}],
    ['NC_514', 'the 16-square column, reading', SIXTEEN, {}],
    ['MSCP_513', 'the 16-square column, reading', SIXTEEN, {}],
    ['BLK_501', 'the 16-square column, desk, its welcome registered', SIXTEEN, { windowsOpen: false, poster: { x: SIXTEEN.x + 24, y: SIXTEEN.y + 24, w: 320, h: 240 } }],
    ['BLK_501', 'the 1920 reading band', BAND_1920, {}],
    ['MSCP_513', 'the 1920 reading band', BAND_1920, {}],
    ['NC_514', 'the 1920 desk band', BAND_1920, { windowsOpen: false }],
  ] as const)('%s in %s: the band under the chip is never shorter than the chip, whichever sheet it names', async (hero, _where, region, o) => {
    const { seen } = await playCycle(hero, region, o);
    // The cycle's sheets that fit there (a band ten squares tall takes no site plan, the
    // 16-square column no plan of the hawker centre), an aerial among them.
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.some((s) => /AERIAL NE/.test(s.lines[0]))).toBe(true);
    for (const s of seen) {
      expect(s.maxWidth, s.sheet).toBe(Math.min(region.w - 16, 420));
      expect(s.band, `${s.sheet}: ${s.lines.join(' / ')}`).toBeGreaterThanOrEqual(chipEstimate(s.lines, s.maxWidth));
    }
  });

  it('prints the crop a cropped aerial draws (the 1920 reading band’s R0 and R7), never FULL FRAME, and no cut while reading', async () => {
    const { seen } = await playCycle('BLK_501', BAND_1920);
    const aerials = seen.filter((s) => /AERIAL NE/.test(s.lines[0]));
    expect(aerials.map((s) => s.sheet.split(':')[1])).toEqual(['R0', 'R7']);
    for (const s of aerials) {
      expect(s.lines[1]).toMatch(/^POSTER CAMERA · VFOV 42\.18° · CROP x\d+–\d+ y\d+–\d+ · MASSING: FOOTPRINT TO RF LEVEL$/);
    }
  });

  it('names the crop it draws on S8, where the hero’s plan is cut in: WALLS INFERRED', async () => {
    const region = regionOf(3, 0, 40, 22);
    const f = mount('BLK_501');
    f.film.setDesk(snap(region, { windowsOpen: false }));
    await settle();
    for (let t = 0; t < 200_000 && !f.attrs.sheet?.endsWith(':S8'); t += 100) f.play(100);
    expect(f.attrs.sheet).toBe('BLK_501:S8');
    const site = SITES.find((s) => s.id === 'BLK_501')!;
    const aerial = sheetsFor(site).find((d) => d.kind === 'aerial')!;
    const band = region.y + region.h - parseFloat(f.chip.style.top);
    const chipW = Math.min(region.w - 16, 420);
    const { crop } = aerialLayout(scene, drawingArea(region, { chip: band + 8, chipWidth: chipW, dims: false }), 'BLK_501');
    expect(f.chipLines()[1]).toBe(chipNotes(site, aerial, { crop, cut: true }));
    expect(f.chipLines()[1]).toMatch(/ · WALLS INFERRED$/);
  });

  it.each([
    ['in the Estate window’s poster rectangle', { x: 200, y: 400, w: 400, h: 300 }, 'REGISTERED TO THE ESTATE STILL'],
    ['with no poster seen', null, 'FULL FRAME 1600 × 1200'],
    ['when the region holds too little of the poster (the centred fallback)', { x: 20, y: 20, w: 400, h: 300 }, 'FULL FRAME 1600 × 1200'],
  ] as const)('welcomes the visit %s, and says so: %s', async (_where, poster, line) => {
    const f = mount('BLK_501');
    f.film.setDesk(snap(regionOf(4, 0, 60, 30), { windowsOpen: false, poster }));
    await settle();
    expect(f.attrs.sheet).toBe('BLK_501:W');
    expect(f.chipLines()[1]).toBe(`POSTER CAMERA · VFOV 42.18° · ${line} · MASSING: FOOTPRINT TO RF LEVEL`);
  });
});

describe('the film’s lifecycle', () => {
  it('comes back from a park to the very same region: it unparks, shows the sheet again and moves', async () => {
    const f = mount('BLK_501');
    f.film.setDesk(snap(SIXTEEN));
    await settle();
    f.play(400);
    expect(f.attrs.phase).toBe('act');
    // A window maximised: no room anywhere.
    f.film.setDesk(snap(null));
    expect(f.attrs.phase).toBe('park');
    expect(f.chip.hidden).toBe(true);
    expect(f.plate.lines).toBeNull();
    // Restored: the same snapshot as before the park.
    const before = vi.mocked(requestAnimationFrame).mock.calls.length;
    f.film.setDesk(snap(SIXTEEN));
    expect(f.attrs.phase).toBe('act');
    expect(vi.mocked(requestAnimationFrame).mock.calls.length).toBeGreaterThan(before);
    expect(f.chip.hidden).toBe(false);
    expect(f.plate.lines?.[1]).toBe('GENERATED SAMPLE · LIVE');
    expect(f.attrs.sheet).toBe('BLK_501:R0');
  });

  it.each([
    ['an N-body or smoke field animating', 'fx'],
    ['motion paused', 'paused'],
  ] as const)('created while it may not move (%s), shows its first sheet finished once the sheets arrive: one paint, no frame, no timer', async (_why, hold) => {
    if (hold === 'paused') document.documentElement.setAttribute('data-motion-paused', 'true');
    const f = mount('BLK_501');
    // DrawingField's order: the FX flag first, then the desk.
    if (hold === 'fx') f.film.setFx(true);
    f.film.setDesk(snap(SIXTEEN));
    await settle();
    expect(f.attrs.phase).toBe('still');
    expect(f.attrs.sheet).toBe('BLK_501:R0');
    expect(f.chip.hidden).toBe(false);
    expect(f.chipLines()[0]).toBe('SAMPLE TOWN N5 · 07 AERIAL NE · POSTER CAMERA');
    expect(f.plate.lines).toEqual(['07 OF 07 · BLK 501 AERIAL', 'GENERATED SAMPLE · STILL']);
    expect(paints.some((alpha) => alpha > 0)).toBe(true);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('halted on its first wait after the sheets came in while it still ran, shows that first sheet finished', async () => {
    const f = mount('BLK_501');
    f.film.setDesk(snap(SIXTEEN));
    await settle(); // the sheets are in; the wait's 300 ms timer has not fired
    expect(f.attrs.phase).toBe('hold');
    expect(f.chip.hidden).toBe(true);
    document.documentElement.setAttribute('data-motion-paused', 'true');
    await settle();
    expect(f.attrs.phase).toBe('still');
    expect(f.attrs.sheet).toBe('BLK_501:R0');
    expect(f.chip.hidden).toBe(false);
    expect(f.plate.lines).toEqual(['07 OF 07 · BLK 501 AERIAL', 'GENERATED SAMPLE · STILL']);
    expect(paints.some((alpha) => alpha > 0)).toBe(true);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('parked before it ever started (its first snapshot covered), plays once the desk is uncovered', async () => {
    const f = mount('BLK_501');
    f.film.setDesk(snap(null));
    expect(f.attrs.phase).toBe('park');
    f.film.setDesk(snap(SIXTEEN));
    await settle();
    f.play(400);
    expect(f.attrs.phase).toBe('act');
    expect(frames.size).toBe(1);
    expect(f.plate.lines?.[1]).toBe('GENERATED SAMPLE · LIVE');
  });

  it('gives the canvas a new backing store when only the device pixel ratio changes, and draws the sheet again on it', async () => {
    const f = mount('BLK_501');
    f.film.setDesk(snap(SIXTEEN, { dpr: 1 }));
    await settle();
    f.play(26_000);
    expect([f.canvas.width, f.canvas.height]).toEqual([SIXTEEN.w, SIXTEEN.h]);
    expect(f.attrs.phase).toBe('hold');
    // The window taken to a 200 % screen of the same CSS size.
    f.film.setDesk(snap(SIXTEEN, { dpr: 2 }));
    expect([f.canvas.width, f.canvas.height]).toEqual([2 * SIXTEEN.w, 2 * SIXTEEN.h]);
    expect(f.attrs.sheet).toBe('BLK_501:R0');
    expect(f.attrs.phase).toBe('act');
    // And back.
    f.film.setDesk(snap(SIXTEEN, { dpr: 1 }));
    expect([f.canvas.width, f.canvas.height]).toEqual([SIXTEEN.w, SIXTEEN.h]);
  });

  it('halted during an exit fade, keeps the finished sheet up under the chip and plate that name it', async () => {
    const f = mount('BLK_501');
    f.film.setDesk(snap(SIXTEEN));
    await settle();
    // A 0.3 s wait for the sheets' timer, R0 arriving for 2.5 s and holding 24 s, then a 0.4 s fade.
    f.play(26_700);
    const labels = f.labels.children.length;
    f.play(200);
    expect(f.attrs.phase).toBe('act');
    expect(f.labels.children.length).toBe(0);
    paints = [];
    document.documentElement.setAttribute('data-motion-paused', 'true');
    await settle();
    expect(f.attrs.phase).toBe('still');
    expect(paints.some((alpha) => alpha === 1)).toBe(true);
    expect(f.labels.children.length).toBe(labels);
    expect(f.chip.hidden).toBe(false);
    expect(f.chipLines()[0]).toBe('SAMPLE TOWN N5 · 07 AERIAL NE · POSTER CAMERA');
    expect(f.plate.lines).toEqual(['07 OF 07 · BLK 501 AERIAL', 'GENERATED SAMPLE · STILL']);
    expect(frames.size).toBe(0);
  });
});
