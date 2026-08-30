// rig.ts — cable/hoist dynamics for the Field Workbench UI (ported from the
// redesign mockups' pga-rig.js). Pure math; no DOM except pathSampler's input.

// Critically-damp-ish spring integrator: returns [pos, vel].
export function spring(cur: number, vel: number, target: number, k = 120, d = 14, dt = 1 / 60): [number, number] {
  const a = k * (target - cur) - d * vel;
  vel += a * dt;
  cur += vel * dt;
  return [cur, vel];
}

// Cable routed over a list of sheave nodes [[x,y],…]; each span sags by `sag` px.
export function routePath(nodes: Array<[number, number]>, sag = 6): string {
  let d = `M${nodes[0][0].toFixed(1)} ${nodes[0][1].toFixed(1)}`;
  for (let i = 1; i < nodes.length; i++) {
    const [x0, y0] = nodes[i - 1];
    const [x1, y1] = nodes[i];
    const vert = Math.abs(x1 - x0) < Math.abs(y1 - y0);
    const cx = vert ? (x0 + x1) / 2 + sag : (x0 + x1) / 2;
    const cy = vert ? (y0 + y1) / 2 : Math.max(y0, y1) + sag;
    d += ` Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

export interface PathSampler {
  len: number;
  at(x: number): { y: number; ang: number };
  atLen(s: number): DOMPoint;
}

// Samples a laid-out <path> so riders can sit on the cable: at(x) for a span that
// advances in x, atLen(s) for anything routed (verticals, doglegs).
export function pathSampler(pathEl: SVGPathElement, n = 64): PathSampler {
  const len = pathEl.getTotalLength();
  const pts: DOMPoint[] = [];
  for (let i = 0; i <= n; i++) pts.push(pathEl.getPointAtLength((len * i) / n));
  return {
    len,
    at(x: number) {
      let i = 1;
      while (i < pts.length - 1 && pts[i].x < x) i++;
      const a = pts[i - 1];
      const b = pts[i];
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return { y: a.y + (b.y - a.y) * t, ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
    },
    atLen(s: number) {
      return pathEl.getPointAtLength(Math.max(0, Math.min(len, s)));
    },
  };
}

export const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
