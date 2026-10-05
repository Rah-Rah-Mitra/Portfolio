import { describe, expect, it } from 'vitest';
import budgets from '../lib/estate/packBudgets.json';
import { ESTATE_SITE_IDS, ESTATE_SITE_STOREYS, ESTATE_STOREY_FFL, siteKindOf, type EstateSiteId } from '../lib/estate/ids';
import { ESTATE_TIERS } from '../lib/estate/tiers';
import {
  BAND_CAPACITY, BAND_DROP, EYE_HEIGHT, MASK_OFF, MAX_BAND_K, PEEK_K, STOREY_HYSTERESIS, TIER_BAND_K,
  applyBand, bandHalfWidth, bandLabel, ceilingStorey, clearBand, createBandState, inRange, interiorAccess,
  interiorActive, pointInPolygon, polygonDistance, polygonEdgeDistance, siteStoreyTable, specialsInBand, storeyAt,
  storeyBand, storeyFromEye, storeyTable, typicalInstances,
  type FootprintShape, type InteriorAccess, type StoreyRange, type StoreyRow, type StoreyTable,
} from '../lib/estate/storeys';

// Plan §7.5 and the §10.2 estate-storeys row. The stair case is the one the
// band rule exists for: walk a dog-leg stair between consecutive storeys and,
// at every point, the floor under the feet and whatever is overhead must both
// be drawn by the interior, on every tier. The stair is synthetic but built to
// the estate's own rules (risers ≤ 0.175 m, goings 0.28 m, a mid landing; the
// real cores are 2.6 × 5.4 m rooms, upstream rules.py:13-19), and the oracle
// reads surfaces, not the module's bands, so the two are independent.

const T509 = siteStoreyTable('BLK_509');
const TNC = siteStoreyTable('NC_514');
const idx = (table: StoreyTable, tag: string) => (table.tags as readonly string[]).indexOf(tag);
const range = (lo: number, hi: number): StoreyRange => ({ lo, hi });

describe('storey tables', () => {
  it('match lib/estate/ids.ts storey for storey, FFL for FFL', () => {
    for (const id of ESTATE_SITE_IDS) {
      const table = siteStoreyTable(id);
      expect(table.tags, id).toEqual(ESTATE_SITE_STOREYS[id]);
      expect(table.ffl, id).toEqual(ESTATE_STOREY_FFL[id]);
      expect(table.typical, id).toHaveLength(ESTATE_SITE_STOREYS[id].length);
    }
    // Spot pins straight from the engine JSON, so a shared slip in ids.ts and here cannot pass.
    expect(T509.ffl[idx(T509, 'L5')]).toBe(12);
    expect(T509.ffl[idx(T509, 'RF')]).toBe(45.6);
    const mscp = siteStoreyTable('MSCP_513');
    expect(mscp.ffl[mscp.ffl.length - 2]).toBe(18);
    expect(TNC.ffl).toEqual([0, 4.2, 8.2]);
  });

  it('splits typical and special storeys as measured on v1.1', () => {
    let typical = 0;
    let special = 0;
    for (const id of ESTATE_SITE_IDS) {
      const table = siteStoreyTable(id);
      table.typical.forEach((t) => (t ? (typical += 1) : (special += 1)));
      const tags = table.tags.filter((_, i) => table.typical[i]);
      if (siteKindOf(id) === 'nc') expect(tags, id).toEqual([]);
      else expect(tags, id).toEqual(table.tags.slice(1, -1)); // L2 … top residential (MSCP L2 … L7)
    }
    expect([typical, special, typical + special]).toEqual([216, 29, 245]);
  });

  it('honours the pack geom, so a storey that stops repeating becomes special', () => {
    const rows: StoreyRow[] = T509.tags.map((tag, i) => ({ tag, ffl: T509.ffl[i], geom: T509.typical[i] && tag !== 'L8' ? 'typical' : 'special' }));
    const table = storeyTable(rows);
    const L8 = idx(table, 'L8');
    expect(table.typical[L8]).toBe(false);
    const band = storeyBand(table, L8, 2);
    const storeys = new Int32Array(5);
    const specials = new Int32Array(5);
    expect(typicalInstances(table, band, storeys, new Float64Array(5))).toBe(4);
    expect([...storeys.subarray(0, 4)]).not.toContain(L8);
    expect(specialsInBand(table, band, specials)).toBe(1);
    expect(specials[0]).toBe(L8);
  });

  it('is cached and frozen', () => {
    expect(siteStoreyTable('BLK_509')).toBe(T509);
    expect(Object.isFrozen(T509) && Object.isFrozen(T509.ffl) && Object.isFrozen(T509.typical)).toBe(true);
  });

  it('refuses tables the hysteresis cannot work on', () => {
    expect(() => storeyTable([])).toThrow(RangeError);
    expect(() => storeyTable([{ tag: 'L1', ffl: 0, geom: 'special' }, { tag: 'L2', ffl: 0.7, geom: 'typical' }])).toThrow(/0.75/);
    expect(() => storeyTable([{ tag: 'L1', ffl: 3, geom: 'special' }, { tag: 'L2', ffl: 0, geom: 'typical' }])).toThrow(RangeError);
    expect(() => storeyTable([{ tag: 'L1', ffl: Number.NaN, geom: 'special' }])).toThrow(/finite/);
    expect(storeyTable([{ tag: 'L1', ffl: 0, geom: 'special' }, { tag: 'L2', ffl: 0.75, geom: 'typical' }]).ffl).toEqual([0, 0.75]);
  });
});

