import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFilm, type Film, type FilmHost, type NavState } from '../components/workbench/drawing/drawingFilm';
import { claimGpu, releaseGpu } from '../lib/gpuClaim';
import { makeChipHeight, NAV_H } from '../components/workbench/drawing/DrawingField';
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
/** A desk that draws every sheet of every building. */
const LARGE = regionOf(4, 0, 60, 30);

let frames: Map<number, FrameRequestCallback>;
let frameId: number;
const runFrames = () => {
  const due = [...frames.values()];
  frames.clear();
  for (const cb of due) cb(performance.now());
};
/** The sheet chunks are cached by beforeAll: they resolve in microtasks, which fake timers leave alone. */
const settle = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };

const mount = (hero: string, o: { nav?: boolean } = {}) => {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('data-film', '');
  const labels = document.createElement('div');
  const chip = document.createElement('div');
  chip.hidden = true;
  document.body.append(canvas, labels, chip);
  const attrs: Record<string, string | undefined> = {};
  /** Every sheet the film put up, in order (`data-drawing-sheet`). */
  const shown: string[] = [];
  const plate: { lines: [string, string] | null } = { lines: null };
  const warnings: unknown[] = [];
  const navs: (NavState | null)[] = [];
  const host: FilmHost = {
    canvas, labels, chip,
    setPlate: (lines) => { plate.lines = lines; },
    setAttrs: (next) => {
      Object.assign(attrs, next);
      if (next.sheet && shown[shown.length - 1] !== next.sheet) shown.push(next.sheet);
    },
    tokens: TOKENS, measure: fallbackMeasure, chipHeight: makeChipHeight(), scene, credit: CREDIT,
    startHero: HERO_ORDER.indexOf(hero as (typeof HERO_ORDER)[number]), onWarn: (error) => warnings.push(error),
    // The traverse's host, as DrawingField makes it: the state, and the row over the chip.
    ...(o.nav ? { onNav: (state: NavState | null) => { navs.push(state); }, navHeight: NAV_H } : {}),
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
  return { film, host, canvas, labels, chip, attrs, shown, plate, warnings, navs, nav: () => navs[navs.length - 1] ?? null, chipLines, play };
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

  it('halted on a shot it cannot draw (a relayout into a band with no site plan), goes on to the next sheet at once rather than standing blank', async () => {
    const f = mount('BLK_501', { nav: true });
    f.film.setDesk(snap(LARGE));
    await settle();
    f.play(3000);
    f.film.goTo({ sheet: 0 });
    f.play(800);
    expect(f.attrs.sheet).toBe('BLK_501:R1');
    document.documentElement.setAttribute('data-motion-paused', 'true');
    await settle();
    paints = [];
    // A window dragged over the column: the band left is ten squares tall.
    f.film.setDesk(snap(BAND_1920));
    expect(f.attrs.sheet).toBe('BLK_501:R2');
    expect(f.attrs.phase).toBe('still');
    expect(f.chipLines()[0]).toMatch(/^BLK 501 · 02 L1 PLAN/);
    expect(paints.some((alpha) => alpha > 0)).toBe(true);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the film’s jumps (the sheet traverse)', () => {
  /** A reading film on R0's hold, the opening aerial. */
  const reading = async (hero = 'BLK_501', region: Region = LARGE) => {
    const f = mount(hero, { nav: true });
    f.film.setDesk(snap(region));
    await settle();
    // The 0.3 s wait for the sheets, then R0's 2.5 s arrival.
    f.play(3000);
    expect(f.attrs.sheet).toBe(`${hero}:R0`);
    expect(f.attrs.phase).toBe('hold');
    return f;
  };
  /** One frame `ms` from now. */
  const step = (ms: number) => { vi.advanceTimersByTime(ms); runFrames(); };

  it('tells the traverse what it offers: the building’s sheets, all drawable here, with the aerial current through R0', async () => {
    const f = await reading();
    const site = SITES.find((s) => s.id === 'BLK_501')!;
    const nav = f.nav()!;
    expect(nav).toMatchObject({ hero: 'BLK_501', name: 'BLK 501', mode: 'reading', current: 6, jump: false });
    expect(nav.sheets.map(({ no, title, available }) => ({ no, title, available }))).toEqual(sheetsFor(site).map((d) => ({ no: d.no, title: d.title, available: true })));
    expect(nav.chip).toMatchObject({ x: parseFloat(f.chip.style.left), y: parseFloat(f.chip.style.top), w: parseFloat(f.chip.style.maxWidth) });
    expect(f.chip.hasAttribute('data-nav')).toBe(true);
  });

  it('Next from R0 re-issues this building’s site plan (R1): 250 ms out, 400 ms in, then its whole hold and the next sheet', async () => {
    const f = await reading();
    f.film.goTo({ step: 1 });
    expect(f.attrs.phase).toBe('act');
    expect(f.labels.children.length).toBe(0);
    step(200);
    // Still the old sheet's pixels fading: the chip, plate and traverse still name it.
    expect(f.attrs.sheet).toBe('BLK_501:R0');
    expect(f.nav()!.current).toBe(6);
    step(100);
    expect(f.attrs.sheet).toBe('BLK_501:R1');
    expect(f.plate.lines?.[0]).toBe('01 OF 07 · BLK 501 SITE');
    expect(f.nav()).toMatchObject({ current: 0, jump: true });
    expect(f.labels.children.length).toBe(0);
    f.play(500);
    expect(f.attrs.phase).toBe('hold');
    expect(f.labels.children.length).toBeGreaterThan(0);
    f.play(23_000);
    expect(f.attrs.sheet).toBe('BLK_501:R1');
    f.play(3000);
    expect(f.attrs.sheet).toBe('BLK_501:R2');
    expect(f.nav()).toMatchObject({ current: 1, jump: false });
    expect(f.shown).toEqual(['BLK_501:R0', 'BLK_501:R1', 'BLK_501:R2']);
    expect(f.warnings).toEqual([]);
  });

  it('steps from the last sheet asked for, so quick presses advance one sheet each and only the last one comes up', async () => {
    const f = await reading();
    f.film.goTo({ step: 1 });
    step(100);
    f.film.goTo({ step: 1 });
    step(100);
    f.film.goTo({ step: 1 });
    f.play(800);
    expect(f.attrs.sheet).toBe('BLK_501:R3');
    expect(f.nav()!.current).toBe(2);
    expect(f.shown).toEqual(['BLK_501:R0', 'BLK_501:R3']);
  });

  it('jumps to the aerial as R7, rolls over to the next building’s site plan, and back to the previous building’s last sheet', async () => {
    const f = await reading();
    f.film.goTo({ sheet: 6 });
    f.play(800);
    expect(f.attrs.sheet).toBe('BLK_501:R7');
    f.film.goTo({ step: 1 });
    await settle();
    f.play(800);
    expect(f.attrs.sheet).toBe('BLK_509:R1');
    expect(f.nav()).toMatchObject({ hero: 'BLK_509', name: 'BLK 509', current: 0, jump: true });
    expect(f.plate.lines?.[0]).toBe('01 OF 07 · BLK 509 SITE');
    f.film.goTo({ step: -1 });
    f.play(800);
    expect(f.attrs.sheet).toBe('BLK_501:R7');
    expect(f.warnings).toEqual([]);
  });

  it('steps buildings keeping the sheet, and the nearest one where the next has fewer (the hawker centre’s aerial is its sixth)', async () => {
    const f = await reading('BLK_507');
    f.film.goTo({ sheet: 2 });
    f.play(800);
    expect(f.attrs.sheet).toBe('BLK_507:R3');
    f.film.goTo({ building: 1 });
    await settle();
    f.play(800);
    expect(f.attrs.sheet).toBe('NC_514:R3');
    expect(f.nav()!.sheets).toHaveLength(6);
    f.film.goTo({ building: -1 });
    f.play(800);
    expect(f.attrs.sheet).toBe('BLK_507:R3');
    f.film.goTo({ sheet: 6 });
    f.play(800);
    f.film.goTo({ building: 1 });
    f.play(800);
    expect(f.attrs.sheet).toBe('NC_514:R7');
    expect(f.nav()).toMatchObject({ hero: 'NC_514', current: 5 });
  });

  it('keeps the sheet on show while the next building’s sheets load, and the latest press wins', async () => {
    const f = await reading();
    // BLK 506 (before BLK 501) and BLK 508 (before that) are not loaded yet.
    f.film.goTo({ building: -1 });
    expect(f.attrs.phase).toBe('hold');
    f.film.goTo({ building: -1 });
    expect(f.attrs.sheet).toBe('BLK_501:R0');
    await settle();
    f.play(800);
    expect(f.attrs.sheet).toBe('BLK_508:R7');
    expect(f.shown).toEqual(['BLK_501:R0', 'BLK_508:R7']);
  });

  it('prefetches the previous building, so a press there starts at once', async () => {
    const f = await reading();
    f.film.prefetch();
    await settle();
    f.film.goTo({ building: -1 });
    expect(f.attrs.phase).toBe('act');
    f.play(800);
    expect(f.attrs.sheet).toBe('BLK_506:R7');
  });

  it('skips sheets this desk cannot draw, and a station for one does nothing', async () => {
    // A band ten squares tall takes no site plan.
    const f = await reading('BLK_501', BAND_1920);
    expect(f.nav()!.sheets.map((s) => s.available)).toEqual([false, true, true, true, true, true, true]);
    const requested = vi.mocked(requestAnimationFrame).mock.calls.length;
    f.film.goTo({ sheet: 0 });
    expect(f.attrs.phase).toBe('hold');
    expect(vi.mocked(requestAnimationFrame).mock.calls.length).toBe(requested);
    f.film.goTo({ step: 1 });
    f.play(800);
    expect(f.attrs.sheet).toBe('BLK_501:R2');
    // Before L1 there is nothing here: the previous building's last sheet.
    f.film.goTo({ step: -1 });
    await settle();
    f.play(800);
    expect(f.attrs.sheet).toBe('BLK_506:R7');
  });

  it('reports the welcome as the aerial, and Next from it goes to this building’s site plan, the welcome never coming back', async () => {
    const f = mount('BLK_501', { nav: true });
    f.film.setDesk(snap(LARGE, { windowsOpen: false }));
    await settle();
    expect(f.attrs.sheet).toBe('BLK_501:W');
    expect(f.nav()).toMatchObject({ mode: 'desk', current: 6 });
    f.play(5000);
    f.film.goTo({ step: 1 });
    f.play(800);
    expect(f.attrs.sheet).toBe('BLK_501:S1');
    expect(f.nav()!.current).toBe(0);
    f.play(12_000);
    expect(f.shown.filter((s) => s === 'BLK_501:W')).toHaveLength(1);
  });

  it('keeps the site plan’s plate and station through the dolly after it (S2)', async () => {
    const f = mount('BLK_501', { nav: true });
    f.film.setDesk(snap(LARGE, { windowsOpen: false }));
    await settle();
    for (let t = 0; t < 60_000 && f.attrs.sheet !== 'BLK_501:S2'; t += 100) f.play(100);
    expect(f.attrs.sheet).toBe('BLK_501:S2');
    expect(f.plate.lines?.[0]).toBe('01 OF 07 · BLK 501 SITE');
    expect(f.chipLines()[0]).toBe('SAMPLE TOWN N5 · 01 SITE PLAN');
    expect(f.nav()!.current).toBe(0);
  });

  it.each([
    ['motion paused', 'STILL'],
    ['the Estate window holding the GPU', 'HELD'],
  ] as const)('stopped (%s), a jump is one paint with no frame and no timer, and the film goes on with its hold, not its arrival again', async (why, word) => {
    const f = await reading();
    const stop = () => (why === 'motion paused' ? document.documentElement.setAttribute('data-motion-paused', 'true') : claimGpu('estate'));
    const go = () => (why === 'motion paused' ? document.documentElement.removeAttribute('data-motion-paused') : releaseGpu('estate'));
    try {
      stop();
      await settle();
      paints = [];
      f.film.goTo({ step: 1 });
      expect(f.attrs.sheet).toBe('BLK_501:R1');
      expect(f.attrs.phase).toBe('still');
      expect(paints.some((alpha) => alpha === 1)).toBe(true);
      expect(f.labels.children.length).toBeGreaterThan(0);
      expect(f.plate.lines).toEqual(['01 OF 07 · BLK 501 SITE', `GENERATED SAMPLE · ${word}`]);
      expect(f.nav()).toMatchObject({ current: 0, jump: true });
      expect(frames.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      paints = [];
      go();
      await settle();
      expect(f.attrs.phase).toBe('hold');
      expect(paints).toEqual([]);
      expect(frames.size).toBe(0);
      expect(vi.getTimerCount()).toBe(1);
      f.play(23_000);
      expect(f.attrs.sheet).toBe('BLK_501:R1');
    } finally {
      go();
    }
  });

  it('lets a press on the traverse by its input listener: at rest, it wakes the film once, through the jump', async () => {
    const f = await reading();
    // Four minutes without input: a hold ends at rest (the next building's sheets load on the way).
    const untilRest = async () => {
      for (let t = 0; t < 600_000 && f.attrs.phase !== 'rest'; t += 100) {
        step(100);
        if (t % 5000 === 0) await settle();
      }
    };
    await untilRest();
    expect(f.attrs.phase).toBe('rest');
    const before = f.shown.length;
    const at = f.nav()!.current;
    const bar = document.createElement('div');
    bar.setAttribute('data-drawing-nav', '');
    const button = document.createElement('button');
    bar.append(button);
    document.body.append(bar);
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(f.attrs.phase).toBe('rest');
    f.film.goTo({ step: 1 });
    await settle();
    f.play(800);
    expect(f.shown).toHaveLength(before + 1);
    expect(f.nav()!.jump).toBe(true);
    expect(f.nav()!.current).toBe(at === 6 ? 0 : at + 1);
    // Anywhere else, input wakes it as before.
    await untilRest();
    expect(f.attrs.phase).toBe('rest');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(f.attrs.phase).not.toBe('rest');
  });

  it('parked, says so and ignores a press; disposed, says so', async () => {
    const f = await reading();
    f.film.setDesk(snap(null));
    expect(f.nav()).toBeNull();
    f.film.goTo({ step: 1 });
    expect(f.attrs.phase).toBe('park');
    expect(frames.size).toBe(0);
    f.film.setDesk(snap(LARGE));
    expect(f.nav()).not.toBeNull();
    f.film.dispose();
    expect(f.navs[f.navs.length - 1]).toBeNull();
  });

  it('says why a station is closed: a sheet too small here, a plan whose building is still loading', async () => {
    const f = mount('BLK_501', { nav: true });
    f.film.setDesk(snap(BAND_1920, { windowsOpen: false }));
    // The welcome goes up before the building's sheets arrive.
    expect(f.attrs.sheet).toBe('BLK_501:W');
    const reasons = () => f.nav()!.sheets.map((s) => s.reason);
    expect(reasons()).toEqual(['not drawn at this size', 'still loading', 'still loading', 'still loading', 'not drawn at this size', 'not drawn at this size', 'not drawn at this size']);
    await settle();
    // A band ten squares tall takes no site plan, and its cycle is plans only.
    expect(reasons()).toEqual(['not drawn at this size', '', '', '', 'not drawn at this size', 'not drawn at this size', 'not drawn at this size']);
    expect(f.nav()!.sheets.map((s) => s.available)).toEqual([false, true, true, true, false, false, false]);
  });

  it('keeps the traverse’s row out of the area the sheets are measured in: the 1280 × 720 desk still plays BLK 510’s exploded view, block and aerial', async () => {
    // The desk DESK leaves at 1280 × 720: 1184 × 674, its free region 39 × 20 squares at (240, 50).
    const region: Region = { col: 10, row: 6, cols: 39, rows: 20, x: 240, y: 50, w: 936, h: 480 };
    const desk1280: DeskSnapshot = { w: 1184, h: 674, obstacles: [], windowsOpen: false, regions: [region], room: true, poster: null, dpr: 1 };
    const cycleOf = async (nav: boolean) => {
      const f = mount('BLK_510', { nav });
      f.film.setDesk(desk1280);
      await settle();
      for (let t = 0; t < 400_000 && !f.attrs.sheet?.startsWith('BLK_503'); t += 1000) {
        f.play(1000);
        await settle();
      }
      expect(f.warnings).toEqual([]);
      // Stopped, so the other film's frames and timers play nothing more of this one.
      f.film.dispose();
      return { shown: [...f.shown], top: parseFloat(f.chip.style.top) };
    };
    const plain = await cycleOf(false);
    const traversed = await cycleOf(true);
    expect(traversed.shown).toEqual(plain.shown);
    expect(traversed.shown).toEqual(expect.arrayContaining(['BLK_510:S6', 'BLK_510:S7', 'BLK_510:S8']));
    // The chip grows by the row, upward, into the band's margin.
    expect(plain.top - traversed.top).toBe(NAV_H);
  });

  it('puts the chip back under the traverse when it comes back from a park onto the dolly (S2)', async () => {
    const f = mount('BLK_501', { nav: true });
    f.film.setDesk(snap(LARGE, { windowsOpen: false }));
    await settle();
    for (let t = 0; t < 60_000 && f.attrs.sheet !== 'BLK_501:S2'; t += 100) f.play(100);
    expect(f.attrs.sheet).toBe('BLK_501:S2');
    f.film.setDesk(snap(null, { windowsOpen: false }));
    expect(f.chip.hidden).toBe(true);
    f.film.setDesk(snap(LARGE, { windowsOpen: false }));
    expect(f.attrs.sheet).toBe('BLK_501:S2');
    expect(f.chip.hidden).toBe(false);
    expect(f.chipLines()[0]).toBe('SAMPLE TOWN N5 · 01 SITE PLAN');
    expect(f.nav()).toMatchObject({ current: 0, chip: { y: parseFloat(f.chip.style.top) } });
  });

  it.each([
    ['onto the dolly (S2)', 'S2'],
    ['onto a wait for the next building’s sheets', 'wait'],
  ] as const)('moves the chip and the traverse with the region on a relayout %s', async (_how, onto) => {
    // BLK 509, next after BLK 501, never arrives: the film waits for it.
    const loaders = SHEET_LOADERS as Record<string, () => Promise<unknown>>;
    const load509 = loaders.BLK_509;
    if (onto === 'wait') loaders.BLK_509 = () => new Promise(() => {});
    try {
      const f = onto === 'S2' ? mount('BLK_501', { nav: true }) : await reading();
      if (onto === 'S2') {
        f.film.setDesk(snap(LARGE, { windowsOpen: false }));
        await settle();
        for (let t = 0; t < 60_000 && f.attrs.sheet !== 'BLK_501:S2'; t += 100) f.play(100);
      } else {
        // To R7, the cycle's last sheet, and past its hold and exit.
        f.film.goTo({ sheet: 6 });
        f.play(30_000);
        await settle();
        f.play(1000);
        expect(f.attrs.sheet).toBe('BLK_501:R7');
        expect(f.attrs.phase).toBe('hold');
      }
      const before = parseFloat(f.chip.style.top);
      // A window over the desk's foot: the region ends two squares higher.
      const higher = regionOf(4, 2, 60, 28);
      f.film.setDesk(snap(higher, { windowsOpen: onto === 'wait' }));
      const top = parseFloat(f.chip.style.top);
      expect(f.attrs.sheet).toBe(onto === 'S2' ? 'BLK_501:S2' : 'BLK_501:R7');
      expect(top).toBeLessThan(before);
      expect(top).toBeGreaterThan(higher.y);
      expect(f.nav()!.chip.y).toBe(top);
    } finally {
      loaders.BLK_509 = load509;
    }
  });

  it('a jump to a sheet that cannot be drawn after all goes on to the next shot, not back to the old one’s hold', async () => {
    const f = await reading();
    document.documentElement.setAttribute('data-motion-paused', 'true');
    await settle();
    // The typical plan's labels fail once, as a re-layout between the press and its landing would leave it with nowhere to go.
    const measure = f.host.measure;
    let fail = true;
    f.host.measure = (text, kind) => {
      if (fail) { fail = false; throw new Error('no room'); }
      return measure(text, kind);
    };
    f.film.goTo({ sheet: 2 });
    expect(f.warnings).toHaveLength(1);
    expect(f.attrs.sheet).toBe('BLK_501:R4');
    expect(f.nav()).toMatchObject({ current: 3 });
    expect(f.chipLines()[0]).toMatch(/^BLK 501 · 04 ROOF PLAN/);
    expect(f.attrs.phase).toBe('still');
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a desk with nothing to draw after the welcome ends the film blank, once a lap of the estate is skipped, not in a stack overflow', async () => {
    // Twelve by eight squares: no site plan, no plan, and a plans-only cycle.
    const f = mount('BLK_501', { nav: true });
    f.film.setDesk(snap(regionOf(3, 0, 12, 8), { windowsOpen: false }));
    for (let t = 0; t < 400_000 && f.attrs.phase !== 'done'; t += 1000) {
      f.play(1000);
      await settle();
    }
    expect(f.warnings).toEqual([]);
    expect(f.attrs.phase).toBe('done');
    expect(f.attrs.sheet).toBeUndefined();
    expect(f.chip.hidden).toBe(true);
    expect(f.nav()).toBeNull();
    expect(f.plate.lines).toBeNull();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    // Room again, in a band whose cycle skips the site plan and its dolly: the film draws
    // the next shot there, its count of skips begun afresh.
    f.film.setDesk(snap(BAND_1920, { windowsOpen: false }));
    await settle();
    expect(f.attrs.sheet).toMatch(/:S\d$/);
    expect(f.nav()).not.toBeNull();
    expect(f.chip.hidden).toBe(false);
  });
});
