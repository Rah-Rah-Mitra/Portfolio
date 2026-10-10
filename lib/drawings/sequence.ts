import { drawInMs, EFFECT_MS, HOLD_MS } from './effects';
import type { DrawingSite } from './types';

// The drawing set's sequence (docs/portfolio/desk-drawing-set.md §1): which
// sheets each building has, in what order, how each one arrives, how long it
// holds, and what the title plate and the sheet chip say about it. Pure: the film
// (drawingFilm.ts) plays it, tests/drawing-sequence.test.ts pins it.
//
// Two ways to watch. On an uncovered desk (no window open) the film runs one
// building at a time through all four of the user's ideas, chained by camera
// moves: the site plan, the building's plans drawn in, the plans tilted into an
// axonometric and exploded, closed and stacked into the block, then a dolly-zoom
// into the aerial poster's own camera — and from there it lifts back into the
// next building's site plan. While a window is open, the same building's sheets
// arrive one at a time, finished, in the desk's free margin, with long holds.

/** The order the buildings take the stage; the day picks where a visit starts. */
export const HERO_ORDER = [
  'BLK_501', 'BLK_509', 'BLK_510', 'BLK_503', 'BLK_507', 'NC_514', 'BLK_505', 'BLK_511', 'BLK_502', 'BLK_512', 'MSCP_513',
  'BLK_504', 'BLK_508', 'BLK_506',
] as const;

export const startHero = (epochMs: number): number => Math.floor(epochMs / 86_400_000) % HERO_ORDER.length;

export type SheetKind = 'site' | 'plan' | 'exploded' | 'block' | 'aerial';