describe('current storey', () => {
  it('reads each floor from scratch, with band edges at FFL − 0.5', () => {
    for (const id of ESTATE_SITE_IDS) {
      const table = siteStoreyTable(id);
      const { ffl } = table;
      ffl.forEach((level, s) => {
        expect(storeyAt(table, level), `${id} ${table.tags[s]}`).toBe(s);
        expect(storeyAt(table, level + 1.5), `${id} ${table.tags[s]} + 1.5`).toBe(s);
        if (s === 0) return;
        // A height exactly on the edge belongs to the storey above it, a hair lower to the one below.
        expect(storeyAt(table, level - BAND_DROP)).toBe(s);
        expect(storeyAt(table, level - BAND_DROP - 1e-9)).toBe(s - 1);
      });
      expect(storeyAt(table, -50)).toBe(0);
      expect(storeyAt(table, 1e4)).toBe(ffl.length - 1);
    }
  });

  it('switches up at FFL − 0.25 and down at FFL − 0.75', () => {
    expect([BAND_DROP, STOREY_HYSTERESIS, EYE_HEIGHT]).toEqual([0.5, 0.25, 1.6]);
    for (const id of ESTATE_SITE_IDS) {
      const table = siteStoreyTable(id);
      const { ffl } = table;
      for (let s = 0; s + 1 < ffl.length; s += 1) {
        const next = ffl[s + 1];
        expect(storeyAt(table, next - 0.25 - 1e-9, s), `${id} up`).toBe(s);
        expect(storeyAt(table, next - 0.25, s), `${id} up`).toBe(s + 1);
        expect(storeyAt(table, next - 0.75, s + 1), `${id} down`).toBe(s + 1);
        expect(storeyAt(table, next - 0.75 - 1e-9, s + 1), `${id} down`).toBe(s);
      }
    }
  });

  it('does not flicker at a band edge', () => {
    const L5 = idx(T509, 'L5');
    const edge = T509.ffl[L5 + 1] - BAND_DROP; // L6's lower edge, 14.3 m
    const jitter = (i: number) => 0.24 * Math.sin(i * 0.37) * Math.cos(i * 0.011); // |·| < 0.25, deterministic
    const changes = (feet: (i: number) => number, start: number, steps: number, held = true) => {
      let s = start;
      let count = 0;
      for (let i = 0; i < steps; i += 1) {
        const next = storeyAt(T509, feet(i), held ? s : -1);
        if (next !== s) count += 1;
        s = next;
      }
      return count;
    };
    // Bobbing on the edge from either side holds S.
    expect(changes((i) => edge + jitter(i), L5, 4000)).toBe(0);
    expect(changes((i) => edge + jitter(i), L5 + 1, 4000)).toBe(0);
    // Climbing through it with the same jitter changes S exactly once …
    expect(changes((i) => edge - 1 + (1.5 * i) / 4000 + jitter(i), L5, 4000)).toBe(1);
    expect(changes((i) => edge + 0.5 - (1.5 * i) / 4000 + jitter(i), L5 + 1, 4000)).toBe(1);
    // … where the raw band, with no hysteresis, flickers.
    expect(changes((i) => edge + jitter(i), L5, 4000, false)).toBeGreaterThan(50);
  });

  it('treats a stale prev as no prev, and NaN as no information', () => {
    const L5 = idx(T509, 'L5');
    for (const stale of [-1, -3, 17, 99, 2.5, Number.NaN]) expect(storeyAt(T509, 12, stale)).toBe(L5);
    expect(storeyAt(T509, Number.NaN, L5)).toBe(L5);
    expect(storeyAt(T509, Number.NaN)).toBe(0);
    expect(storeyAt(T509, Number.POSITIVE_INFINITY, L5)).toBe(T509.ffl.length - 1);
    expect(storeyAt(T509, Number.NEGATIVE_INFINITY, L5)).toBe(0);
  });

  it('takes the camera at eye height', () => {
    const L5 = idx(T509, 'L5');
    expect(storeyFromEye(T509, 12 + EYE_HEIGHT)).toBe(L5);
    expect(storeyFromEye(T509, 14.8 - 0.2 + EYE_HEIGHT, L5)).toBe(L5 + 1);
    expect(storeyFromEye(T509, 14.8 - 0.3 + EYE_HEIGHT, L5)).toBe(L5);
  });

  it('is always the storey under the feet or the one above it', () => {
    for (const id of ESTATE_SITE_IDS) {
      const table = siteStoreyTable(id);
      const { ffl } = table;
      const under = (feet: number) => {
        let u = 0;
        while (u + 1 < ffl.length && ffl[u + 1] <= feet) u += 1;
        return u;
      };
      const top = Math.round((ffl[ffl.length - 1] + 3) * 100);
      let s = -1;
      const bad: string[] = [];
      for (const cm of [...Array.from({ length: top + 101 }, (_, i) => i - 100), ...Array.from({ length: top + 101 }, (_, i) => top - i)]) {
        const feet = cm / 100;
        s = storeyAt(table, feet, s);
        const d = s - under(feet);
        if (d !== 0 && d !== 1) bad.push(`${feet}: S=${s} under=${under(feet)}`);
      }
      expect(bad, id).toEqual([]);
    }
  });
});

