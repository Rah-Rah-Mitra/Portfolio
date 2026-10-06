import { describe, expect, it } from 'vitest';
import {
  ESTATE_SITE_IDS, ESTATE_SITE_STOREYS, ESTATE_STOREY_FFL, isEstateSiteId, normaliseStoreyTag,
  siteKindOf, siteStoreyTag, storeyFfl, storeyIndex, type EstateSiteId,
} from '../lib/estate/ids';

// The storey table below is copied, value for value, from `storeys` in every
// model/<ID>/<ID>_engine.json of the Bonsai-Estate v1.1 export (read
// 2026-10-05). ids.ts builds its table from the storey rules instead, so the
// two are independent: if one moves, justify it against the engine data.
const ENGINE_STOREYS: Record<EstateSiteId, string> = {
  BLK_501: 'L1=0 L2=3.6 L3=6.4 L4=9.2 L5=12 L6=14.8 L7=17.6 L8=20.4 L9=23.2 L10=26 L11=28.8 L12=31.6 L13=34.4 L14=37.2 L15=40 L16=42.8 L17=45.6 L18=48.4 L19=51.2 L20=54 RF=56.8',
  BLK_502: 'L1=0 L2=3.6 L3=6.4 L4=9.2 L5=12 L6=14.8 L7=17.6 L8=20.4 L9=23.2 L10=26 L11=28.8 L12=31.6 L13=34.4 L14=37.2 L15=40 L16=42.8 L17=45.6 L18=48.4 L19=51.2 L20=54 RF=56.8',
  BLK_503: 'L1=0 L2=3.6 L3=6.4 L4=9.2 L5=12 L6=14.8 L7=17.6 L8=20.4 L9=23.2 L10=26 L11=28.8 L12=31.6 L13=34.4 L14=37.2 L15=40 L16=42.8 L17=45.6 L18=48.4 L19=51.2 L20=54 L21=56.8 L22=59.6 RF=62.4',
  BLK_504: 'L1=0 L2=3.6 L3=6.4 L4=9.2 L5=12 L6=14.8 L7=17.6 L8=20.4 L9=23.2 L10=26 L11=28.8 L12=31.6 L13=34.4 L14=37.2 L15=40 L16=42.8 L17=45.6 L18=48.4 L19=51.2 L20=54 L21=56.8 L22=59.6 RF=62.4',
  BLK_505: 'L1=0 L2=3.6 L3=6.4 L4=9.2 L5=12 L6=14.8 L7=17.6 L8=20.4 L9=23.2 L10=26 L11=28.8 L12=31.6 L13=34.4 L14=37.2 L15=40 L16=42.8 L17=45.6 L18=48.4 L19=51.2 L20=54 L21=56.8 L22=59.6 L23=62.4 L24=65.2 L25=68 RF=70.8',
  BLK_506: 'L1=0 L2=3.6 L3=6.4 L4=9.2 L5=12 L6=14.8 L7=17.6 L8=20.4 L9=23.2 L10=26 L11=28.8 L12=31.6 L13=34.4 L14=37.2 L15=40 L16=42.8 L17=45.6 L18=48.4 L19=51.2 L20=54 L21=56.8 L22=59.6 L23=62.4 L24=65.2 L25=68 RF=70.8',
  BLK_507: 'L1=0 L2=3.6 L3=6.4 L4=9.2 L5=12 L6=14.8 L7=17.6 L8=20.4 L9=23.2 L10=26 L11=28.8 L12=31.6 L13=34.4 L14=37.2 RF=40',
  BLK_508: 'L1=0 L2=3.6 L3=6.4 L4=9.2 L5=12 L6=14.8 L7=17.6 L8=20.4 L9=23.2 L10=26 L11=28.8 L12=31.6 L13=34.4 L14=37.2 RF=40',
  BLK_509: 'L1=0 L2=3.6 L3=6.4 L4=9.2 L5=12 L6=14.8 L7=17.6 L8=20.4 L9=23.2 L10=26 L11=28.8 L12=31.6 L13=34.4 L14=37.2 L15=40 L16=42.8 RF=45.6',
  BLK_510: 'L1=0 L2=3.6 L3=6.4 L4=9.2 L5=12 L6=14.8 L7=17.6 L8=20.4 L9=23.2 L10=26 L11=28.8 L12=31.6 L13=34.4 L14=37.2 L15=40 L16=42.8 RF=45.6',
  BLK_511: 'L1=0 L2=3.6 L3=6.4 L4=9.2 L5=12 L6=14.8 L7=17.6 L8=20.4 L9=23.2 L10=26 L11=28.8 L12=31.6 L13=34.4 L14=37.2 L15=40 L16=42.8 RF=45.6',
  BLK_512: 'L1=0 L2=3.6 L3=6.4 L4=9.2 L5=12 L6=14.8 L7=17.6 L8=20.4 L9=23.2 L10=26 L11=28.8 L12=31.6 RF=34.4',
  MSCP_513: 'L1=0 L2=3 L3=6 L4=9 L5=12 L6=15 L7=18 RF=21',
  NC_514: 'L1=0 L2=4.2 RF=8.2',
};

const parseEngine = (text: string) => text.split(' ').map((pair) => {
  const [tag, ffl] = pair.split('=');
  return { tag, ffl: Number(ffl) };
});

