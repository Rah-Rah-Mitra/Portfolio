// Triangle keys and the interior's typical/residual split (plan §6.2 step 6d,
// measurement M1). Imports nothing.
//
// A key names a triangle relative to its storey floor: each vertex at 1 mm as
// (x, y − FFL, z) in glTF Y-up, the three vertices sorted so winding and start
// vertex do not matter, then the palette slot. Two storeys share a triangle
// when they share its key. Everything below works on multisets of keys (a
// storey may hold the same triangle twice), so "T + R_s = chunk_s" is an
// equality of counts, checked exactly.

const MM = 1000;

/** The 1 mm key of triangle i of a soup, with `dy` subtracted from every y (the storey's FFL). */
export const triKey = (soup, i, dy = 0) => {
  const p = soup.pos; const o = i * 9;
  const v = [0, 1, 2].map((k) => {
    const x = Math.round(p[o + k * 3] * MM);
    const y = Math.round((p[o + k * 3 + 1] - dy) * MM);
    const z = Math.round(p[o + k * 3 + 2] * MM);
    return [x, y, z];
  });
  v.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return `${v[0].join(',')};${v[1].join(',')};${v[2].join(',')}|${soup.slot[i]}`;
};

/** Every key of a soup, relative to `dy`. */
export const soupKeys = (soup, dy = 0) => {
  const out = new Array(soup.count);
  for (let i = 0; i < soup.count; i += 1) out[i] = triKey(soup, i, dy);
  return out;
};

/** A multiset (Map key → count) of keys. */
export const countKeys = (keys) => {
  const m = new Map();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

export const multisetSize = (m) => { let n = 0; for (const c of m.values()) n += c; return n; };

/** The multiset intersection of two count maps. */
export const intersect = (a, b) => {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Map();
  for (const [k, c] of small) {
    const d = large.get(k);
    if (d) out.set(k, Math.min(c, d));
  }
  return out;
};

/** Whether two count maps are equal. */
export const sameMultiset = (a, b) => {
  if (a.size !== b.size) return false;
  for (const [k, c] of a) if (b.get(k) !== c) return false;
  return true;
};

/** a + b as count maps. */
export const addMultisets = (a, b) => {
  const out = new Map(a);
  for (const [k, c] of b) out.set(k, (out.get(k) ?? 0) + c);
  return out;
};

const intersectAll = (members) => {
  let t = members[0].counts;
  for (let i = 1; i < members.length; i += 1) t = intersect(t, members[i].counts);
  return t;
};

// Greedy from one seed: each later candidate joins when its share of the
// running intersection (|running ∩ s| / |s|) is at least minShare; then the
// final T is checked against every member, and the worst member is dropped
// until all hold (the intersection only shrinks as members join, so an early
// member can fall below the bar).
const grow = (cands, seed, minShare) => {
  let members = [cands[seed]];
  let running = cands[seed].counts;
  for (let j = 0; j < cands.length; j += 1) {
    if (j === seed) continue;
    const s = cands[j];
    const next = intersect(running, s.counts);
    if (s.size && multisetSize(next) / s.size >= minShare) { members.push(s); running = next; }
  }
  for (;;) {
    members.sort((a, b) => a.index - b.index);
    const t = intersectAll(members);
    const tSize = multisetSize(t);
    let worst = -1; let worstShare = Infinity;
    members.forEach((s, k) => {
      const share = s.size ? tSize / s.size : 0;
      if (share < minShare && (share < worstShare || (share === worstShare && s.index > members[worst].index))) { worst = k; worstShare = share; }
    });
    if (worst < 0) return { members, t, tSize };
    members = members.filter((_, k) => k !== worst);
    if (!members.length) return { members, t: new Map(), tSize: 0 };
  }
};

/**
 * Splits the candidate storeys into typical (sharing T) and the rest.
 * `storeys`: [{ index, keys: string[] }] — candidates only, bottom-up (blocks:
 * L2 … the top residential storey; the car park's decks above L1). Every seed
 * is tried; the result with the most members wins, then the larger T, then the
 * lower seed, so the split never depends on iteration accidents.
 * Returns { typical: index[], tKeys: Map, shares: Map index → share, residual:
 * Map index → triangle positions within that storey's keys, tFrom: index,
 * tPick: positions within tFrom's keys forming T }.
 */
export const splitTypical = (storeys, minShare) => {
  const cands = storeys.map((s) => ({ index: s.index, keys: s.keys, counts: countKeys(s.keys), size: s.keys.length }));
  let best = null;
  for (let seed = 0; seed < cands.length; seed += 1) {
    const r = grow(cands, seed, minShare);
    if (r.members.length < 2) continue; // one storey is not "typical": nothing repeats
    if (!best || r.members.length > best.members.length || (r.members.length === best.members.length && r.tSize > best.tSize)) best = r;
  }
  const result = { typical: [], tKeys: new Map(), shares: new Map(), residual: new Map(), tFrom: -1, tPick: [] };
  if (!best) return result;
  const { members, t, tSize } = best;
  result.typical = members.map((s) => s.index);
  result.tKeys = t;
  for (const s of members) {
    result.shares.set(s.index, tSize / s.size);
    // R_s: the triangles of s that T does not consume, first come first served.
    const left = new Map(t);
    const residual = [];
    s.keys.forEach((k, pos) => {
      const c = left.get(k);
      if (c) left.set(k, c - 1); else residual.push(pos);
    });
    result.residual.set(s.index, residual);
  }
  const lowest = members[0];
  result.tFrom = lowest.index;
  const left = new Map(t);
  lowest.keys.forEach((k, pos) => {
    const c = left.get(k);
    if (c) { left.set(k, c - 1); result.tPick.push(pos); }
  });
  return result;
};

/**
 * The hard check (plan §6.2 step 6d item 4): T's keys plus R_s's keys equal
 * the original storey's keys, as multisets. Keys must be relative to the same
 * floor. Returns null when equal, or a description of the first difference.
 */
export const exactSplitProblem = (tKeys, rKeys, chunkKeys) => {
  const sum = addMultisets(countKeys(tKeys), countKeys(rKeys));
  const want = countKeys(chunkKeys);
  if (sameMultiset(sum, want)) return null;
  for (const [k, c] of want) if (sum.get(k) !== c) return `key ${k}: chunk has ${c}, T + R has ${sum.get(k) ?? 0}`;
  for (const [k, c] of sum) if (!want.has(k)) return `key ${k}: T + R has ${c}, chunk has none`;
  return 'multisets differ';
};