describe('band', () => {
  it('has k ≥ 1 on every tier, k = 1 when peeking, from packBudgets.json', () => {
    expect(ESTATE_TIERS.map((t) => TIER_BAND_K[t])).toEqual(budgets.tiers.map((t) => t.bandK));
    expect(TIER_BAND_K).toEqual({ high: 2, mid: 1, low: 1, min: 1 });
    for (const tier of ESTATE_TIERS) {
      expect(bandHalfWidth(tier, 'inside')).toBeGreaterThanOrEqual(1);
      expect(bandHalfWidth(tier, 'outside')).toBe(TIER_BAND_K[tier]);
      expect(bandHalfWidth(tier, 'peeking')).toBe(1);
    }
    expect([PEEK_K, MAX_BAND_K, BAND_CAPACITY]).toEqual([1, 2, 5]);
  });

  it('is [S − k, S + k], cut at the ends', () => {
    const L5 = idx(T509, 'L5');
    const RF = T509.ffl.length - 1;
    // The plan's pinned poses: S4 inside BLK_509 L5 at high, S4-min at min.
    expect(bandLabel(T509, storeyBand(T509, L5, TIER_BAND_K.high))).toBe('L3–L7');
    expect(bandLabel(T509, storeyBand(T509, L5, TIER_BAND_K.min))).toBe('L4–L6');
    expect(storeyBand(T509, 0, 2)).toEqual(range(0, 2));
    expect(storeyBand(T509, RF, 2)).toEqual(range(RF - 2, RF));
    expect(bandLabel(T509, storeyBand(T509, RF, 2))).toBe('L15–RF');
    expect(storeyBand(TNC, 1, 2)).toEqual(range(0, 2));
    expect(bandLabel(TNC, range(2, 2))).toBe('RF');
    expect(bandLabel(TNC, MASK_OFF)).toBe('');
  });

  it('never narrows below k = 1', () => {
    const L5 = idx(T509, 'L5');
    for (const k of [0, -1, 0.5, 0.999, Number.NaN, Number.NEGATIVE_INFINITY]) expect(storeyBand(T509, L5, k), String(k)).toEqual(range(L5 - 1, L5 + 1));
    expect(storeyBand(T509, L5, 2.9)).toEqual(range(L5 - 2, L5 + 2));
  });

  it('is empty for a storey the building lacks', () => {
    for (const s of [-1, 17, 1.5, Number.NaN]) expect(storeyBand(T509, s, 2), String(s)).toEqual(range(0, -1));
  });
});

// ---- the stair case (§10.2) ----------------------------------------------------

const RISER_MAX = 0.175;
const GOING = 0.28;
const WIDTH = 1.2; // each flight; the core is 2 × WIDTH across
const LANDING = 1.2; // floor landing depth

interface Surface { owner: number; z: number; x0: number; x1: number; y0: number; y1: number }
interface Sample { x: number; y: number; feet: number; under: number; above: number }

