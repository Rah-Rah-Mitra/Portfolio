import { beforeAll, describe, expect, it } from 'vitest';
import { decodeRings } from '../lib/drawings/decode';
import { drawInMs, EFFECT_MS, HOLD_MS } from '../lib/drawings/effects';
import {
  CHIP_QUALIFIER, chipNotes, chipTitle, cycleMs, deskCycle, dutyCycle, fflText, HERO_ORDER, plateLines, readingCycle,
  sheetsFor, sheetStoreys, startHero, type ChipFacts, type CycleFacts, type PlateState, type SheetDef, type Shot, type ShotId,
} from '../lib/drawings/sequence';
import { SHEET_LOADERS } from '../lib/drawings/sheetLoaders.generated';
import { LICENCE_URL, POSTER, SITES } from '../lib/drawings/site.generated';
import type { DrawingSheet, DrawingSite } from '../lib/drawings/types';

// The desk drawing set's sequence (lib/drawings/sequence.ts; plan §1, docs/portfolio/
// desk-drawing-set.md): which sheets each of the 14 buildings has and what they are
// called, the title plate's two fixed-width lines, the sheet chip's notes, and the
// two cycles' shot timings. All of it over the committed SITES and sheets, because
// these strings are what the desk prints about the data: a sheet the data has no
// storey for, a plate line that overflows the title block's cell, or a note naming
// something the data does not hold (a door swing, a hinge) is a wrong drawing.

const DAY = 86_400_000;
const STATES: readonly PlateState[] = ['LIVE', 'STILL', 'HELD', 'AT REST'];
const BANNED = /\b(swing|swings|hinge|hinged|hinges|arc|glazing|window|windows|column|columns|parapet|parapets|hatch|hatching)\b/i;

const site = (id: string): DrawingSite => {
  const found = SITES.find((s) => s.id === id);
  if (!found) throw new Error(`no site ${id}`);
  return found;
};

const sheetModules = new Map<string, Map<string, DrawingSheet>>();
beforeAll(async () => {
  for (const s of SITES) {
    const mod = await SHEET_LOADERS[s.id]();
    sheetModules.set(s.id, new Map(mod.SHEETS.map((sheet) => [sheet.key, sheet])));
  }
});
const sheetOf = (id: string, key: string): DrawingSheet => {
  const sheet = sheetModules.get(id)?.get(key);
  if (!sheet) throw new Error(`no sheet ${id} ${key}`);
  return sheet;
};

/** The cycle facts the film computes (drawingFilm.ts factsFor): the typical sheet's rooms (L1's where there is none), its storeys, L1's longest flight. */
const factsOf = (s: DrawingSite, plansOnly = false): CycleFacts => {
  const map = sheetModules.get(s.id)!;
  const typ = map.get('TYP') ?? map.get('L1');
  const typIndex = s.sheets.indexOf('TYP');
  const l1 = map.get('L1');
  let l1Risers = 0;
  if (l1) for (let k = 0; k < l1.flights.length; k += 9) l1Risers = Math.max(l1Risers, l1.flights[k + 6]);
  return {
    typicalRooms: typ ? decodeRings(typ.rings).length : 0,
    typicalCount: typIndex >= 0 ? [...s.plan].filter((c) => c === String(typIndex)).length : 1,
    l1Risers,
    plansOnly,
  };
};

/** Every chip fact combination a plan sheet can be given, plus the real sheet's own. */
const factCombos = (s: DrawingSite, def: SheetDef): ChipFacts[] => {
  const combos: ChipFacts[] = [{}, { squareM: 1 }, { squareM: 40, northRight: true }, { crop: null }, { crop: { x: 12.4, y: 7.6, w: 640, h: 480 } }];
  for (const partial of [false, true]) for (const openAir of [false, true]) combos.push({ squareM: 2, partial, openAir, lots: [126, 51] });
  if (def.key) {
    const g = sheetOf(s.id, def.key);
    combos.push({ squareM: 2, lots: g.lots, partial: g.partial, openAir: g.ext.length > 0 });
  }
  return combos;
};

const arrivals = (shots: readonly Shot[]) => shots.reduce((sum, s) => sum + s.arrive, 0);
const holds = (shots: readonly Shot[]) => shots.reduce((sum, s) => sum + s.hold, 0);

