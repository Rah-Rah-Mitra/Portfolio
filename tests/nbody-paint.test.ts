import { describe, expect, it } from 'vitest';
import { BODY_ALPHA, paintField, trailFade, type FieldInk } from '../lib/nbody/paint';
import { FIELD_SCALE } from '../lib/nbody/workerProtocol';

// The N-body field is inked onto a TRANSPARENT canvas over the light desk. The
// old dark desktop filled an opaque surface every frame and drew bodies with
// 'lighter'; either one on the workbench would paint a slab over the blueprint
// grid. A recording context pins the compositing sequence.

type Call = { op: string; args: unknown[]; composite: string; alpha: number; fill: unknown; stroke: unknown };

const recorder = () => {
  const calls: Call[] = [];
  const state = { globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '' as unknown, strokeStyle: '' as unknown, lineWidth: 1 };
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ op, args, composite: state.globalCompositeOperation, alpha: state.globalAlpha, fill: state.fillStyle, stroke: state.strokeStyle });
  };
  const context = Object.assign(state, {
    fillRect: record('fillRect'),
    drawImage: record('drawImage'),
    beginPath: record('beginPath'),
    rect: record('rect'),
    stroke: record('stroke'),
  });
  return { context: context as unknown as CanvasRenderingContext2D, calls, state };
};

const ink: FieldInk = { accent: '#5980a6', accentDeep: '#416180', trailPersistence: 38 };
const sprite = {} as CanvasImageSource;

describe('N-body field ink', () => {
  it('fades the last frame toward transparent, then lays bodies on with source-over', () => {
    const { context, calls, state } = recorder();
    paintField(context, { positions: [0, 0, 0.5, -0.25], count: 2, width: 1000, height: 500, dpr: 1, sprite }, ink);

    const [erase, ...bodies] = calls;
    expect(erase).toMatchObject({ op: 'fillRect', composite: 'destination-out', args: [0, 0, 1000, 500] });
    expect(erase!.alpha).toBeCloseTo(1 - 38 / 100, 12);
    expect(bodies).toHaveLength(2);
    for (const body of bodies) expect(body).toMatchObject({ op: 'drawImage', composite: 'source-over', alpha: BODY_ALPHA });
    expect(calls.some((call) => call.composite === 'lighter')).toBe(false);
    expect(state.globalAlpha).toBe(1);
  });

  it('places bodies in the square field frame centred on the desk', () => {
    const { context, calls } = recorder();
    paintField(context, { positions: [0.5, -0.25], count: 1, width: 1000, height: 500, dpr: 1, sprite }, ink);
    const draw = calls.find((call) => call.op === 'drawImage')!;
    const [, x, y, w] = draw.args as number[];
    const unit = 500 * FIELD_SCALE;
    expect(x! + w! / 2).toBeCloseTo(500 + 0.5 * unit, 9);
    expect(y! + w! / 2).toBeCloseTo(250 + 0.25 * unit, 9);
  });

  it('floors the per-frame erase so a long trail cannot leave a permanent haze', () => {
    expect(trailFade(0)).toBe(1);
    expect(trailFade(90)).toBeCloseTo(0.1, 12);
  });

  it('draws the quadtree as one stroked path of accent hairlines when asked', () => {
    const { context, calls } = recorder();
    const leaves = { bounds: new Float32Array([0, 0, 0.5, 0.25, 0.25, 0.125]), count: 2 };
    paintField(context, { positions: [], count: 0, width: 400, height: 400, dpr: 2, sprite, leaves }, ink);
    expect(calls.filter((call) => call.op === 'rect')).toHaveLength(2);
    const stroke = calls.filter((call) => call.op === 'stroke');
    expect(stroke).toHaveLength(1);
    expect(stroke[0]).toMatchObject({ composite: 'source-over', stroke: ink.accent });
  });
});