const flight = (table: StoreyTable, j: number) => {
  const rise = table.ffl[j + 1] - table.ffl[j];
  const m = Math.ceil(rise / 2 / RISER_MAX - 1e-9); // risers per flight
  return { m, r: rise / (2 * m), run: (m - 1) * GOING };
};

// One dog-leg core per building, stacked identically in plan: floor landing at
// x < 0, flight 1 up along +x at y ∈ [0, W), a mid landing to the core's end
// wall, flight 2 back along −x at y ∈ [W, 2W) onto the next floor's landing.
// Every tread and landing belongs to the storey it rises from (an IfcStair sits
// in its lower storey: "L5 stair 2", L5 → L6). Taller storeys need longer
// flights, so the mid landing fills whatever the flight leaves.
const stairCore = (table: StoreyTable): Surface[][] => {
  const n = table.ffl.length;
  let end = 0;
  for (let j = 0; j + 1 < n; j += 1) end = Math.max(end, flight(table, j).run + LANDING);
  return table.ffl.map((base, j) => {
    const out: Surface[] = [{ owner: j, z: base, x0: -LANDING, x1: 0, y0: 0, y1: 2 * WIDTH }];
    if (j + 1 >= n) return out; // RF: a landing, nothing above it
    const { m, r, run } = flight(table, j);
    for (let i = 1; i < m; i += 1) {
      out.push({ owner: j, z: base + i * r, x0: (i - 1) * GOING, x1: i * GOING, y0: 0, y1: WIDTH });
      out.push({ owner: j, z: base + (m + i) * r, x0: run - i * GOING, x1: run - (i - 1) * GOING, y0: WIDTH, y1: 2 * WIDTH });
    }
    out.push({ owner: j, z: base + m * r, x0: run, x1: end, y0: 0, y1: 2 * WIDTH });
    return out;
  });
};
const coreEnd = (core: Surface[][]) => Math.max(...core.flat().map((s) => s.x1));
const covers = (s: Surface, x: number, y: number) => x >= s.x0 && x < s.x1 && y >= s.y0 && y < s.y1;

// What is overhead: the lowest surface above the eye at that point, any storey.
const overhead = (near: Surface[], x: number, y: number, eye: number) => {
  let best: Surface | null = null;
  for (const s of near) if (covers(s, x, y) && s.z > eye && (!best || s.z < best.z)) best = s;
  return best ? best.owner : -1;
};

// The walking line: landing centre → flight 1 → across the mid landing →
// flight 2 → the next landing's centre, sampled every 2 cm. Two feet profiles:
// 'tread' stands on whichever surface is nearest within ±0.4 m, as the walk
// grid's floorAt does; 'pitch' follows the path polyline's straight z, as Take
// stairs does, so the feet sit up to a riser below the tread they are over.
const stairWalk = (table: StoreyTable, core: Surface[][], j: number, profile: 'tread' | 'pitch', down: boolean): Sample[] => {
  const { m, r, run } = flight(table, j);
  const lo = table.ffl[j];
  const hi = table.ffl[j + 1];
  const mid = lo + m * r;
  const xm = (run + coreEnd(core)) / 2;
  let path: Array<[number, number, number]> = [
    [-LANDING / 2, WIDTH, lo], [0, WIDTH / 2, lo], [run, WIDTH / 2, mid], [xm, WIDTH / 2, mid],
    [xm, 1.5 * WIDTH, mid], [run, 1.5 * WIDTH, mid], [0, 1.5 * WIDTH, hi], [-LANDING / 2, WIDTH, hi],
  ];
  if (down) path = path.reverse();
  const near = core.slice(Math.max(0, j - 1), j + 3).flat();
  const out: Sample[] = [];
  let feet = path[0][2];
  for (let p = 0; p + 1 < path.length; p += 1) {
    const [ax, ay, az] = path[p];
    const [bx, by, bz] = path[p + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.02));
    for (let i = p === 0 ? 0 : 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      let stand: Surface | null = null;
      if (profile === 'tread') {
        for (const s of near) if (covers(s, x, y) && Math.abs(s.z - feet) <= 0.4 && (!stand || Math.abs(s.z - feet) < Math.abs(stand.z - feet))) stand = s;
        if (!stand) throw new Error(`no floor within 0.4 m at (${x}, ${y}) from ${feet}`);
        feet = stand.z;
      } else {
        feet = az + (bz - az) * t;
        for (const s of near) if (covers(s, x, y) && s.z <= feet + 0.18 && (!stand || s.z > stand.z)) stand = s;
        if (!stand) throw new Error(`nothing underfoot at (${x}, ${y}, ${feet})`);
      }
      out.push({ x, y, feet, under: stand.owner, above: overhead(near, x, y, feet + EYE_HEIGHT) });
    }
  }
  return out;
};