describe('drawing sequence — heroes', () => {
  it('HERO_ORDER names each of the 14 buildings once, in the plan’s order', () => {
    expect(HERO_ORDER).toEqual([
      'BLK_501', 'BLK_509', 'BLK_510', 'BLK_503', 'BLK_507', 'NC_514', 'BLK_505', 'BLK_511', 'BLK_502', 'BLK_512', 'MSCP_513',
      'BLK_504', 'BLK_508', 'BLK_506',
    ]);
    expect(HERO_ORDER).toHaveLength(14);
    expect(new Set(HERO_ORDER).size).toBe(14);
    expect([...HERO_ORDER].sort()).toEqual(SITES.map((s) => s.id).sort());
    for (const id of HERO_ORDER) expect(Object.keys(SHEET_LOADERS)).toContain(id);
  });

  it('startHero advances one building per UTC day and comes round every 14 days', () => {
    expect(startHero(0)).toBe(0);
    expect(startHero(DAY - 1)).toBe(0);
    expect(startHero(DAY)).toBe(1);
    expect(startHero(13 * DAY + DAY / 2)).toBe(13);
    expect(startHero(14 * DAY)).toBe(0);
    const today = Date.UTC(2026, 9, 10);
    for (let d = 0; d < 30; d++) {
      const t = today + d * DAY;
      const i = startHero(t);
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(HERO_ORDER.length);
      expect(startHero(t + DAY - 1)).toBe(i); // the whole day starts on one building
      expect(startHero(t + DAY)).toBe((i + 1) % HERO_ORDER.length);
      expect(startHero(t + 14 * DAY)).toBe(i);
    }
    // Two weeks of visits start on every building once.
    expect(new Set(Array.from({ length: 14 }, (_, d) => startHero(today + d * DAY))).size).toBe(14);
  });
});

