import { describe, expect, it } from 'vitest';
import {
  RESIZE_DEBOUNCE_MS, RESIZE_NONE, SETTLE_FRAMES, beginFrame, cancelFrame, createFrameLoop, endFrame, invalidate,
  markChanged, noteResize, takeResize, type FrameActivity, type FrameLoopState,
} from '../lib/estate/frameLoop';

// Render-on-change (plan §7.8) against a fake host: a one-slot rAF queue that
// fails the test if a second frame is ever requested while one is pending, the
// way engine/loop.ts will drive the real thing.

const REST: FrameActivity = { controls: false, keys: false, tweens: false, uploads: false };
const only = (key: keyof FrameActivity): FrameActivity => ({ ...REST, [key]: true });

const makeHost = () => {
  const loop = createFrameLoop();
  let queued = 0;
  let requests = 0;
  let frames = 0;
  const ask = (yes: boolean) => {
    if (!yes) return;
    queued += 1;
    requests += 1;
    expect(queued, 'a second rAF while one is pending').toBe(1);
  };
  /** One display refresh: runs the requested frame, if there is one. Activity is read after the work. */
  const vsync = (activity: FrameActivity | (() => FrameActivity) = REST, work?: (loop: FrameLoopState) => void) => {
    if (queued === 0) return null;
    queued -= 1;
    frames += 1;
    const continuous = beginFrame(loop);
    const settling = loop.settling;
    work?.(loop);
    ask(endFrame(loop, typeof activity === 'function' ? activity() : activity));
    return { continuous, settling };
  };
  return {
    loop,
    ask,
    vsync,
    get requests() { return requests; },
    get frames() { return frames; },
    get queued() { return queued; },
  };
};

describe('invalidate', () => {
  it('requests one frame and merges every invalidation until it runs', () => {
    const loop = createFrameLoop();
    expect(invalidate(loop)).toBe(true);
    for (let i = 0; i < 5; i += 1) expect(invalidate(loop)).toBe(false);
    expect(markChanged(loop)).toBe(false);
    expect(loop.pending).toBe(true);
    beginFrame(loop);
    expect(loop.pending).toBe(false);
    expect(invalidate(loop)).toBe(true);
  });

  it('draws once and then nothing at rest', () => {
    const host = makeHost();
    host.ask(invalidate(host.loop));
    host.ask(invalidate(host.loop));
    expect(host.vsync()).not.toBeNull();
    for (let i = 0; i < 600; i += 1) expect(host.vsync()).toBeNull();
    expect(host.requests).toBe(1);
    expect(host.frames).toBe(1);
    expect(host.loop.pending).toBe(false);
  });

  it('keeps drawing while any one activity holds, and stops on the frame it ends', () => {
    for (const key of ['controls', 'keys', 'tweens', 'uploads'] as const) {
      const host = makeHost();
      host.ask(invalidate(host.loop));
      for (let i = 0; i < 5; i += 1) host.vsync(only(key));
      host.vsync(REST);
      for (let i = 0; i < 100; i += 1) expect(host.vsync(only(key)), key).toBeNull();
      expect(host.frames, key).toBe(6);
      expect(host.requests, key).toBe(6);
    }
  });

  it('takes an invalidation during a frame as that frame\'s one continuation', () => {
    const host = makeHost();
    host.ask(invalidate(host.loop));
    host.vsync(only('controls'), (loop) => host.ask(invalidate(loop)));
    expect(host.requests).toBe(2);
    // Requested during the frame, so it is honoured even though nothing moves now.
    host.vsync(REST, (loop) => { host.ask(invalidate(loop)); host.ask(invalidate(loop)); });
    host.vsync(REST);
    expect(host.vsync()).toBeNull();
    expect(host.frames).toBe(3);
    expect(host.requests).toBe(3);
  });

  it('forgets a cancelled request, so the next invalidation asks again', () => {
    const loop = createFrameLoop();
    expect(invalidate(loop)).toBe(true);
    cancelFrame(loop);
    expect(loop.pending).toBe(false);
    expect(invalidate(loop)).toBe(true);
    // Owed frames survive a freeze.
    const owed = createFrameLoop();
    markChanged(owed);
    cancelFrame(owed);
    expect(owed.settle).toBe(SETTLE_FRAMES);
  });
});