// Walk every stair of the given pairs both ways on both profiles, tracking S
// from the eye with hysteresis as the engine does, and report every point where
// the floor underfoot or the thing overhead falls outside the band.
const TIER_CASES = ESTATE_TIERS.flatMap((tier) => (['inside', 'peeking'] as InteriorAccess[]).map((access) => ({ label: `${tier}/${access}`, k: bandHalfWidth(tier, access) })));

const walkStairs = (pairs: (table: StoreyTable, j: number) => boolean, bandOf: (table: StoreyTable, s: number, k: number) => StoreyRange = storeyBand) => {
  const bad: string[] = [];
  let walked = 0;
  let samples = 0;
  for (const id of ESTATE_SITE_IDS) {
    const table = siteStoreyTable(id);
    const core = stairCore(table);
    for (let j = 0; j + 1 < table.ffl.length; j += 1) {
      if (!pairs(table, j)) continue;
      walked += 1;
      for (const profile of ['tread', 'pitch'] as const) {
        for (const down of [false, true]) {
          let s = -1;
          for (const p of stairWalk(table, core, j, profile, down)) {
            samples += 1;
            s = storeyFromEye(table, p.feet + EYE_HEIGHT, s);
            for (const { label, k } of TIER_CASES) {
              const band = bandOf(table, s, k);
              if (inRange(band, p.under) && (p.above < 0 || inRange(band, p.above))) continue;
              if (bad.length < 8) {
                bad.push(`${id} ${table.tags[j]}→${table.tags[j + 1]} ${profile} ${down ? 'down' : 'up'} ${label}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) feet ${p.feet.toFixed(3)} S=${table.tags[s]} band ${bandLabel(table, band) || `${band.lo}–${band.hi}`} under ${table.tags[p.under]} above ${p.above < 0 ? '—' : table.tags[p.above]}`);
              }
            }
          }
        }
      }
    }
  }
  return { bad, walked, samples };
};

describe('stair band (§10.2)', () => {
  it('keeps the floor underfoot and the slab overhead in the band on every typical stair, every tier', () => {
    const { bad, walked, samples } = walkStairs((table, j) => table.typical[j] && table.typical[j + 1]);
    expect(bad).toEqual([]);
    // 198 block pairs (L2 … top residential) + 5 MSCP pairs (L2 … L7).
    expect(walked).toBe(203);
    expect(samples).toBeGreaterThan(203 * 4 * 300);
  });

  it('holds on the special stairs too: void deck to L2, top storey to the roof, the car park and the NC', () => {
    const { bad, walked } = walkStairs((table, j) => !(table.typical[j] && table.typical[j + 1]));
    expect(bad).toEqual([]);
    expect(walked).toBe(245 - 14 - 203);
  });

  it('would fail at k = 0, which is why k ≥ 1 is the rule', () => {
    const exact = (_table: StoreyTable, s: number) => range(s, s);
    expect(walkStairs((table, j) => table.typical[j] && table.typical[j + 1], exact).bad.length).toBeGreaterThan(0);
  });

  it('reads what is overhead, not the next FFL: on a mid landing the eye is above the floor of the storey it is climbing to', () => {
    // BLK_509 L5 → L6: the mid landing is at 13.4, the eye at 15.0 > L6's 14.8.
    // What is overhead is L6's own mid landing (16.2), not L7's floor, so the
    // band k = 1 around L5 covers it without reaching for L7.
    const core = stairCore(T509);
    const L5 = idx(T509, 'L5');
    const { m, r, run } = flight(T509, L5);
    expect([m, r]).toEqual([8, expect.closeTo(0.175, 12)]);
    const landing = stairWalk(T509, core, L5, 'tread', false).find((p) => p.x > run + 0.1 && p.y === WIDTH / 2);
    expect(landing).toBeDefined();
    expect(landing!.feet).toBeCloseTo(13.4, 12);
    expect(landing!.feet + EYE_HEIGHT).toBeGreaterThan(T509.ffl[L5 + 1]);
    expect([landing!.under, landing!.above]).toEqual([L5, L5 + 1]);
    expect(storeyFromEye(T509, landing!.feet + EYE_HEIGHT, L5)).toBe(L5);
    // And the core is built to the estate's rules: 8 risers of 0.175 per flight (above), headroom over 2 m everywhere.
    for (const p of stairWalk(T509, core, L5, 'tread', false)) {
      const roof = core.flat().filter((s) => covers(s, p.x, p.y) && s.z > p.feet).reduce((z, s) => Math.min(z, s.z), Infinity);
      expect(roof - p.feet).toBeGreaterThan(2);
    }
  });
});