describe('drawing sequence — sheets', () => {
  it('gives every block and the car park 7 sheets and the hawker centre 6 (no roof plan), numbered 01 …', () => {
    for (const s of SITES) {
      const sheets = sheetsFor(s);
      const want = s.id === 'NC_514' ? 6 : 7;
      expect(sheets, s.id).toHaveLength(want);
      sheets.forEach((sheet, i) => {
        expect(sheet.no).toBe(i + 1);
        expect(sheet.of).toBe(want);
        expect(sheet.title.startsWith(`${String(i + 1).padStart(2, '0')} `), sheet.title).toBe(true);
      });
      const kinds = sheets.map((sheet) => sheet.kind);
      const keys = sheets.map((sheet) => sheet.key);
      if (s.id === 'NC_514') {
        expect(kinds).toEqual(['site', 'plan', 'plan', 'exploded', 'block', 'aerial']);
        expect(keys).toEqual([null, 'L1', 'L2', null, null, null]);
      } else {
        expect(kinds, s.id).toEqual(['site', 'plan', 'plan', 'plan', 'exploded', 'block', 'aerial']);
        expect(keys, s.id).toEqual([null, 'L1', 'TYP', 'RF', null, null, null]);
      }
      // A plan sheet only for a sheet the generated set has.
      for (const sheet of sheets) if (sheet.kind === 'plan') expect(sheetModules.get(s.id)!.has(sheet.key!), `${s.id} ${sheet.key}`).toBe(true);
    }
    // The hawker centre's roof has no rooms, so no storey is drawn by a roof plan.
    const nc = site('NC_514');
    expect(nc.sheets).toEqual(['L1', 'L2']);
    expect(nc.plan[nc.plan.length - 1]).toBe('-');
  });

  it('titles BLK 501’s sheets as the plan does', () => {
    expect(sheetsFor(site('BLK_501')).map((s) => s.title)).toEqual([
      '01 SITE PLAN',
      '02 L1 PLAN · FFL ±0.00',
      '03 TYPICAL PLAN L2–L20 (×19) · FFL +3.60 TO +54.00',
      '04 ROOF PLAN · RF +56.80 · MODEL TOP +60.20',
      '05 EXPLODED AXONOMETRIC · L1 / L2–L20 / RF',
      '06 AXONOMETRIC · BLOCK · L1–L20 + RF',
      '07 AERIAL NE · POSTER CAMERA',
    ]);
    expect(sheetsFor(site('BLK_501')).map((s) => s.word)).toEqual(['SITE', 'L1', 'TYPICAL', 'ROOF', 'EXPLODED', 'BLOCK', 'AERIAL']);
  });

  it('calls the car park’s typical sheet a deck plan, L2–L7 (×6)', () => {
    const sheets = sheetsFor(site('MSCP_513'));
    expect(sheets[2].title).toBe('03 DECK PLAN L2–L7 (×6) · FFL +3.00 TO +18.00');
    expect(sheets[2].word).toBe('DECK');
    expect(sheets[3].title).toBe('04 ROOF PLAN · RF +21.00 · MODEL TOP +28.04');
    expect(sheets[4].title).toBe('05 EXPLODED AXONOMETRIC · L1 / L2–L7 / RF');
    expect(sheets[5].title).toBe('06 AXONOMETRIC · BLOCK · L1–L7 + RF');
  });

  it('titles the hawker centre’s L2 by its own level and leaves RF out of its exploded view', () => {
    expect(sheetsFor(site('NC_514')).map((s) => s.title)).toEqual([
      '01 SITE PLAN',
      '02 L1 PLAN · FFL ±0.00',
      '03 L2 PLAN · FFL +4.20',
      '04 EXPLODED AXONOMETRIC · L1 / L2',
      '05 AXONOMETRIC · BLOCK · L1–L2 + RF',
      '06 AERIAL NE · POSTER CAMERA',
    ]);
    expect(sheetsFor(site('NC_514')).map((s) => s.word)).toEqual(['SITE', 'L1', 'L2', 'EXPLODED', 'BLOCK', 'AERIAL']);
  });

  it('reads every typical title’s range, count and levels from the data, matching the generated sheet', () => {
    for (const s of SITES) {
      if (!s.sheets.includes('TYP')) continue;
      const storeys = sheetStoreys(s, 'TYP');
      const sheet = sheetOf(s.id, 'TYP');
      expect(storeys.length, s.id).toBe(sheet.count);
      // Contiguous, from L2 to the storey under the roof.
      expect(storeys[0]).toBe(1);
      expect(storeys[storeys.length - 1]).toBe(s.ffl.length - 2);
      storeys.forEach((v, i) => expect(v).toBe(storeys[0] + i));
      const def = sheetsFor(s).find((d) => d.key === 'TYP')!;
      const word = s.kind === 'mscp' ? 'DECK' : 'TYPICAL';
      expect(def.title).toBe(
        `03 ${word} PLAN ${sheet.storeys} (×${sheet.count}) · FFL ${fflText(s.ffl[storeys[0]] / 100)} TO ${fflText(s.ffl[storeys[storeys.length - 1]] / 100)}`,
      );
      const roof = sheetsFor(s).find((d) => d.key === 'RF')!;
      expect(roof.title).toBe(`04 ROOF PLAN · RF ${fflText(s.ffl[s.ffl.length - 1] / 100)} · MODEL TOP ${fflText(s.top / 100)}`);
      // MODEL TOP is the model's top, a tag above the roof level, never the roof itself.
      expect(s.top).toBeGreaterThan(s.ffl[s.ffl.length - 1]);
      expect(sheetsFor(s).find((d) => d.kind === 'block')!.title).toBe(`06 AXONOMETRIC · BLOCK · ${s.levels}`);
    }
    expect(sheetStoreys(site('BLK_501'), 'L1')).toEqual([0]);
    expect(sheetStoreys(site('BLK_501'), 'RF')).toEqual([20]);
    expect(sheetStoreys(site('NC_514'), 'L2')).toEqual([1]);
    expect(sheetStoreys(site('NC_514'), 'RF')).toEqual([]);
  });

  it('prints levels as the drawings do: ±0.00 at the ground, a sign and two decimals elsewhere', () => {
    expect(fflText(0)).toBe('±0.00');
    expect(fflText(-0)).toBe('±0.00');
    expect(fflText(0.004)).toBe('±0.00');
    expect(fflText(-0.004)).toBe('±0.00');
    expect(fflText(56.8)).toBe('+56.80');
    expect(fflText(3.6)).toBe('+3.60');
    expect(fflText(60.2)).toBe('+60.20');
    expect(fflText(28.04)).toBe('+28.04');
    expect(fflText(-1.2)).toBe('−1.20'); // U+2212, not a hyphen
    expect(fflText(-1.2).charCodeAt(0)).toBe(0x2212);
  });

  it('restates the HUD’s fflText exactly (the runtime must not import the HUD chunk)', async () => {
    const hud = await import('../components/workbench/estate/live/EstateHud');
    const values = [0, -0, 0.001, -0.004, 0.006, 3.6, 12, 45.6, 56.8, 60.2, -1.2, -0.3, 74.2];
    for (const s of SITES) for (const f of s.ffl) values.push(f / 100);
    for (const v of values) expect(fflText(v), String(v)).toBe(hud.fflText(v));
  });
});

