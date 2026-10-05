// Storey tags and the pack's band rule. Imports nothing.
//
// canonicalTag ports lib/estate/ids.ts normaliseStoreyTag (agreement pinned
// by tests/estate-pipeline-pure.test.ts). The band rule is the pack's own and
// has no runtime twin: the runtime places the camera with storeys.ts' 0.5 m
// drop and hysteresis, while the pack tags geometry once, with the plan's
// FFL − 0.25 m bands (§5.2 item 3, §6.2 steps 6b and 6c).

const LEVEL = /^[Ll](\d{1,3})$/;

/** 'L05' | 'l5' | 'L5' → 'L5'; 'rf' → 'RF'; anything else → null (ids.ts normaliseStoreyTag). */
export const canonicalTag = (raw) => {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (/^rf$/i.test(text)) return 'RF';
  const match = LEVEL.exec(text);
  if (!match) return null;
  const level = Number(match[1]);
  return level >= 1 && level <= 99 ? `L${level}` : null;
};

/** The storey's number (L5 → 5); RF → null. */
export const storeyNumber = (tag) => (tag === 'RF' ? null : Number(tag.slice(1)));

/** Below a storey's FFL, how far its band reaches down (m). */
export const BAND_PAD = 0.25;

/**
 * The storey index owning height `z` (block-local up, m): storey s owns
 * [FFL_s − 0.25, FFL_{s+1} − 0.25); the lowest storey also owns everything
 * below, the top (RF) everything above. `ffls` ascending.
 */
export const bandIndex = (ffls, z) => {
  let s = 0;
  for (let i = 1; i < ffls.length; i += 1) {
    if (z >= ffls[i] - BAND_PAD) s = i; else break;
  }
  return s;
};

/**
 * Upstream's storeys object ({ L1: 0, L2: 3.6, …, RF: 45.6 }) as a bottom-up
 * list of { tag, ffl }. Throws on a non-canonical tag or a non-rising FFL, so
 * a renamed storey cannot slip into the pack.
 */
export const storeyList = (storeys) => {
  const rows = Object.entries(storeys).map(([raw, ffl]) => {
    const tag = canonicalTag(raw);
    if (tag === null || tag !== raw) throw new Error(`storey tag ${JSON.stringify(raw)} is not canonical (L1…L99, RF)`);
    if (typeof ffl !== 'number' || !Number.isFinite(ffl)) throw new Error(`storey ${raw}: FFL ${ffl} is not a number`);
    return { tag, ffl };
  });
  rows.sort((a, b) => a.ffl - b.ffl);
  rows.forEach((row, i) => {
    if (i > 0 && !(row.ffl > rows[i - 1].ffl)) throw new Error(`storey ${row.tag} at ${row.ffl} m does not rise above ${rows[i - 1].tag}`);
  });
  if (rows.length && rows[rows.length - 1].tag !== 'RF') throw new Error('the top storey is not RF');
  return rows;
};