// ---- mask, ceiling, specials, instances --------------------------------------------

const everyBand = (ks: number[], visit: (id: EstateSiteId, table: StoreyTable, s: number, k: number, band: StoreyRange) => void) => {
  for (const id of ESTATE_SITE_IDS) {
    const table = siteStoreyTable(id);
    for (let s = 0; s < table.ffl.length; s += 1) for (const k of ks) visit(id, table, s, k, storeyBand(table, s, k));
  }
};

describe('façade mask and ceiling', () => {
  it('keeps the slab of S + k + 1 as the ceiling, outside the mask, at every k', () => {
    const L5 = idx(T509, 'L5');
    expect(ceilingStorey(T509, storeyBand(T509, L5, 2))).toBe(L5 + 3);
    expect(ceilingStorey(T509, storeyBand(T509, L5, 1))).toBe(L5 + 2);
    expect(ceilingStorey(T509, storeyBand(T509, idx(T509, 'L16'), 1))).toBe(-1); // the band reaches RF
    expect(ceilingStorey(T509, MASK_OFF)).toBe(-1);
    everyBand([1, 2, 3], (id, table, s, k, band) => {
      const ceiling = ceilingStorey(table, band);
      if (s + k + 1 < table.ffl.length) expect(ceiling, `${id} ${s} k${k}`).toBe(s + k + 1);
      else expect(ceiling).toBe(-1);
      expect(inRange(band, ceiling)).toBe(false);
    });
  });

  it('hides nothing while off', () => {
    for (let s = -1; s < 30; s += 1) expect(inRange(MASK_OFF, s)).toBe(false);
    expect(Object.isFrozen(MASK_OFF)).toBe(true);
  });
});

describe('specials and typical instances', () => {
  it('shows the special storeys inside the band', () => {
    const specials = new Int32Array(5);
    const list = (table: StoreyTable, band: StoreyRange) => [...specials.subarray(0, specialsInBand(table, band, specials))].map((s) => table.tags[s]);
    expect(list(T509, storeyBand(T509, 0, 2))).toEqual(['L1']);
    expect(list(T509, storeyBand(T509, idx(T509, 'L9'), 2))).toEqual([]);
    expect(list(T509, storeyBand(T509, idx(T509, 'L16'), 1))).toEqual(['RF']);
    expect(list(TNC, storeyBand(TNC, 1, 1))).toEqual(['L1', 'L2', 'RF']);
    const mscp = siteStoreyTable('MSCP_513');
    expect(list(mscp, storeyBand(mscp, 7, 2))).toEqual(['RF']);
  });

  it('instances at most 2k + 1 typical storeys, bottom-up, at their FFLs', () => {
    const storeys = new Int32Array(7);
    const ffl = new Float64Array(7);
    const specials = new Int32Array(7);
    everyBand([1, 2, 3], (id, table, s, k, band) => {
      const count = typicalInstances(table, band, storeys, ffl);
      expect(count, `${id} ${s} k${k}`).toBeLessThanOrEqual(2 * k + 1);
      for (let i = 0; i < count; i += 1) {
        expect(table.typical[storeys[i]]).toBe(true);
        expect(inRange(band, storeys[i])).toBe(true);
        expect(ffl[i]).toBe(table.ffl[storeys[i]]);
        if (i > 0) expect(storeys[i]).toBeGreaterThan(storeys[i - 1]);
      }
      // Every band storey is drawn exactly once: by the instances or by its own special mesh.
      expect(count + specialsInBand(table, band, specials)).toBe(band.hi - band.lo + 1);
    });
    expect(typicalInstances(T509, storeyBand(T509, 0, 2), storeys, ffl)).toBe(2);
    expect([...storeys.subarray(0, 2)].map((s) => T509.tags[s])).toEqual(['L2', 'L3']);
    expect([...ffl.subarray(0, 2)]).toEqual([3.6, 6.4]);
  });

  it('refuses arrays too short for the band', () => {
    const band = storeyBand(T509, idx(T509, 'L8'), 2);
    expect(() => typicalInstances(T509, band, new Int32Array(4), new Float64Array(5))).toThrow(RangeError);
    expect(() => specialsInBand(TNC, range(0, 2), new Int32Array(2))).toThrow(RangeError);
  });
});