describe('estate site ids', () => {
  it('lists the 14 buildings, upstream stems, SITE excluded', () => {
    expect(ESTATE_SITE_IDS).toHaveLength(14);
    expect(new Set(ESTATE_SITE_IDS).size).toBe(14);
    expect(ESTATE_SITE_IDS.filter((id) => id.startsWith('BLK_'))).toHaveLength(12);
    expect(ESTATE_SITE_IDS).toContain('MSCP_513');
    expect(ESTATE_SITE_IDS).toContain('NC_514');
    expect(ESTATE_SITE_IDS).not.toContain('SITE');
  });

  it('accepts exactly those ids, as written', () => {
    for (const id of ESTATE_SITE_IDS) expect(isEstateSiteId(id)).toBe(true);
    for (const junk of ['SITE', 'BLK_599', 'BLK_500', 'blk_509', 'BLK509', ' BLK_509', '509', 'MSCP_514', '', null, undefined, 509, {}, ['BLK_509']]) {
      expect(isEstateSiteId(junk), String(junk)).toBe(false);
    }
  });

  it('derives the kind from the stem', () => {
    expect(siteKindOf('BLK_509')).toBe('block');
    expect(siteKindOf('MSCP_513')).toBe('mscp');
    expect(siteKindOf('NC_514')).toBe('nc');
  });
});

describe('normaliseStoreyTag', () => {
  it.each([
    ['L5', 'L5'], ['l5', 'L5'], ['L05', 'L5'], ['l05', 'L5'], ['L005', 'L5'],
    ['L1', 'L1'], ['L01', 'L1'], ['L10', 'L10'], ['L25', 'L25'], ['L99', 'L99'],
    ['RF', 'RF'], ['rf', 'RF'], ['Rf', 'RF'], [' L5 ', 'L5'], ['\tRF\n', 'RF'],
  ])('%j → %j', (raw, tag) => {
    expect(normaliseStoreyTag(raw)).toBe(tag);
  });

  it.each([
    'L0', 'L00', 'L', 'L100', 'L0005', 'L-1', 'L+5', 'L 5', 'L5a', 'L5.0', 'L1e1',
    'B1', '5', '05', 'level 5', 'roof', 'R', 'RFF', 'L5RF', '', '   ',
  ])('rejects %j', (raw) => {
    expect(normaliseStoreyTag(raw)).toBeNull();
  });

  it('rejects non-strings', () => {
    for (const raw of [5, null, undefined, {}, ['L5'], true]) expect(normaliseStoreyTag(raw)).toBeNull();
  });
});

describe('storeys per site', () => {
  it('match every engine.json storey table, tag for tag and FFL for FFL', () => {
    for (const id of ESTATE_SITE_IDS) {
      const engine = parseEngine(ENGINE_STOREYS[id]);
      expect(ESTATE_SITE_STOREYS[id], id).toEqual(engine.map((s) => s.tag));
      // Exact: the table is built in millimetres, so 9.2 is JSON's 9.2.
      expect(ESTATE_STOREY_FFL[id], id).toEqual(engine.map((s) => s.ffl));
    }
  });

  it('adds up to the 245 storeys the window quotes', () => {
    expect(ESTATE_SITE_IDS.reduce((sum, id) => sum + ESTATE_SITE_STOREYS[id].length, 0)).toBe(245);
  });

  it('runs bottom-up, L1 at 0, RF on top, every tag canonical', () => {
    for (const id of ESTATE_SITE_IDS) {
      const tags = ESTATE_SITE_STOREYS[id];
      const ffl = ESTATE_STOREY_FFL[id];
      expect(tags.length).toBe(ffl.length);
      expect(tags[0]).toBe('L1');
      expect(ffl[0]).toBe(0);
      expect(tags[tags.length - 1]).toBe('RF');
      tags.forEach((tag, i) => {
        expect(normaliseStoreyTag(tag)).toBe(tag);
        if (i > 0) expect(ffl[i]).toBeGreaterThan(ffl[i - 1]);
        if (i > 0 && tag !== 'RF') expect(tag).toBe(`L${i + 1}`);
      });
    }
  });

  it('is frozen, so no caller can re-order the storey indices', () => {
    expect(Object.isFrozen(ESTATE_SITE_STOREYS)).toBe(true);
    expect(Object.isFrozen(ESTATE_SITE_STOREYS.BLK_509)).toBe(true);
    expect(Object.isFrozen(ESTATE_STOREY_FFL.NC_514)).toBe(true);
  });

  it('looks storeys up through any accepted spelling', () => {
    expect(storeyIndex('BLK_509', 'L05')).toBe(4);
    expect(storeyIndex('BLK_509', 'rf')).toBe(16);
    expect(storeyIndex('BLK_509', 'L17')).toBe(-1);
    expect(storeyIndex('NC_514', 'L5')).toBe(-1);
    expect(storeyIndex('NC_514', 'junk')).toBe(-1);
    expect(siteStoreyTag('BLK_509', 'l5')).toBe('L5');
    expect(siteStoreyTag('BLK_505', 'L25')).toBe('L25');
    expect(siteStoreyTag('BLK_512', 'L13')).toBeNull();
    expect(storeyFfl('BLK_509', 'L5')).toBe(12);
    expect(storeyFfl('MSCP_513', 'RF')).toBe(21);
    expect(storeyFfl('NC_514', 'L2')).toBe(4.2);
    expect(storeyFfl('NC_514', 'L3')).toBeNull();
  });
});