describe('settle frames', () => {
  it('draws exactly 2 frames after a swap, band change or resize at rest', () => {
    const host = makeHost();
    host.ask(markChanged(host.loop));
    expect(host.vsync()).toEqual({ continuous: false, settling: true });
    expect(host.vsync()).toEqual({ continuous: true, settling: true });
    expect(host.vsync()).toBeNull();
    expect(host.frames).toBe(SETTLE_FRAMES);
  });

  it('owes the 2 frames after the current one when the change happens mid-frame', () => {
    const host = makeHost();
    host.ask(invalidate(host.loop));
    expect(host.vsync(REST, (loop) => host.ask(markChanged(loop)))?.settling).toBe(false);
    expect(host.vsync()?.settling).toBe(true);
    expect(host.vsync()?.settling).toBe(true);
    expect(host.vsync()).toBeNull();
    expect(host.frames).toBe(1 + SETTLE_FRAMES);
  });

  it('never stacks: a second change restarts the count at 2 rather than adding', () => {
    const host = makeHost();
    host.ask(markChanged(host.loop));
    host.ask(markChanged(host.loop));
    host.vsync(REST, (loop) => host.ask(markChanged(loop)));
    host.vsync();
    host.vsync();
    expect(host.vsync()).toBeNull();
    expect(host.frames).toBe(3);
  });

  it('runs alongside activity without extending it', () => {
    const host = makeHost();
    host.ask(markChanged(host.loop));
    for (let i = 0; i < 10; i += 1) host.vsync(only('uploads'));
    host.vsync(REST);
    expect(host.vsync()).toBeNull();
    expect(host.frames).toBe(11);
  });
});

describe('continuous frames (governor samples)', () => {
  it('marks only frames that directly follow a drawn frame', () => {
    const host = makeHost();
    host.ask(invalidate(host.loop));
    expect(host.vsync(only('keys'))?.continuous).toBe(false); // its interval spans the rest
    expect(host.vsync(only('keys'))?.continuous).toBe(true);
    expect(host.vsync(REST)?.continuous).toBe(true);
    expect(host.vsync()).toBeNull();
    // Idle, then a new invalidation: the rest is in that frame's interval.
    host.ask(invalidate(host.loop));
    expect(host.vsync(REST, (loop) => host.ask(invalidate(loop)))?.continuous).toBe(false);
    // Requested during the previous frame: continuous.
    expect(host.vsync(REST)?.continuous).toBe(true);
    expect(host.vsync()).toBeNull();
  });

  it('treats a cancelled run as broken', () => {
    const host = makeHost();
    host.ask(invalidate(host.loop));
    host.vsync(only('controls'));
    cancelFrame(host.loop); // the host also cancels its rAF
    const loop = host.loop;
    expect(invalidate(loop)).toBe(true);
    expect(beginFrame(loop)).toBe(false);
  });
});

describe('resize debounce', () => {
  it('applies the size once, 150 ms after the last of a burst', () => {
    const loop = createFrameLoop();
    expect(takeResize(loop, 0)).toBe(RESIZE_NONE);
    expect(noteResize(loop, 0)).toBe(RESIZE_DEBOUNCE_MS);
    expect(noteResize(loop, 100)).toBe(RESIZE_DEBOUNCE_MS);
    // The first timer fires at 150: a later resize moved the deadline to 250.
    expect(takeResize(loop, 150)).toBe(100);
    // A timer that fires a hair early is re-armed, not lost.
    expect(takeResize(loop, 249.9)).toBeCloseTo(0.1, 9);
    expect(takeResize(loop, 250)).toBe(0);
    expect(takeResize(loop, 260)).toBe(RESIZE_NONE);
    // Nothing was drawn for the burst itself; the host now owes 2 frames.
    expect(loop.pending).toBe(false);
    expect(markChanged(loop)).toBe(true);
    expect(loop.settle).toBe(SETTLE_FRAMES);
  });
});

describe('a session', () => {
  it('requests frames only while something moves, and none at rest', () => {
    const host = makeHost();
    const restFrames = () => {
      for (let i = 0; i < 300; i += 1) expect(host.vsync(REST)).toBeNull();
    };
    // First live frame.
    host.ask(markChanged(host.loop));
    host.vsync();
    host.vsync();
    restFrames();
    const afterBoot = host.requests;
    expect(afterBoot).toBe(2);

    // A drag: pointer events invalidate, controls report motion for the drag
    // and 20 frames of damping after it.
    host.ask(invalidate(host.loop));
    for (let i = 0; i < 50; i += 1) {
      host.vsync(only('controls'), (loop) => { if (i < 30) host.ask(invalidate(loop)); });
    }
    host.vsync(REST);
    restFrames();
    expect(host.requests - afterBoot).toBe(51);

    // Five downloads land while idle; one upload a frame, a swap on each.
    let queue = 0;
    for (let i = 0; i < 5; i += 1) {
      queue += 1;
      host.ask(invalidate(host.loop));
    }
    const beforeUploads = host.frames;
    let drawn = 0;
    while (host.vsync(() => ({ ...REST, uploads: queue > 0 }), (loop) => {
      if (queue > 0) {
        queue -= 1;
        host.ask(markChanged(loop));
      }
    })) drawn += 1;
    // 5 upload frames, then the 2 owed to the last swap.
    expect(drawn).toBe(5 + SETTLE_FRAMES);
    expect(host.frames - beforeUploads).toBe(drawn);
    restFrames();
    expect(host.queued).toBe(0);
    expect(host.loop.pending).toBe(false);
  });
});