describe('band state', () => {
  it('fills mask, ceiling, instances and specials, and reports only real changes', () => {
    const state = createBandState();
    expect(state.typicalStorey).toHaveLength(BAND_CAPACITY);
    expect([state.lo, state.hi, state.storey]).toEqual([0, -1, -1]);
    const L5 = idx(T509, 'L5');

    expect(applyBand(state, T509, L5, 2)).toBe(true);
    expect([state.lo, state.hi, state.ceiling, state.k]).toEqual([L5 - 2, L5 + 2, L5 + 3, 2]);
    expect([...state.typicalFfl.subarray(0, state.typicalCount)]).toEqual([6.4, 9.2, 12, 14.8, 17.6]);
    expect(state.specialCount).toBe(0);
    expect(applyBand(state, T509, L5, 2)).toBe(false);

    expect(applyBand(state, T509, L5, 1)).toBe(true);
    expect([state.lo, state.hi, state.typicalCount]).toEqual([L5 - 1, L5 + 1, 3]);

    expect(applyBand(state, T509, 0, 2)).toBe(true);
    expect([state.typicalCount, state.specialCount, state.specialStorey[0]]).toEqual([2, 1, 0]);

    // NC_514 at k = 2: every S gives the same band, so S moves and nothing redraws.
    expect(applyBand(state, TNC, 1, 2)).toBe(true);
    expect(applyBand(state, TNC, 0, 2)).toBe(false);
    expect(state.storey).toBe(0);
    expect([state.typicalCount, state.specialCount]).toEqual([0, 3]);

    // Same range on another building is still a change.
    const t510 = siteStoreyTable('BLK_510');
    expect(applyBand(state, T509, 3, 1)).toBe(true);
    expect(applyBand(state, t510, 3, 1)).toBe(true);

    expect(applyBand(state, t510, 99, 1)).toBe(true); // a storey it lacks clears
    expect([state.lo, state.hi, state.storey, state.table]).toEqual([0, -1, -1, null]);
    expect(clearBand(state)).toBe(false);
    expect(applyBand(state, t510, 3, 1)).toBe(true);
    expect(clearBand(state)).toBe(true);
  });

  it('refuses a k beyond its capacity, and sizes up on request', () => {
    expect(() => applyBand(createBandState(), T509, 8, 3)).toThrow(RangeError);
    const wide = createBandState(3);
    expect(applyBand(wide, T509, 8, 3)).toBe(true);
    expect(wide.typicalCount).toBe(7);
  });
});

// ---- footprints -------------------------------------------------------------------

// BLK_509's massing footprint, block-local, exactly as upstream engine.json writes
// it (v1.1; closed ring, 57 points, a dozen notches).
const BLK_509_FOOTPRINT: Array<[number, number]> = [
  [-53.6, 7.6], [-53.6, 6.5], [-47.6, 6.5], [-47.6, 8.5], [-39.2, 8.5], [-39.2, 2.6], [-33.8, 2.6], [-33.8, 5.7],
  [-30.8, 5.7], [-30.8, 1.6], [-29.6, 1.6], [-29.6, 9.5], [-19.4, 9.5], [-19.4, 9.3], [-9.2, 9.3], [-9.2, 11.7],
  [0.8, 11.7], [0.8, 2.6], [6.2, 2.6], [6.2, 5.7], [9.2, 5.7], [9.2, 1.6], [10.4, 1.6], [10.4, 11.7], [20.4, 11.7],
  [20.4, 9.3], [30.6, 9.3], [30.6, 9.5], [40.8, 9.5], [40.8, 2.6], [46.2, 2.6], [46.2, 5.7], [49.2, 5.7], [49.2, 1.6],
  [50.4, 1.6], [50.4, 7.1], [60.4, 7.1], [60.4, 5.7], [63.2, 5.7], [63.2, -2.3], [46.4, -2.3], [46.4, -3.1],
  [40.6, -3.1], [40.6, -2.3], [6.4, -2.3], [6.4, -3.1], [0.6, -3.1], [0.6, -2.3], [-33.6, -2.3], [-33.6, -3.1],
  [-39.4, -3.1], [-39.4, -2.3], [-63.2, -2.3], [-63.2, 5.7], [-60.4, 5.7], [-60.4, 7.6], [-53.6, 7.6],
];
const SQUARE: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe('polygon helpers', () => {
  it('tests points in a concave ring, closed or open alike', () => {
    expect(BLK_509_FOOTPRINT).toHaveLength(57);
    const open = BLK_509_FOOTPRINT.slice(0, -1);
    const cases: Array<[number, number, boolean]> = [
      [0, 5, true], [-36.5, -1.5, true], [-50, 6, true], [-50, 7, false], [-35, 4, false], [-32, 4, true],
      [0, 12, false], [0, -2.5, false], [3.5, -2.7, true], [64, 0, false], [-62, 6.5, false], [-58, 7, true],
    ];
    for (const [x, y, inside] of cases) {
      expect(pointInPolygon(x, y, BLK_509_FOOTPRINT), `${x}, ${y}`).toBe(inside);
      expect(pointInPolygon(x, y, open), `${x}, ${y} open`).toBe(inside);
    }
    expect(pointInPolygon(0, 0, [])).toBe(false);
  });

  it('measures distance to the edge and to the area', () => {
    expect(polygonEdgeDistance(5, 5, SQUARE)).toBe(5);
    expect(polygonEdgeDistance(5, 1, SQUARE)).toBe(1);
    expect(polygonEdgeDistance(13, 14, SQUARE)).toBe(5);
    expect(polygonDistance(5, 1, SQUARE)).toBe(0);
    expect(polygonDistance(-3, 5, SQUARE)).toBe(3);
    expect(polygonEdgeDistance(1, 1, [])).toBe(Infinity);
    expect(polygonEdgeDistance(3, 4, [[0, 0]])).toBe(5);
    // Concave: (−50, 7.2) sits in the notch above y = 6.5, 0.7 m from the edge.
    expect(polygonDistance(-50, 7.2, BLK_509_FOOTPRINT)).toBeCloseTo(0.7, 12);
  });
});

