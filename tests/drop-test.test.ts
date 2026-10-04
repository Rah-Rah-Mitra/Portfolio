import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { coreCompetencies } from '../portfolioData';
import { loadMatter } from '../lib/physicsRuntime';
import {
  BLOCK_H, DROP_FRAME, FLOOR_Y, G, GRAVITY_SCALE, GRAVITY_Y, HOLD_STEPS, PLUMMER_PEAK,
  STRIKE_CENTRE, WELL_CENTRE, buildLayout, nearestPointOnBox, poseTransform, restoreDuration, restorePose,
  smashKicks, smashPeakDv, smashPeakSpeed, sumKicks, uprightAngle, wellAcceleration, wellPeakG,
} from '../lib/dropTest';
import { DropRig } from '../lib/dropRig';
import { DropTest } from '../components/workbench/DropTest';

// The drop test's outcome is decided entirely in lib/dropTest.ts, so this file
// holds the model to its claims — the layout is real content, the two force
// models are the ones the caption names, and the rig, run on the real matter-js
// engine, is contained and seed-stable.

const layout = buildLayout(coreCompetencies);
const len = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

describe('drop test layout', () => {
  it('builds one stack per competency from that competency\'s own tools', () => {
    expect(layout.columns.map((c) => c.id)).toEqual(coreCompetencies.map((c) => c.id));
    for (const block of layout.blocks) {
      const cluster = coreCompetencies.find((c) => c.id === block.column);
      expect(cluster?.tools).toContain(block.label);
    }
    const labels = layout.blocks.map((b) => b.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
    expect(layout.blocks).toHaveLength(24);
  });

  it('stands every stack on the floor, widest first, inside its own column', () => {
    for (const column of layout.columns) {
      const stack = layout.blocks.filter((b) => b.column === column.id).sort((a, b) => a.layer - b.layer);
      expect(stack[0].home.y + BLOCK_H / 2).toBe(FLOOR_Y);
      stack.forEach((block, i) => {
        expect(block.home.x).toBe(column.x);
        if (i > 0) {
          expect(block.w).toBeLessThanOrEqual(stack[i - 1].w);
          expect(stack[i - 1].home.y - block.home.y).toBe(BLOCK_H);
        }
        // Neighbouring stacks never touch, so one stack falling is the strike's doing.
        expect(block.w).toBeLessThan(layout.pitch - 10);
      });
    }
  });
});

describe('force models', () => {
  it('uses real gravity at 1 u = 1 cm', () => {
    // matter-js force per unit mass is gravity.y * scale in u/ms²; × 1e6 → u/s².
    expect(GRAVITY_Y * GRAVITY_SCALE * 1e6).toBeCloseTo(G, 9);
    expect(smashPeakSpeed(0)).toBe(1.5);
    expect(smashPeakSpeed(100)).toBe(9);
    expect(smashPeakDv(60)).toBeCloseTo(6 * 100 / 60, 9);
    expect(wellPeakG(100)).toBe(3);
  });

  it('finds the nearest point of an oriented box', () => {
    const box = { x: 100, y: 100, angle: 0, w: 40, h: 20 };
    expect(nearestPointOnBox(box, { x: 105, y: 102 })).toEqual({ x: 105, y: 102 });
    expect(nearestPointOnBox(box, { x: 200, y: 100 })).toEqual({ x: 120, y: 100 });
    const turned = nearestPointOnBox({ ...box, angle: Math.PI / 2 }, { x: 100, y: 200 });
    expect(turned.x).toBeCloseTo(100, 9);
    expect(turned.y).toBeCloseTo(120, 9);
  });

  it('smash falls off linearly with distance and stops at the radius', () => {
    const at = { x: 300, y: 100 };
    const box = (x: number) => ({ x, y: 100, angle: 0, w: 20, h: 20 });
    const near = sumKicks(smashKicks(box(330), at, 10, 100, 1000));
    const far = sumKicks(smashKicks(box(380), at, 10, 100, 1000));
    expect(len(near)).toBeCloseTo(10 * (1 - 20 / 100), 9);
    expect(len(far)).toBeCloseTo(10 * (1 - 70 / 100), 9);
    expect(smashKicks(box(430), at, 10, 100, 1000)).toEqual([]);
    // Mirror-symmetric about the strike.
    const left = sumKicks(smashKicks(box(270), at, 10, 100, 1000));
    expect(left.x).toBeCloseTo(-near.x, 9);
    expect(left.y).toBeCloseTo(near.y, 9);
  });

  it('smash reflected off the floor lifts a block beside the strike, never past the peak', () => {
    const block = { x: 360, y: FLOOR_Y - BLOCK_H / 2, angle: 0, w: 60, h: BLOCK_H };
    const kicks = smashKicks(block, { x: 300, y: FLOOR_Y - 10 }, 10, 140);
    expect(kicks).toHaveLength(2);
    const dv = sumKicks(kicks);
    expect(dv.x).toBeGreaterThan(0);
    expect(dv.y).toBeLessThan(0);
    expect(len(dv)).toBeLessThanOrEqual(10 + 1e-9);
  });

  it('the well is a Plummer-softened inverse square peaking at r = ε/√2', () => {
    const at = { x: 0, y: 0 };
    const core = 60;
    const peak = 1.5 * G;
    const a = (r: number) => len(wellAcceleration({ x: r, y: 0 }, at, peak, core));
    expect(a(core / Math.SQRT2)).toBeCloseTo(peak, 6);
    expect(a(core / Math.SQRT2 * 0.9)).toBeLessThan(peak);
    expect(a(core / Math.SQRT2 * 1.1)).toBeLessThan(peak);
    expect(a(0)).toBe(0);
    // Far field is ordinary 1/r².
    expect(a(4000) / a(8000)).toBeCloseTo(4, 2);
    // And it points at the well.
    const toward = wellAcceleration({ x: 30, y: 40 }, at, peak, core);
    expect(toward.x).toBeLessThan(0);
    expect(toward.y / toward.x).toBeCloseTo(40 / 30, 9);
    expect(PLUMMER_PEAK).toBeCloseTo((1 / Math.SQRT2) / Math.pow(1.5, 1.5), 12);
  });

  it('reset carries a block home bottom layer first and turns it the short way upright', () => {
    expect(uprightAngle(2 * Math.PI + 0.1)).toBeCloseTo(0.1, 9);
    expect(uprightAngle(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9);
    const from = { x: 10, y: 20, angle: 2 * Math.PI - 0.2 };
    const home = { x: 100, y: 200 };
    expect(restorePose(from, home, 0, 0)).toMatchObject({ x: 10, y: 20 });
    expect(restorePose(from, home, 2, 10)).toMatchObject({ x: 10, y: 20 });
    const end = restorePose(from, home, 3, restoreDuration(4));
    expect(end.x).toBe(100);
    expect(end.y).toBe(200);
    expect(Math.abs(end.angle)).toBe(0);
    expect(restorePose(from, home, 0, 18).angle).toBeLessThan(0);
  });
});

describe('the rig on the real engine', () => {
  const inside = (rig: DropRig) => rig.bodies.every((b) => (
    b.position.x > 0 && b.position.x < DROP_FRAME.w && b.position.y > 0 && b.position.y < FLOOR_Y
  ));

  it('starts at rest in its home stacks', async () => {
    const rig = new DropRig(await loadMatter(), layout.blocks);
    expect(rig.idle).toBe(true);
    expect(rig.readout()).toMatchObject({ phase: 'rest', moving: 0, displaced: 0, total: 24, settle: null });
  });

  it('a centre strike topples blocks, stays inside the rig and comes to rest', async () => {
    const rig = new DropRig(await loadMatter(), layout.blocks);
    const hit = rig.strike(STRIKE_CENTRE, smashPeakDv(60), 140);
    expect(hit).toBeGreaterThan(0);
    expect(rig.readout().phase).toBe('moving');
    rig.settle();
    expect(rig.idle).toBe(true);
    expect(inside(rig)).toBe(true);
    const out = rig.readout();
    expect(out.phase).toBe('rest');
    expect(out.displaced).toBeGreaterThan(0);
    expect(out.peakImpulse).toBeGreaterThan(0);
    expect(out.settle).toBeGreaterThan(0);
  });

  it('is seed-stable: the same strike lands the same way every time', async () => {
    const M = await loadMatter();
    const run = () => {
      const rig = new DropRig(M, layout.blocks);
      rig.strike({ x: 250, y: 200 }, smashPeakDv(80), 180);
      for (let i = 0; i < 120; i += 1) rig.step();
      return rig.bodies.map((b) => [b.position.x, b.position.y, b.angle]);
    };
    expect(run()).toEqual(run());
  });

  it('a reset rebuilds the rig: the same strike after a reset lands as on a fresh one', async () => {
    // Re-posing the old bodies left warm-start impulses, broadphase order and
    // vertex drift in the engine, and the next strike read 18/24 in 3.22 s
    // where a fresh rig reads 17/24 in 2.60 s.
    const M = await loadMatter();
    const pose = (rig: DropRig) => rig.bodies.map((b) => [b.position.x, b.position.y, b.angle]);
    const fresh = new DropRig(M, layout.blocks);
    fresh.strike(STRIKE_CENTRE, smashPeakDv(60), 140);
    fresh.settle();
    const expected = { pose: pose(fresh), readout: fresh.readout() };
    for (const instant of [true, false]) {
      const rig = new DropRig(M, layout.blocks);
      const bodies = rig.bodies;
      for (let round = 0; round < 3; round += 1) {
        rig.strike(STRIKE_CENTRE, smashPeakDv(60), 140);
        rig.settle();
        expect(pose(rig)).toEqual(expected.pose);
        expect(rig.readout()).toEqual(expected.readout);
        rig.restore(instant);
        rig.settle();
      }
      // Refilled in place: a painter holding the array still paints the live bodies.
      expect(rig.bodies).toBe(bodies);
      expect(M.Composite.allBodies(rig.engine.world)).toEqual(expect.arrayContaining(bodies));
    }
  });

  it('a miss changes nothing', async () => {
    const rig = new DropRig(await loadMatter(), layout.blocks);
    expect(rig.strike({ x: 320, y: 10 }, smashPeakDv(60), 60)).toBe(0);
    expect(rig.idle).toBe(true);
  });

  it('the well switches gravity off, pulls blocks in, and lets them fall on release', async () => {
    const rig = new DropRig(await loadMatter(), layout.blocks);
    const spread = () => rig.bodies.reduce((sum, b) => sum + Math.hypot(b.position.x - WELL_CENTRE.x, b.position.y - WELL_CENTRE.y), 0);
    const before = spread();
    rig.hold(WELL_CENTRE, wellPeakG(60) * G, 60, HOLD_STEPS);
    expect(rig.engine.gravity.y).toBe(0);
    for (let i = 0; i < HOLD_STEPS - 1; i += 1) rig.step();
    expect(rig.readout().phase).toBe('held');
    expect(spread()).toBeLessThan(before * 0.8);
    rig.step();
    // The timed pull let go by itself.
    expect(rig.engine.gravity.y).toBe(GRAVITY_Y);
    const meanY = () => rig.bodies.reduce((sum, b) => sum + b.position.y, 0) / rig.bodies.length;
    const released = meanY();
    rig.settle();
    expect(rig.idle).toBe(true);
    expect(inside(rig)).toBe(true);
    // The clump came down onto the floor as a pile.
    expect(meanY()).toBeGreaterThan(released + BLOCK_H);
    expect(Math.max(...rig.bodies.map((b) => b.position.y))).toBeGreaterThan(FLOOR_Y - BLOCK_H);
    expect(rig.readout()).toMatchObject({ phase: 'rest', moving: 0 });
  });

  it('reset carries every block home and to sleep, animated or instant', async () => {
    const M = await loadMatter();
    for (const instant of [false, true]) {
      const rig = new DropRig(M, layout.blocks);
      rig.strike(STRIKE_CENTRE, smashPeakDv(100), 240);
      rig.settle();
      rig.restore(instant);
      expect(rig.readout().phase).toBe(instant ? 'rest' : 'restoring');
      const steps = rig.settle();
      expect(steps).toBe(instant ? 0 : restoreDuration(4));
      expect(rig.idle).toBe(true);
      rig.bodies.forEach((b, i) => {
        expect(b.position).toEqual(layout.blocks[i].home);
        expect(b.angle).toBe(0);
        expect(b.isSleeping).toBe(true);
      });
      expect(rig.readout()).toMatchObject({ displaced: 0, peakImpulse: null, settle: null });
    }
  });
});

describe('prerender', () => {
  it('renders the home stacks and their words without a browser', () => {
    const markup = renderToString(React.createElement(DropTest));
    expect(markup).toContain('id="drop-test"');
    expect(markup).toContain('FIG. 05e');
    for (const block of layout.blocks) {
      expect(markup).toContain(`transform="${poseTransform(block.home.x, block.home.y)}"`);
      expect(markup).toContain(block.label);
    }
    // The assistive-tech list names every stack in full.
    for (const column of layout.columns) expect(markup).toContain(column.title.replace(/&/g, '&amp;'));
  });
});
