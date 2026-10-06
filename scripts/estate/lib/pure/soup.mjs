// A triangle soup: world-baked triangles, each with a palette slot and a
// storey index. Positions are float64 so keys and checks see what upstream
// wrote; they become float32, then quantised, only when a GLB is built.
// Imports nothing.

export class Soup {
  constructor(capacity = 1024) {
    this.count = 0;
    this.pos = new Float64Array(capacity * 9);
    this.slot = new Uint8Array(capacity);
    this.storey = new Uint8Array(capacity);
  }

  reserve(n) {
    const need = this.count + n;
    if (need <= this.slot.length) return;
    let cap = this.slot.length || 1;
    while (cap < need) cap *= 2;
    const pos = new Float64Array(cap * 9); pos.set(this.pos.subarray(0, this.count * 9)); this.pos = pos;
    const slot = new Uint8Array(cap); slot.set(this.slot.subarray(0, this.count)); this.slot = slot;
    const storey = new Uint8Array(cap); storey.set(this.storey.subarray(0, this.count)); this.storey = storey;
  }

  /** Appends one triangle from nine coordinates. Returns its index. */
  push(ax, ay, az, bx, by, bz, cx, cy, cz, slot, storey = 0) {
    this.reserve(1);
    const i = this.count;
    const p = this.pos; const o = i * 9;
    p[o] = ax; p[o + 1] = ay; p[o + 2] = az;
    p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz;
    p[o + 6] = cx; p[o + 7] = cy; p[o + 8] = cz;
    this.slot[i] = slot; this.storey[i] = storey;
    this.count += 1;
    return i;
  }

  /** Appends triangle `i` of `other`, optionally shifted in y and re-tagged. */
  pushFrom(other, i, dy = 0, storey = other.storey[i]) {
    const p = other.pos; const o = i * 9;
    return this.push(p[o], p[o + 1] + dy, p[o + 2], p[o + 3], p[o + 4] + dy, p[o + 5], p[o + 6], p[o + 7] + dy, p[o + 8], other.slot[i], storey);
  }

  /** Appends every triangle of `other`. */
  append(other) {
    this.reserve(other.count);
    for (let i = 0; i < other.count; i += 1) this.pushFrom(other, i);
    return this;
  }

  /** A new soup holding the listed triangles, in that order. */
  pick(indices, dy = 0) {
    const out = new Soup(indices.length || 1);
    for (const i of indices) out.pushFrom(this, i, dy);
    return out;
  }

  /** Lowest y (up, glTF) of triangle i. */
  minY(i) { const p = this.pos; const o = i * 9; return Math.min(p[o + 1], p[o + 4], p[o + 7]); }

  /** Swaps vertices b and c of triangle i (reverses its winding). */
  flip(i) {
    const p = this.pos; const o = i * 9;
    for (let k = 0; k < 3; k += 1) { const t = p[o + 3 + k]; p[o + 3 + k] = p[o + 6 + k]; p[o + 6 + k] = t; }
  }

  /** [min, max] over every vertex, or null when empty. */
  bounds() {
    if (!this.count) return null;
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    const p = this.pos;
    for (let o = 0; o < this.count * 9; o += 3) {
      for (let k = 0; k < 3; k += 1) { const v = p[o + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
    }
    return [lo, hi];
  }
}

/** Concatenates soups into one. */
export const concatSoups = (soups) => {
  const total = soups.reduce((n, s) => n + s.count, 0);
  const out = new Soup(total || 1);
  for (const s of soups) out.append(s);
  return out;
};
