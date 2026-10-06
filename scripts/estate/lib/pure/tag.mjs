// Storey tags for façade (F) triangles and detail (D) instances (plan §6.2
// steps 6b, 6c; decision C2), and the check that the façade mask can use them
// (§7.5). Imports only sibling pure modules.
//
// The contract a tag serves: inside a building the runtime draws the interior
// chunks of storeys S − k … S + k and hides exactly those storeys of F, D and
// the edge lines (lib/estate/storeys.ts storeyBand, `uStoreyMask`). So a
// surface the interior also draws must carry the storey of the chunk that
// holds it: then F hides it in exactly the bands where the interior draws it,
// and every surface is drawn once, at every S and k. A tag taken from the
// surface's height breaks that wherever a chunk holds geometry above its own
// band, which the estate does on purpose. An IfcStair and its railing sit in
// the storey they rise from, so the top riser, the handrail and the landing
// guard of BLK 509's L4→L5 flight (11.775–13.0 m; L5's FFL is 12.0) belong to
// L4, and NC 514's double-height hall keeps its roof deck and trusses
// (6.8–8.25 m, in L2's and RF's bands) in L1. Tagged by height, they vanish
// from the band whose bottom storey's landing they stand on (F hides them and
// the interior draws only the chunk above), and are drawn twice under the
// band's ceiling. On the v1.2 candidate rc2, counted once per triangle per
// band over the 490 bands of k = 1 and 2, that is 45,366 hidden and 43,726
// doubled, against 0 and 0 for the chunk rule (docs/portfolio/estate-pack.md,
// "Façade storeys").

import { bandIndex } from './storeys.mjs';
import { triKey } from './trikeys.mjs';

/** Storey indices nearest a band first: band, band − 1, band + 1, band − 2, … (all of them). */
export const searchOrder = (band, n) => {
  const out = [];
  for (let d = 0; out.length < n && d < 2 * n; d += 1) {
    for (const s of d === 0 ? [band] : [band - d, band + d]) if (s >= 0 && s < n) out.push(s);
  }
  return out;
};

/**
 * The storey whose interior chunk holds triangle `i` of `soup` (glTF Y-up,
 * block-local): its key relative to each storey's FFL, looked up in that
 * storey's chunk (`chunkCounts[s]`, a Map of keys relative to FFL_s), nearest
 * the triangle's z-min band first. −1 when no chunk holds it.
 */
export const chunkOwner = (soup, i, ffls, chunkCounts, band = bandIndex(ffls, soup.minY(i))) => {
  for (const s of searchOrder(band, ffls.length)) {
    const counts = chunkCounts[s];
    if (counts && counts.has(triKey(soup, i, ffls[s]))) return s;
  }
  return -1;
};

/**
 * Tags every triangle of `soup` with its storey index, in place: the storey of
 * the chunk that holds the same triangle (chunkOwner), so F hides it exactly
 * when the interior draws it. Only a triangle no chunk holds takes the z-min
 * band rule (FFL_s − 0.25 ≤ z_min < FFL_{s+1} − 0.25). Returns
 * { exactMatched, banded, offBand, owner }: `offBand` counts the matched
 * triangles whose chunk is not their z-min band's storey (kept with the chunk
 * on purpose; see the head of this file), and `owner[i]` is the chunk's
 * storey, or −1.
 */
export const tagByChunks = (soup, ffls, chunkCounts) => {
  let exactMatched = 0; let banded = 0; let offBand = 0;
  const owner = new Int16Array(soup.count);
  for (let i = 0; i < soup.count; i += 1) {
    const band = bandIndex(ffls, soup.minY(i));
    const s = chunkOwner(soup, i, ffls, chunkCounts, band);
    owner[i] = s;
    if (s >= 0) { exactMatched += 1; if (s !== band) offBand += 1; } else banded += 1;
    soup.storey[i] = s >= 0 ? s : band;
  }
  return { exactMatched, banded, offBand, owner };
};

/**
 * The storey whose chunk holds the most triangles of `soup` (an opening's D
 * kit, baked where it stands), or −1 when no chunk holds any. A tie goes to
 * the lower storey. A door's chunk holds its frame but not a leaf the pack
 * opened, so the vote counts what matches, not the whole kit.
 */
export const majorityOwner = (soup, ffls, chunkCounts) => {
  const votes = new Map();
  for (let i = 0; i < soup.count; i += 1) {
    const s = chunkOwner(soup, i, ffls, chunkCounts);
    if (s >= 0) votes.set(s, (votes.get(s) ?? 0) + 1);
  }
  let best = -1; let most = 0;
  for (const [s, n] of votes) if (n > most || (n === most && s < best)) { best = s; most = n; }
  return best;
};

/** The band-rule storey of an instance from its translation's height (glTF y). */
export const instanceStorey = (ffls, y) => bandIndex(ffls, y);

/**
 * The façade mask over every band a building can show. For each storey S and
 * each half-width k in `ks`, the band is [max(0, S − k), min(n − 1, S + k)]
 * (lib/estate/storeys.ts storeyBand; tests/estate-pipeline-pure.test.ts pins
 * the two equal). Surface j is held by chunk `owner[j]` (−1: by none) and
 * tagged `tag[j]`. The interior draws it when its owner is in the band, and F
 * (or D) when its tag is not. A held surface must be drawn exactly once: drawn
 * by neither is a `hole`, by both a `double`. A surface no chunk holds is F's
 * alone, hidden while its tag is in the band: the opening the mask exists to
 * make, counted in `opened`. Returns { bands, holes, doubles, opened, first },
 * where `first` is the first fault as { surface, storey, k, lo, hi }, or null.
 */
export const maskCoverage = (owner, tag, n, ks) => {
  let bands = 0; let holes = 0; let doubles = 0; let opened = 0; let first = null;
  for (const k of ks) {
    for (let S = 0; S < n; S += 1) {
      const lo = Math.max(0, S - k); const hi = Math.min(n - 1, S + k);
      bands += 1;
      for (let j = 0; j < owner.length; j += 1) {
        const hidden = tag[j] >= lo && tag[j] <= hi;
        if (owner[j] < 0) { if (hidden) opened += 1; continue; }
        const drawn = (owner[j] >= lo && owner[j] <= hi ? 1 : 0) + (hidden ? 0 : 1);
        if (drawn === 1) continue;
        if (drawn === 0) holes += 1; else doubles += 1;
        first ??= { surface: j, storey: S, k, lo, hi };
      }
    }
  }
  return { bands, holes, doubles, opened, first };
};