export interface SheetDef {
  no: number;
  of: number;
  kind: SheetKind;
  /** The plan sheet's key for kind 'plan'. */
  key: string | null;
  /** The plate's word: 'TYPICAL', 'ROOF'. */
  word: string;
  /** The chip's title after the building: '03 TYPICAL PLAN L2–L20 (×19) · FFL +3.60 TO +54.00'. */
  title: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A level as the drawings print it: '±0.00', '+56.80' (the HUD's fflText, restated). */
export const fflText = (metres: number): string => {
  if (Math.abs(metres) < 0.005) return '±0.00';
  return `${metres > 0 ? '+' : '−'}${Math.abs(metres).toFixed(2)}`;
};

const tags = (site: DrawingSite): string[] => site.ffl.map((_, i) => (i === site.ffl.length - 1 ? 'RF' : `L${i + 1}`));

/** The storeys a sheet draws: [first, last] indices. */
export const sheetStoreys = (site: DrawingSite, key: string): number[] => {
  const index = site.sheets.indexOf(key);
  return [...site.plan].flatMap((c, i) => (c === String(index) ? [i] : []));
};

/** Each building's sheets: the site, its plans (L1, typical, roof; the hawker centre's L1 and L2), the exploded view, the block, the aerial. */
export const sheetsFor = (site: DrawingSite): SheetDef[] => {
  const t = tags(site);
  const ffl = (i: number) => fflText(site.ffl[i] / 100);
  const plans: Omit<SheetDef, 'no' | 'of'>[] = site.sheets.map((key) => {
    const s = sheetStoreys(site, key);
    if (key === 'L1') return { kind: 'plan', key, word: 'L1', title: `L1 PLAN · FFL ${ffl(0)}` };
    if (key === 'TYP') {
      const deck = site.kind === 'mscp';
      return {
        kind: 'plan', key, word: deck ? 'DECK' : 'TYPICAL',
        title: `${deck ? 'DECK' : 'TYPICAL'} PLAN ${t[s[0]]}–${t[s[s.length - 1]]} (×${s.length}) · FFL ${ffl(s[0])} TO ${ffl(s[s.length - 1])}`,
      };
    }
    if (key === 'RF') return { kind: 'plan', key, word: 'ROOF', title: `ROOF PLAN · RF ${ffl(s[0])} · MODEL TOP ${fflText(site.top / 100)}` };
    return { kind: 'plan', key, word: key, title: `${key} PLAN · FFL ${ffl(s[0])}` };
  });
  const typical = site.sheets.includes('TYP') ? sheetStoreys(site, 'TYP') : [];
  const layers = site.sheets.map((key) => (key === 'TYP' ? `${t[typical[0]]}–${t[typical[typical.length - 1]]}` : key)).join(' / ');
  const list: Omit<SheetDef, 'no' | 'of'>[] = [
    { kind: 'site', key: null, word: 'SITE', title: 'SITE PLAN' },
    ...plans,
    { kind: 'exploded', key: null, word: 'EXPLODED', title: `EXPLODED AXONOMETRIC · ${layers}` },
    { kind: 'block', key: null, word: 'BLOCK', title: `AXONOMETRIC · BLOCK · ${site.levels}` },
    { kind: 'aerial', key: null, word: 'AERIAL', title: 'AERIAL NE · POSTER CAMERA' },
  ];
  return list.map((sheet, i) => ({ ...sheet, no: i + 1, of: list.length, title: `${pad(i + 1)} ${sheet.title}` }));
};

/** The title plate's two fixed lines while a sheet is placed (≤ 30 and ≤ 26 characters). */
export const plateLines = (site: DrawingSite | null, sheet: SheetDef | null, state: PlateState): [string, string] => [
  sheet && site ? `${pad(sheet.no)} OF ${pad(sheet.of)} · ${site.short} ${sheet.word}` : '07 OF 07 · ESTATE AERIAL NE',
  `GENERATED SAMPLE · ${state}`,
];

export type PlateState = 'LIVE' | 'STILL' | 'HELD' | 'AT REST';

export interface ChipFacts {
  /** Metres per desk square at the sheet's scale. */
  squareM?: number;
  /** North points right (the plan is turned a quarter). */
  northRight?: boolean;
  /** Poster crop in poster px, or null for the full frame. */
  crop?: { x: number; y: number; w: number; h: number } | null;
  lots?: readonly [number, number];
  partial?: boolean;
  /** The sheet has open-air rooms (a void deck, a roof deck). */
  openAir?: boolean;
}

/** The chip's second line: what this sheet's scale, north and inferences are, for this sheet only. */
export const chipNotes = (site: DrawingSite, sheet: SheetDef, facts: ChipFacts): string => {
  const north = facts.northRight ? 'N →' : 'N ↑';
  const square = facts.squareM ? `1 SQ = ${Number(facts.squareM.toFixed(1))} M` : '';
  const parts: string[] = [];
  if (sheet.kind === 'site') parts.push(square, north, 'KERBS FROM THE GROUND RASTER', `${site.short} MARKED`);
  if (sheet.kind === 'plan') {
    parts.push(square, north);
    if (facts.partial) parts.push('OUTLINE OF L1 BELOW', 'NO WALL FILL');
    else if (site.kind === 'mscp' && sheet.key !== 'RF') parts.push('UNFILLED = NOT A ROOM IN THE DATA', `${facts.lots?.[0] ?? 0} CAR · ${facts.lots?.[1] ?? 0} MOTORCYCLE LOTS PER DECK`);
    else parts.push('WALLS AND LIFT CORE INFERRED', 'DOORS AS OPENINGS');
    if (facts.openAir && !facts.partial) {
      // A block's open-air L1 is its void deck and its open-air roof a roof deck; elsewhere (the hawker
      // centre's forecourt and walkway, the car park's roof garden) the data names the spaces themselves.
      parts.push(site.kind !== 'block' ? 'OPEN-AIR SPACES' : sheet.key === 'L1' ? 'VOID DECK OPEN-AIR' : sheet.key === 'RF' ? 'ROOF DECK OPEN-AIR' : 'OPEN-AIR SPACES');
    }
  }
  if (sheet.kind === 'exploded' || sheet.kind === 'block') parts.push('MASSING: FOOTPRINT TO RF LEVEL', 'WALLS INFERRED');
  if (sheet.kind === 'aerial') {
    parts.push('POSTER CAMERA', 'VFOV 42.18°');
    const c = facts.crop;
    parts.push(c ? `CROP x${Math.round(c.x)}–${Math.round(c.x + c.w)} y${Math.round(c.y)}–${Math.round(c.y + c.h)}` : 'FULL FRAME 1600 × 1200');
  }
  return parts.filter(Boolean).join(' · ');
};

/** The chip's title line. */
export const chipTitle = (site: DrawingSite, sheet: SheetDef): string =>
  sheet.kind === 'site' || sheet.kind === 'aerial' ? `SAMPLE TOWN N5 · ${sheet.title}` : `${site.short} · ${sheet.title}`;

/** The chip's last line: the qualifier and where the licence is. */
export const CHIP_QUALIFIER = 'Redrawn; inferences marked · a generated sample, not a real town or HDB’s own plans · /estate/LICENSE.txt';

// ---- timing ---------------------------------------------------------------------------

export type ShotId = 'W' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';

export interface Shot {
  id: ShotId;
  /** Index into sheetsFor(site); -1 for the dolly between sheets. */
  sheet: number;
  /** Arrival, hold and exit, ms. An exit of 0 runs straight into the next shot's arrival. */
  arrive: number;
  hold: number;
  exit: number;
}

export interface CycleFacts {
  /** Rooms on the typical sheet (or L1 where there is none). */
  typicalRooms: number;
  /** Typical storeys (the stack's stamps). */
  typicalCount: number;
  /** Risers on the L1 sheet's longest stair. */
  l1Risers: number;
  /** The axonometric is too small to read here (< 3 px/m): plans only. */
  plansOnly: boolean;
}

const sheetIndex = (sheets: SheetDef[], pick: (s: SheetDef) => boolean) => sheets.findIndex(pick);

/**
 * The desk film's shots for one building, from its site plan to its aerial. S1's
 * arrival is the lift down from the previous building's aerial (or the welcome's).
 * A plans-only cycle (an axonometric under 3 px/m) stops at the roof and dollies
 * back out.
 */
export const deskCycle = (site: DrawingSite, facts: CycleFacts): Shot[] => {
  const sheets = sheetsFor(site);
  const at = (kind: SheetKind, key: string | null = null) => sheetIndex(sheets, (s) => s.kind === kind && (key === null || s.key === key));
  const shots: Shot[] = [
    { id: 'S1', sheet: at('site'), arrive: EFFECT_MS.liftToPlan, hold: HOLD_MS.site, exit: 0 },
    { id: 'S2', sheet: -1, arrive: EFFECT_MS.dolly, hold: 0, exit: 0 },
  ];
  if (site.sheets.includes('L1')) shots.push({ id: 'S3', sheet: at('plan', 'L1'), arrive: 1850, hold: HOLD_MS.l1, exit: EFFECT_MS.fadeOut });
  const second = site.sheets.includes('TYP') ? 'TYP' : site.sheets[1];
  if (second) {
    shots.push({ id: 'S4', sheet: at('plan', second), arrive: Math.min(3200, drawInMs(facts.typicalRooms) + 636), hold: HOLD_MS.typical, exit: EFFECT_MS.fadeOut });
  }
  if (site.sheets.includes('RF')) shots.push({ id: 'S5', sheet: at('plan', 'RF'), arrive: EFFECT_MS.scanWipe, hold: HOLD_MS.roof, exit: 0 });
  if (facts.plansOnly) {
    shots.push({ id: 'S2', sheet: -1, arrive: EFFECT_MS.dolly, hold: 0, exit: 0 });
    return shots;
  }
  const stack = Math.min(EFFECT_MS.stackMax, EFFECT_MS.stackStorey * Math.max(0, facts.typicalCount - 1));
  shots.push(
    { id: 'S6', sheet: at('exploded'), arrive: EFFECT_MS.tilt + EFFECT_MS.link, hold: HOLD_MS.exploded, exit: 0 },
    {
      id: 'S7', sheet: at('block'),
      arrive: EFFECT_MS.retract + EFFECT_MS.close + EFFECT_MS.extrude + stack + EFFECT_MS.silhouette + EFFECT_MS.dimension,
      hold: HOLD_MS.block, exit: 0,
    },
    { id: 'S8', sheet: at('aerial'), arrive: EFFECT_MS.dollyZoom + EFFECT_MS.cutInPlace, hold: HOLD_MS.aerial, exit: 0 },
  );
  return shots;
};

/** The reading cycle: each sheet arrives finished by a 2D effect and holds long. R0 (once per visit) opens it. */
export const readingCycle = (site: DrawingSite, facts: Pick<CycleFacts, 'typicalCount'>, opening: boolean): Shot[] => {
  const sheets = sheetsFor(site);
  const at = (kind: SheetKind, key: string | null = null) => sheetIndex(sheets, (s) => s.kind === kind && (key === null || s.key === key));
  const hold = HOLD_MS.reading;
  const exit = EFFECT_MS.fadeOut;
  const shots: Shot[] = [];
  if (opening) shots.push({ id: 'R0', sheet: at('aerial'), arrive: 2500, hold, exit });
  shots.push({ id: 'R1', sheet: at('site'), arrive: EFFECT_MS.drawInReading, hold, exit });
  if (site.sheets.includes('L1')) shots.push({ id: 'R2', sheet: at('plan', 'L1'), arrive: 1500, hold, exit });
  const second = site.sheets.includes('TYP') ? 'TYP' : site.sheets[1];
  if (second) shots.push({ id: 'R3', sheet: at('plan', second), arrive: EFFECT_MS.drawInReading, hold, exit });
  if (site.sheets.includes('RF')) shots.push({ id: 'R4', sheet: at('plan', 'RF'), arrive: EFFECT_MS.scanWipeReading, hold, exit });
  shots.push(
    { id: 'R5', sheet: at('exploded'), arrive: EFFECT_MS.explode, hold, exit },
    { id: 'R6', sheet: at('block'), arrive: Math.min(EFFECT_MS.stackMax, EFFECT_MS.stackStorey * Math.max(0, facts.typicalCount - 1)) + EFFECT_MS.silhouette, hold, exit },
    { id: 'R7', sheet: at('aerial'), arrive: EFFECT_MS.drawInReading, hold, exit },
  );
  return shots;
};

export const cycleMs = (shots: readonly Shot[]): number => shots.reduce((sum, s) => sum + s.arrive + s.hold + s.exit, 0);

/** The share of a cycle spent animating (arrivals and exits request frames; holds do not). */
export const dutyCycle = (shots: readonly Shot[]): number => {
  const total = cycleMs(shots);
  return total ? shots.reduce((sum, s) => sum + s.arrive + s.exit, 0) / total : 0;
};
