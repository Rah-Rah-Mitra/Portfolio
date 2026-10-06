// Storey tags for façade (F) triangles and detail (D) instances (plan §6.2
// steps 6b, 6c; decision C2). Imports only sibling pure modules.

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
 * Tags every triangle of `soup` (glTF Y-up, block-local) with its owning
 * storey index, in place. First an exact match: the triangle's key relative to
 * a storey's FFL is in that storey's interior chunk (`chunkCounts[s]`, a Map
 * of keys relative to FFL_s), trying every storey nearest the z-min band
 * first — a double-height hall's roof belongs to the storey whose chunk holds
 * it, two storeys below its band (NC_514). Only a triangle no chunk holds
 * takes the z-min band rule. Returns { exactMatched, banded }.
 */
export const tagByChunks = (soup, ffls, chunkCounts) => {
  let exactMatched = 0; let banded = 0;
  for (let i = 0; i < soup.count; i += 1) {
    const band = bandIndex(ffls, soup.minY(i));
    let tag = -1;
    for (const s of searchOrder(band, ffls.length)) {
      const counts = chunkCounts[s];
      if (counts && counts.has(triKey(soup, i, ffls[s]))) { tag = s; break; }
    }
    if (tag >= 0) exactMatched += 1; else { tag = band; banded += 1; }
    soup.storey[i] = tag;
  }
  return { exactMatched, banded };
};

/** The band-rule storey of an instance from its translation's height (glTF y). */
export const instanceStorey = (ffls, y) => bandIndex(ffls, y);