describe('drawing sequence — title plate', () => {
  it('fits both plate lines in their cells (≤ 30 and ≤ 26 characters) for every sheet, building and state', () => {
    let longest = 0;
    for (const s of SITES) {
      for (const def of sheetsFor(s)) {
        for (const state of STATES) {
          const [one, two] = plateLines(s, def, state);
          expect(one.length, one).toBeLessThanOrEqual(30);
          expect(two.length, two).toBeLessThanOrEqual(26);
          expect(one).toMatch(/^0[1-7] OF 0[67] · /);
          expect(two).toMatch(/^GENERATED SAMPLE · /);
          expect(one).toBe(`${String(def.no).padStart(2, '0')} OF ${String(def.of).padStart(2, '0')} · ${s.short} ${def.word}`);
          expect(two).toBe(`GENERATED SAMPLE · ${state}`);
          longest = Math.max(longest, one.length);
        }
      }
    }
    expect(longest).toBe(28); // '05 OF 07 · MSCP 513 EXPLODED'
    for (const state of STATES) {
      const [one, two] = plateLines(null, null, state);
      expect(one).toBe('07 OF 07 · ESTATE AERIAL NE');
      expect(one.length).toBeLessThanOrEqual(30);
      expect(two.length).toBeLessThanOrEqual(26);
    }
  });

  it('prints the plan’s example plate for BLK 501’s typical sheet', () => {
    const typical = sheetsFor(site('BLK_501'))[2];
    expect(plateLines(site('BLK_501'), typical, 'LIVE')).toEqual(['03 OF 07 · BLK 501 TYPICAL', 'GENERATED SAMPLE · LIVE']);
    expect(plateLines(site('BLK_501'), typical, 'AT REST')[1]).toBe('GENERATED SAMPLE · AT REST');
  });
});