describe('inside and peeking', () => {
  const box: FootprintShape = { footprint: SQUARE, roofTop: 30 };
  it.each([
    [5, 5, 1.6, 'inside'], [10.5, 5, 1.6, 'inside'], [10.51, 5, 1.6, 'peeking'], [16, 5, 1.6, 'peeking'],
    [16.01, 5, 1.6, 'outside'], [5, 5, -1, 'inside'], [5, 5, -1.01, 'outside'], [5, 5, 32, 'inside'],
    [5, 5, 32.01, 'outside'], [12, 5, -0.01, 'outside'], [12, 5, 0, 'peeking'], [12, 5, 30, 'peeking'],
    [12, 5, 30.01, 'outside'], [5, -5.9, 12, 'peeking'], [-4, -4, 12, 'peeking'], [-4.3, -4.3, 12, 'outside'],
  ] as Array<[number, number, number, InteriorAccess]>)('(%d, %d, %d) is %s', (x, y, z, access) => {
    expect(interiorAccess(x, y, z, box)).toBe(access);
  });

  it('honours a raised ground', () => {
    const raised: FootprintShape = { footprint: SQUARE, roofTop: 30, ground: 5 };
    expect(interiorAccess(5, 5, 4, raised)).toBe('inside');
    expect(interiorAccess(5, 5, 3.99, raised)).toBe('outside');
    expect(interiorAccess(12, 5, 4.99, raised)).toBe('outside');
  });

  it('reads BLK_509 as upstream lays it out', () => {
    const blk: FootprintShape = { footprint: BLK_509_FOOTPRINT, roofTop: 49 };
    // The void deck and a lift lobby (estate 68.5, 48.5 − at 105, 50) are inside.
    expect(interiorAccess(0, 5, 1.6, blk)).toBe('inside');
    expect(interiorAccess(-36.5, -1.5, 13.6, blk)).toBe('inside');
    // The five void-deck entrance spawns stand 1.5 m out: peeking, so a resident interior is already drawn.
    for (const [x, y] of [[-36.5, -4.6], [3.5, -4.6], [43.5, -4.6], [-64.7, -1.1], [64.7, -1.1]]) {
      expect(interiorAccess(x, y, EYE_HEIGHT, blk), `${x}, ${y}`).toBe('peeking');
    }
    // Their doorways, on the footprint's edge, are inside.
    for (const [x, y] of [[-36.5, -3.1], [3.5, -3.1], [43.5, -3.1], [-63.2, -1.1], [63.2, -1.1]]) {
      expect(interiorAccess(x, y, EYE_HEIGHT, blk), `${x}, ${y}`).toBe('inside');
    }
    expect(interiorAccess(0, -20, 1.6, blk)).toBe('outside');
    expect(interiorAccess(0, 5, 51.5, blk)).toBe('outside');
  });

  it('activates the interior only when resident, and in Plan from anywhere', () => {
    for (const access of ['inside', 'peeking', 'outside'] as InteriorAccess[]) {
      expect(interiorActive(access, false, false)).toBe(false);
      expect(interiorActive(access, true, false)).toBe(false);
      expect(interiorActive(access, true, true)).toBe(true);
      expect(interiorActive(access, false, true)).toBe(access !== 'outside');
    }
  });
});
