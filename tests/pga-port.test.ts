import { describe, expect, it } from 'vitest';
import { Ap, CC, Join, Mot, Rot, Slerp, Tr, dist } from '../lib/pga';
import { kit, type Palette } from '../lib/pgaDraw';
import { MECHANISMS } from '../lib/pgaMechanisms';
import { ASSETS as ASSETS1 } from '../design/mockups/pga-assets-1.js';
import { ASSETS as ASSETS2 } from '../design/mockups/pga-assets-2.js';
import { ASSETS as ASSETS3 } from '../design/mockups/pga-assets-3.js';

// lib/pga*.ts is a hand-trimmed port of the approved mockups in design/mockups.
// These tests exist so a transcription slip in that port is loud. The second
// block is the real one: it replays each ported mechanism and its ORIGINAL side
// by side through the same kit and compares every resulting canvas call.

const PALETTE: Palette = {
  ink: '#1d1f20', accent: '#5980a6', ghost: '#8b9096',
  faint: '#c2c6ca', paper: '#f2f2f3', label: '#5d5d60',
};

const r6 = (v: unknown) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);

/** A canvas whose 2D context records every call instead of painting. */
const recordingCanvas = () => {
  const calls: string[] = [];
  const rec = (name: string) => (...args: unknown[]) => { calls.push(`${name}(${args.map(r6).join(',')})`); };
  const ctx: Record<string, unknown> = {};
  for (const m of ['beginPath', 'moveTo', 'lineTo', 'arc', 'closePath', 'stroke', 'fill',
    'fillText', 'setTransform', 'clearRect', 'setLineDash', 'save', 'restore', 'clip']) ctx[m] = rec(m);
  // Style writes matter (colour, width, dash) — capture them as calls too.
  for (const p of ['strokeStyle', 'fillStyle', 'lineWidth', 'globalAlpha', 'font', 'lineCap', 'lineJoin', 'textAlign', 'textBaseline']) {
    let v: unknown;
    Object.defineProperty(ctx, p, { get: () => v, set: (next) => { v = next; calls.push(`${p}=${r6(next)}`); } });
  }
  const cv = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { cv, calls };
};

describe('PGA algebra port', () => {
  it('fixes the centre of its own rotation and preserves radius', () => {
    const c: [number, number] = [40, 25];
    expect(Ap(Rot(c[0], c[1], 0.7), c).map(r6)).toEqual(c);
    const p: [number, number] = [40 + 13, 25];
    expect(dist(c, Ap(Rot(c[0], c[1], 1.9), p))).toBeCloseTo(13, 9);
  });

  it('composes: Mot is Tr after Rot, applied in that order', () => {
    const p: [number, number] = [12, -5];
    const direct = Ap(Mot(3, 4, 0.8, 17, -9), p);
    const staged = Ap(Tr(17, -9), Ap(Rot(3, 4, 0.8), p));
    expect(direct.map(r6)).toEqual(staged.map(r6));
  });

  it('translates by the vector it was given', () => {
    const moved = Ap(Tr(9, -4), [100, 100]);
    expect(dist([100, 100], moved)).toBeCloseTo(Math.hypot(9, 4), 9);
    // two translators compose additively
    expect(Ap(Tr(2, 3), Ap(Tr(5, 7), [0, 0])).map(r6)).toEqual(Ap(Tr(7, 10), [0, 0]).map(r6));
  });

  it('Slerp hits both poses at its endpoints', () => {
    const A = Mot(30, 40, 0.15, 0, 0), B = Mot(30, 40, 2.25, 168, 96), p: [number, number] = [10, 10];
    expect(Ap(Slerp(A, B, 0), p).map(r6)).toEqual(Ap(A, p).map(r6));
    expect(Ap(Slerp(A, B, 1), p).map(r6)).toEqual(Ap(B, p).map(r6));
  });

  it('CC solves the dyad, and clamps instead of going NaN out of reach', () => {
    // circles r=5 at (0,0) and (8,0) meet at x=4, y=±3; `s` picks the branch
    expect(CC([0, 0], 5, [8, 0], 5, 1).map(r6)).toEqual([4, 3]);
    expect(CC([0, 0], 5, [8, 0], 5, -1).map(r6)).toEqual([4, -3]);
    const unreachable = CC([0, 0], 1, [10, 0], 1, 1);
    expect(unreachable.every(Number.isFinite)).toBe(true);
  });

  it('Join returns a line through both points', () => {
    const p: [number, number] = [3, 7], q: [number, number] = [-11, 2];
    const l = Join(p, q); // a·e1 + b·e2 + c·e0 -> blades 2, 4, 1
    for (const [x, y] of [p, q]) expect(l[2] * x + l[4] * y + l[1]).toBeCloseTo(0, 9);
  });
});

describe('mechanism port fidelity', () => {
  const originals = new Map<string, any>(
    [...ASSETS1, ...ASSETS2, ...ASSETS3].map((a: any) => [a.id, a]),
  );

  it('ports exactly six of the eighty-three assets', () => {
    expect(originals.size).toBe(83);
    expect(MECHANISMS).toHaveLength(6);
  });

  for (const mech of MECHANISMS) {
    it(`${mech.id} draws identically to the approved mockup`, () => {
      const original = originals.get(mech.id);
      expect(original, `${mech.id} missing from design/mockups`).toBeTruthy();
      // Metadata the caption and the aria-label are built from must match too.
      expect([mech.n, mech.f, mech.d, mech.pga, mech.i])
        .toEqual([original.n, original.f, original.d, original.pga, original.i]);
      expect(mech.rate).toBe(original.rate);

      // Same kit, same inputs, two independent scratch objects: any difference
      // in the recorded calls is a difference in the draw body or the algebra.
      const io = { u: 1.37, t: 2.5, dt: 1 / 60, mx: 214, my: 63, hover: true, down: true, traces: true };
      const a = recordingCanvas();
      const b = recordingCanvas();
      mech.draw(kit(a.cv, 320, 230, PALETTE), { ...io }, {});
      original.draw(kit(b.cv, 320, 230, PALETTE), { ...io, ghost: true }, {});
      expect(a.calls.length).toBeGreaterThan(20);
      expect(a.calls).toEqual(b.calls);
    });
  }
});