describe('drawing sequence — sheet chip', () => {
  it('titles a building’s sheets after the building and the estate’s after Sample Town N5', () => {
    const blk = site('BLK_501');
    const sheets = sheetsFor(blk);
    expect(chipTitle(blk, sheets[2])).toBe('BLK 501 · 03 TYPICAL PLAN L2–L20 (×19) · FFL +3.60 TO +54.00');
    expect(chipTitle(blk, sheets[0])).toBe('SAMPLE TOWN N5 · 01 SITE PLAN');
    expect(chipTitle(blk, sheets[6])).toBe('SAMPLE TOWN N5 · 07 AERIAL NE · POSTER CAMERA');
    expect(chipTitle(blk, sheets[5])).toBe('BLK 501 · 06 AXONOMETRIC · BLOCK · L1–L20 + RF');
  });

  it('notes the site plan’s scale, north, kerb source and the building marked', () => {
    const blk = site('BLK_501');
    expect(chipNotes(blk, sheetsFor(blk)[0], { squareM: 2 })).toBe('1 SQ = 2 M · N ↑ · KERBS FROM THE GROUND RASTER · BLK 501 MARKED');
    // No scale known yet: no empty part, no doubled separator.
    expect(chipNotes(blk, sheetsFor(blk)[0], {})).toBe('N ↑ · KERBS FROM THE GROUND RASTER · BLK 501 MARKED');
  });

  it('prints every rung of the scale ladder as whole metres per square', () => {
    const blk = site('BLK_501');
    const ladder = [24, 12, 8, 6, 4.8, 2.4, 1.2, 0.6];
    expect(ladder.map((k) => chipNotes(blk, sheetsFor(blk)[1], { squareM: 24 / k }).split(' · ')[0])).toEqual([
      '1 SQ = 1 M', '1 SQ = 2 M', '1 SQ = 3 M', '1 SQ = 4 M', '1 SQ = 5 M', '1 SQ = 10 M', '1 SQ = 20 M', '1 SQ = 40 M',
    ]);
  });

  it('notes a block’s plans as the plan does: walls and lift core inferred, doors as openings, open air where the data has it', () => {
    const blk = site('BLK_501');
    const [, l1, typ, rf] = sheetsFor(blk);
    const real = (def: SheetDef): ChipFacts => {
      const g = sheetOf(blk.id, def.key!);
      return { squareM: 2, northRight: true, lots: g.lots, partial: g.partial, openAir: g.ext.length > 0 };
    };
    expect(chipNotes(blk, typ, real(typ))).toBe('1 SQ = 2 M · N → · WALLS AND LIFT CORE INFERRED · DOORS AS OPENINGS');
    expect(chipNotes(blk, l1, real(l1))).toBe('1 SQ = 2 M · N → · WALLS AND LIFT CORE INFERRED · DOORS AS OPENINGS · VOID DECK OPEN-AIR');
    expect(chipNotes(blk, rf, real(rf))).toBe('1 SQ = 2 M · N → · WALLS AND LIFT CORE INFERRED · DOORS AS OPENINGS · ROOF DECK OPEN-AIR');
    expect(chipNotes(blk, typ, { squareM: 2 })).toBe('1 SQ = 2 M · N ↑ · WALLS AND LIFT CORE INFERRED · DOORS AS OPENINGS');
  });

  it('counts the car park’s lots per deck from the data, and its roof as an ordinary plan', () => {
    const cp = site('MSCP_513');
    const [, l1, typ, rf] = sheetsFor(cp);
    const deck = sheetOf(cp.id, 'TYP');
    expect(deck.lots).toEqual([126, 51]);
    expect(chipNotes(cp, typ, { squareM: 2, lots: deck.lots, partial: deck.partial, openAir: deck.ext.length > 0 }))
      .toBe('1 SQ = 2 M · N ↑ · UNFILLED = NOT A ROOM IN THE DATA · 126 CAR · 51 MOTORCYCLE LOTS PER DECK');
    const ground = sheetOf(cp.id, 'L1');
    expect(chipNotes(cp, l1, { squareM: 2, lots: ground.lots })).toBe(
      `1 SQ = 2 M · N ↑ · UNFILLED = NOT A ROOM IN THE DATA · ${ground.lots[0]} CAR · ${ground.lots[1]} MOTORCYCLE LOTS PER DECK`,
    );
    const roof = sheetOf(cp.id, 'RF');
    expect(roof.lots).toEqual([0, 0]);
    expect(chipNotes(cp, rf, { squareM: 2, lots: roof.lots, openAir: roof.ext.length > 0 }))
      .toBe('1 SQ = 2 M · N ↑ · WALLS AND LIFT CORE INFERRED · DOORS AS OPENINGS · OPEN-AIR SPACES');
    // A block never prints lots.
    for (const s of SITES) {
      if (s.kind === 'mscp') continue;
      for (const def of sheetsFor(s)) for (const facts of factCombos(s, def)) expect(chipNotes(s, def, facts)).not.toMatch(/LOTS/);
    }
  });

  it('notes the partial sheet (the hawker centre’s L2) as an outline with no wall fill, and nothing else as partial', () => {
    const nc = site('NC_514');
    const l2 = sheetsFor(nc)[2];
    const g = sheetOf(nc.id, 'L2');
    expect(g.partial).toBe(true);
    expect(chipNotes(nc, l2, { squareM: 1, lots: g.lots, partial: g.partial, openAir: g.ext.length > 0 }))
      .toBe('1 SQ = 1 M · N ↑ · OUTLINE OF L1 BELOW · NO WALL FILL');
    // Partial wins over open air and over inferred walls.
    expect(chipNotes(nc, l2, { squareM: 1, partial: true, openAir: true })).toBe('1 SQ = 1 M · N ↑ · OUTLINE OF L1 BELOW · NO WALL FILL');
    for (const s of SITES) {
      for (const def of sheetsFor(s)) {
        if (def.kind !== 'plan') continue;
        const real = sheetOf(s.id, def.key!);
        const notes = chipNotes(s, def, { squareM: 2, lots: real.lots, partial: real.partial, openAir: real.ext.length > 0 });
        expect(notes.includes('OUTLINE OF L1 BELOW'), `${s.id} ${def.key}`).toBe(s.id === 'NC_514' && def.key === 'L2');
      }
    }
  });

  it('notes the axonometrics as massing to the roof level with walls inferred, whatever facts it is handed', () => {
    for (const s of SITES) {
      for (const def of sheetsFor(s)) {
        if (def.kind !== 'exploded' && def.kind !== 'block') continue;
        for (const facts of factCombos(s, def)) expect(chipNotes(s, def, facts)).toBe('MASSING: FOOTPRINT TO RF LEVEL · WALLS INFERRED');
      }
    }
  });

  it('notes the aerial’s poster camera and its crop, read off the committed poster', () => {
    const blk = site('BLK_501');
    const aerial = sheetsFor(blk)[6];
    expect(POSTER.vfovDeg.toFixed(2)).toBe('42.18');
    expect([POSTER.w, POSTER.h]).toEqual([1600, 1200]);
    expect(chipNotes(blk, aerial, {})).toBe('POSTER CAMERA · VFOV 42.18° · FULL FRAME 1600 × 1200');
    expect(chipNotes(blk, aerial, { crop: null })).toBe('POSTER CAMERA · VFOV 42.18° · FULL FRAME 1600 × 1200');
    expect(chipNotes(blk, aerial, { crop: { x: 100.4, y: 50.6, w: 800, h: 600 } })).toBe('POSTER CAMERA · VFOV 42.18° · CROP x100–900 y51–651');
    expect(chipNotes(blk, aerial, { crop: { x: 0, y: 0, w: 1600, h: 1200 }, squareM: 2, northRight: true })).toBe('POSTER CAMERA · VFOV 42.18° · CROP x0–1600 y0–1200');
  });

  it('never names a door swing, hinge, glazing, column or parapet, and never prints an empty part', () => {
    for (const s of SITES) {
      for (const def of sheetsFor(s)) {
        expect(def.title).not.toMatch(BANNED);
        expect(chipTitle(s, def)).not.toMatch(BANNED);
        for (const facts of factCombos(s, def)) {
          const notes = chipNotes(s, def, facts);
          expect(notes, `${s.id} ${def.title}`).not.toMatch(BANNED);
          expect(notes).not.toMatch(/(^ · )|( · $)|( ·  · )|undefined|NaN/);
          for (const part of notes.split(' · ')) expect(part.trim().length).toBeGreaterThan(0);
        }
      }
    }
    expect(CHIP_QUALIFIER).not.toMatch(BANNED);
    expect(CHIP_QUALIFIER).toContain('not a real town or HDB’s own plans');
    expect(CHIP_QUALIFIER.endsWith(LICENCE_URL)).toBe(true);
  });

  // A void deck is named only where the data has one (a block's L1); the hawker
  // centre's open-air forecourt and walkway, and the car park's roof garden, are
  // 'OPEN-AIR SPACES'.
  it('names a void deck only on a sheet whose open-air rooms include one', () => {
    for (const s of SITES) {
      for (const def of sheetsFor(s)) {
        if (def.kind !== 'plan') continue;
        const g = sheetOf(s.id, def.key!);
        const notes = chipNotes(s, def, { squareM: 2, lots: g.lots, partial: g.partial, openAir: g.ext.length > 0 });
        const codes = g.codes.split('|');
        const hasVoidDeck = g.ext.some((ring) => codes[ring] === 'VOID');
        expect(notes.includes('VOID DECK'), `${s.id} ${def.key}: open-air rooms ${g.ext.map((r) => codes[r]).join(', ')}`).toBe(hasVoidDeck);
      }
    }
  });
});

describe('drawing sequence — the desk film', () => {
  it('runs BLK 501’s cycle in exactly 86,360 ms: 21.9 s of arrivals, 64.5 s of holds, 25.3 % duty', () => {
    const blk = site('BLK_501');
    const facts = factsOf(blk);
    expect(facts.typicalRooms).toBe(48);
    expect(facts.typicalCount).toBe(19);
    const shots = deskCycle(blk, facts);
    expect(shots.map((s) => [s.id, s.sheet, s.arrive, s.hold, s.exit])).toEqual([
      ['S1', 0, 2200, 8000, 0],
      ['S2', -1, 1400, 0, 0],
      ['S3', 1, 1850, 8000, 400],
      ['S4', 2, 3100, 10000, 400], // E2 2,464 for 48 rooms + 636
      ['S5', 3, 1100, 6000, 0],
      ['S6', 4, 3300, 10000, 0],
      ['S7', 5, 3910, 10500, 0], // 250 + 1,000 + 600 + 18 × 70 + 400 + 400
      ['S8', 6, 4200, 12000, 0],
    ]);
    expect(cycleMs(shots)).toBe(86_360);
    expect(arrivals(shots)).toBe(21_060);
    expect(holds(shots)).toBe(64_500);
    expect(dutyCycle(shots)).toBeLessThanOrEqual(0.3);
    expect(dutyCycle(shots)).toBeCloseTo(21_860 / 86_360, 10);
  });

  it('builds each arrival from its named effect (S1–S5 distinct)', () => {
    for (const s of SITES) {
      const facts = factsOf(s);
      const shots = deskCycle(s, facts);
      const by = new Map(shots.map((shot) => [shot.id, shot]));
      expect(by.get('S1')!.arrive).toBe(EFFECT_MS.liftToPlan);
      expect(by.get('S2')!.arrive).toBe(EFFECT_MS.dolly);
      expect(by.get('S3')!.arrive).toBe(1850);
      expect(by.get('S4')!.arrive).toBe(Math.min(3200, drawInMs(facts.typicalRooms) + 636));
      if (s.sheets.includes('RF')) expect(by.get('S5')!.arrive).toBe(EFFECT_MS.scanWipe);
      const stack = Math.min(EFFECT_MS.stackMax, EFFECT_MS.stackStorey * Math.max(0, facts.typicalCount - 1));
      expect(by.get('S6')!.arrive).toBe(EFFECT_MS.tilt + EFFECT_MS.link);
      expect(by.get('S7')!.arrive).toBe(EFFECT_MS.retract + EFFECT_MS.close + EFFECT_MS.extrude + stack + EFFECT_MS.silhouette + EFFECT_MS.dimension);
      expect(by.get('S8')!.arrive).toBe(EFFECT_MS.dollyZoom + EFFECT_MS.cutInPlace);
      const early = (['S1', 'S2', 'S3', 'S4', 'S5'] as ShotId[]).filter((id) => by.has(id)).map((id) => by.get(id)!.arrive);
      expect(new Set(early).size, s.id).toBe(early.length);
      // Only the plans fade out; every other shot runs straight into the next.
      for (const shot of shots) expect(shot.exit, `${s.id} ${shot.id}`).toBe(shot.id === 'S3' || shot.id === 'S4' ? EFFECT_MS.fadeOut : 0);
    }
  });

  it('walks every sheet once, in order: site, plans, exploded, block, aerial (the hawker centre without S5)', () => {
    for (const s of SITES) {
      const shots = deskCycle(s, factsOf(s));
      const sheets = sheetsFor(s);
      const placed = shots.filter((shot) => shot.sheet >= 0).map((shot) => shot.sheet);
      expect(placed, s.id).toEqual(sheets.map((_, i) => i));
      expect(shots.filter((shot) => shot.sheet < 0).map((shot) => shot.id)).toEqual(['S2']);
      expect(shots[1].id).toBe('S2'); // the dolly from the site into the building
      const ids = shots.map((shot) => shot.id);
      expect(ids, s.id).toEqual(s.id === 'NC_514' ? ['S1', 'S2', 'S3', 'S4', 'S6', 'S7', 'S8'] : ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']);
      for (const shot of shots) if (shot.sheet >= 0) expect(sheets[shot.sheet].kind).toBe(
        ({ S1: 'site', S3: 'plan', S4: 'plan', S5: 'plan', S6: 'exploded', S7: 'block', S8: 'aerial' } as Record<string, string>)[shot.id],
      );
    }
    // The hawker centre's S4 is its L2: the second plan where there is no typical one.
    const nc = site('NC_514');
    const s4 = deskCycle(nc, factsOf(nc)).find((shot) => shot.id === 'S4')!;
    expect(sheetsFor(nc)[s4.sheet].key).toBe('L2');
  });

  it('keeps every hero’s desk film at or under 30 % rAF duty', () => {
    for (const s of SITES) {
      const shots = deskCycle(s, factsOf(s));
      expect(dutyCycle(shots), s.id).toBeLessThanOrEqual(0.3);
      expect(dutyCycle(shots), s.id).toBeGreaterThan(0.2);
    }
    expect(dutyCycle([])).toBe(0);
  });

  it('holds every sheet at least 2.5× its arrival (effects.ts HOLD_MS)', () => {
    for (const s of SITES) {
      for (const shot of deskCycle(s, factsOf(s))) {
        if (shot.sheet < 0) continue; // the dolly is a camera move between sheets, not a sheet
        expect(shot.hold, `${s.id} ${shot.id}: hold ${shot.hold} for arrival ${shot.arrive}`).toBeGreaterThanOrEqual(2.5 * shot.arrive);
      }
    }
    // The welcome too: 4,800 ms in, 12 s held.
    expect(HOLD_MS.welcome).toBeGreaterThanOrEqual(2.5 * (EFFECT_MS.ruleIn + 3000 + 1200));
  });

  it('pins every hero’s desk cycle as measured over the committed sheets', () => {
    const measured = Object.fromEntries(SITES.map((s) => [s.id, cycleMs(deskCycle(s, factsOf(s)))]));
    expect(measured).toEqual({
      BLK_501: 86_360, BLK_502: 86_360, BLK_503: 86_436, BLK_504: 86_436, BLK_505: 86_500, BLK_506: 86_500,
      BLK_507: 86_040, BLK_508: 86_040, BLK_509: 86_180, BLK_510: 86_180, BLK_511: 86_180, BLK_512: 85_900,
      MSCP_513: 85_550, NC_514: 78_100,
    });
    // A full rotation is about 20 minutes.
    const rotation = Object.values(measured).reduce((a, b) => a + b, 0);
    expect(rotation / 60_000).toBeGreaterThan(19.5);
    expect(rotation / 60_000).toBeLessThan(20.5);
  });

  it('runs every other hero’s desk cycle in 85.5–86.5 s, the hawker centre (no roof plan, no stack) in 78.1 s', () => {
    for (const s of SITES) {
      const ms = cycleMs(deskCycle(s, factsOf(s)));
      if (s.id === 'NC_514') { expect(ms).toBe(78_100); continue; }
      expect(ms, `${s.id}: ${ms} ms`).toBeGreaterThanOrEqual(85_500);
      expect(ms, `${s.id}: ${ms} ms`).toBeLessThanOrEqual(86_500);
    }
  });

  it('cuts the axonometric acts from a plans-only cycle and dollies back out after the roof (43.9 s for BLK 501)', () => {
    const blk = site('BLK_501');
    const shots = deskCycle(blk, factsOf(blk, true));
    expect(shots.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S2']);
    expect(shots[shots.length - 1].sheet).toBe(-1);
    expect(shots[shots.length - 1].arrive).toBe(EFFECT_MS.dolly);
    expect(cycleMs(shots)).toBe(43_850);
    for (const s of SITES) {
      const plans = deskCycle(s, factsOf(s, true));
      const sheets = sheetsFor(s);
      for (const shot of plans) if (shot.sheet >= 0) expect(['site', 'plan']).toContain(sheets[shot.sheet].kind);
      expect(plans.some((shot) => ['S6', 'S7', 'S8'].includes(shot.id)), s.id).toBe(false);
      // Same opening shots as the full cycle.
      expect(plans.slice(0, -1)).toEqual(deskCycle(s, factsOf(s)).filter((shot) => !['S6', 'S7', 'S8'].includes(shot.id)));
      expect(dutyCycle(plans), s.id).toBeLessThanOrEqual(0.3);
    }
  });
});

describe('drawing sequence — the reading cycle', () => {
  it('runs BLK 501’s reading cycle in about 183 s at ≤ 10 % duty, every sheet arriving finished and holding 24 s', () => {
    const blk = site('BLK_501');
    const shots = readingCycle(blk, factsOf(blk), false);
    expect(shots.map((s) => [s.id, s.sheet, s.arrive, s.hold, s.exit])).toEqual([
      ['R1', 0, 2000, 24000, 400],
      ['R2', 1, 1500, 24000, 400],
      ['R3', 2, 2000, 24000, 400],
      ['R4', 3, 1600, 24000, 400],
      ['R5', 4, 1600, 24000, 400],
      ['R6', 5, 1660, 24000, 400], // 18 × 70 + 400
      ['R7', 6, 2000, 24000, 400],
    ]);
    expect(cycleMs(shots)).toBe(183_160);
    expect(Math.round(cycleMs(shots) / 1000)).toBe(183);
    expect(dutyCycle(shots)).toBeLessThanOrEqual(0.1);
    expect(dutyCycle(shots)).toBeCloseTo(15_160 / 183_160, 10); // ≈ 8.3 %
  });

  it('opens with R0 on the aerial only when asked, once, first', () => {
    for (const s of SITES) {
      const facts = factsOf(s);
      const plain = readingCycle(s, facts, false);
      const opening = readingCycle(s, facts, true);
      expect(plain.some((shot) => shot.id === 'R0'), s.id).toBe(false);
      expect(opening.filter((shot) => shot.id === 'R0')).toHaveLength(1);
      expect(opening[0].id).toBe('R0');
      expect(sheetsFor(s)[opening[0].sheet].kind).toBe('aerial');
      expect(opening.slice(1)).toEqual(plain);
      expect(cycleMs(opening) - cycleMs(plain)).toBe(2500 + HOLD_MS.reading + EFFECT_MS.fadeOut);
    }
  });

  it('places every sheet once in order, holds each 24 s and stays at or under 10 % duty for every hero', () => {
    for (const s of SITES) {
      const facts = factsOf(s);
      for (const opening of [false, true]) {
        const shots = readingCycle(s, facts, opening);
        expect(dutyCycle(shots), `${s.id} ${opening}`).toBeLessThanOrEqual(0.1);
        for (const shot of shots) {
          expect(shot.hold).toBe(HOLD_MS.reading);
          expect(shot.exit).toBe(EFFECT_MS.fadeOut);
          expect(shot.sheet).toBeGreaterThanOrEqual(0);
          expect(shot.hold).toBeGreaterThanOrEqual(2.5 * shot.arrive);
        }
      }
      const plain = readingCycle(s, facts, false);
      expect(plain.map((shot) => shot.sheet), s.id).toEqual(sheetsFor(s).map((_, i) => i));
      expect(plain.map((shot) => shot.id), s.id).toEqual(s.id === 'NC_514' ? ['R1', 'R2', 'R3', 'R5', 'R6', 'R7'] : ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
    }
  });
});
