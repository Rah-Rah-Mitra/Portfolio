import { describe, expect, it } from 'vitest';
import { REST_AFTER_MS } from '../lib/drawings/effects';
import { decodeSheet } from '../lib/drawings/decode';
import { Scheduler, type SchedulePhase, type SchedulerHost, type Step } from '../lib/drawings/schedule';
import { cycleMs, deskCycle, dutyCycle, type CycleFacts, type Shot } from '../lib/drawings/sequence';
import { SITES } from '../lib/drawings/site.generated';
import { SHEETS as BLK_501_SHEETS } from '../lib/drawings/sheets/BLK_501.generated';

// The desk drawing set's clock (lib/drawings/schedule.ts; plan §5 "Scheduler"),
// driven by a fake host: a manual clock, a manual animation-frame queue and
// manual timers. It pins the motion rule the film relies on: at most one frame or
// one timer is ever pending (checked after every call into the scheduler and
// every callback the host runs), only an act requests frames, a hold sleeps on
// one timer, and every way of not running — frozen, halted, resting, parked,
// disposed — leaves nothing pending whatever wakes it. tests/e2e/estate.spec
// counts the page's frames at rest, so a stray request here is a red e2e there.

// ---- the fake host ------------------------------------------------------------------------------

class FakeHost implements SchedulerHost {
  t = 0;
  private seq = 0;
  readonly frames = new Map<number, (ts: number) => void>();
  readonly timers = new Map<number, { cb: () => void; at: number; ms: number }>();
  framesRequested = 0;
  timersSet = 0;
  /** Requests made while another frame or timer was still pending. */
  overlaps = 0;
  /** Runs after every callback the host fires. */
  after: () => void = () => {};

  now = () => this.t;

  requestFrame = (cb: (ts: number) => void) => {
    if (this.pending) this.overlaps += 1;
    const id = ++this.seq;
    this.frames.set(id, cb);
    this.framesRequested += 1;
    return id;
  };

  cancelFrame = (id: number) => { this.frames.delete(id); };

  setTimer = (cb: () => void, ms: number) => {
    if (this.pending) this.overlaps += 1;
    const id = ++this.seq;
    this.timers.set(id, { cb, at: this.t + ms, ms });
    this.timersSet += 1;
    return id;
  };

  clearTimer = (id: number) => { this.timers.delete(id); };

  get pending() { return this.frames.size + this.timers.size; }

  /** The one pending timer's length, ms. */
  get timerMs() {
    expect(this.timers.size).toBe(1);
    return [...this.timers.values()][0].ms;
  }

  /** The next animation frame, dt ms from now. */
  frame(dt = 1000 / 60) {
    expect(this.frames.size, 'a frame was run with none requested').toBe(1);
    this.t += dt;
    const [[id, cb]] = [...this.frames];
    this.frames.delete(id);
    cb(this.t);
    this.after();
  }

  /** The pending timer, at its due time. */
  fire() {
    expect(this.timers.size, 'a timer was fired with none set').toBe(1);
    const [[id, timer]] = [...this.timers];
    this.t = Math.max(this.t, timer.at);
    this.timers.delete(id);
    timer.cb();
    this.after();
  }

  /** Time passes with nothing scheduled: the browser runs nothing. */
  sleep(ms: number) {
    expect(this.pending, 'time passed with a frame or timer pending').toBe(0);
    this.t += ms;
  }
}

// ---- a rig: the scheduler, a film of steps, and the invariant checked after every call ----------

type Spec = readonly ['act' | 'hold', string, number];
interface Draw { id: string; ms: number; t: number }

/** Act A, hold H, act B, hold K, act C: then done. */
const FILM: readonly Spec[] = [['act', 'A', 1000], ['hold', 'H', 5000], ['act', 'B', 800], ['hold', 'K', 3000], ['act', 'C', 600]];

const rig = (specs: readonly Spec[] = FILM, { loop = false, restAfter = Number.POSITIVE_INFINITY } = {}) => {
  const host = new FakeHost();
  const draws: Draw[] = [];
  const phases: SchedulePhase[] = [];
  let at = 0;
  const steps: Step[] = specs.map(([kind, id, ms]) => (kind === 'act'
    ? { kind, id, ms, draw: (d: number) => { draws.push({ id, ms: d, t: host.t }); } }
    : { kind, id, ms }));
  const next = (): Step | null => {
    if (at >= steps.length) {
      if (!loop) return null;
      at = 0;
    }
    return steps[at++];
  };
  const raw = new Scheduler(host, next, (phase) => phases.push(phase), restAfter);
  let disposed = false;
  const check = () => {
    expect(host.pending, 'two frames or timers pending').toBeLessThanOrEqual(1);
    expect(host.overlaps, 'a request made while another was pending').toBe(0);
    expect(raw.pending, 'the scheduler’s bookkeeping disagrees with the host').toBe(host.pending);
    if (disposed) { expect(host.pending, 'pending after dispose').toBe(0); return; }
    if (!raw.isRunning || ['idle', 'still', 'rest', 'park', 'done'].includes(raw.phase)) {
      expect(host.pending, `pending while ${raw.isRunning ? raw.phase : 'not running'}`).toBe(0);
    }
    if (raw.isRunning && raw.phase === 'act') {
      expect(host.frames.size).toBe(1);
      expect(host.timers.size).toBe(0);
    }
    if (raw.isRunning && raw.phase === 'hold') {
      expect(host.timers.size).toBe(1);
      expect(host.frames.size).toBe(0);
    }
  };
  host.after = check;
  // Every call into the scheduler is followed by the invariant check.
  const s = new Proxy(raw, {
    get(target, key) {
      const value = Reflect.get(target, key) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const out = (value as (...a: unknown[]) => unknown).apply(target, args);
        if (key === 'dispose') disposed = true;
        check();
        return out;
      };
    },
  });
  /** Frames until the current act ends (the scheduler moves to its next step). */
  const playAct = (dt = 1000 / 60) => {
    const step = raw.step;
    expect(step?.kind).toBe('act');
    while (raw.step === step && host.frames.size) host.frame(dt);
  };
  /** Run to done (or `limit` callbacks). */
  const runOut = (dt = 1000 / 60, limit = 1e6) => {
    for (let i = 0; i < limit && host.pending; i += 1) {
      if (host.frames.size) host.frame(dt);
      else host.fire();
    }
  };
  const drawsOf = (id: string) => draws.filter((d) => d.id === id).map((d) => d.ms);
  return { s, raw, host, draws, phases, playAct, runOut, drawsOf };
};

// ---- the clock --------------------------------------------------------------------------------

describe('drawing scheduler — acts on frames, holds on one timer', () => {
  it('plays a whole film with never more than one frame or timer pending, and ends with nothing pending', () => {
    const { s, host, phases, runOut } = rig();
    s.start(true);
    runOut();
    expect(s.phase).toBe('done');
    expect(host.pending).toBe(0);
    expect(host.overlaps).toBe(0);
    expect(host.timersSet).toBe(2); // one per hold, H and K
    expect(phases).toEqual(['act', 'hold', 'act', 'hold', 'act', 'done']);
  });

  it('draws an act’s progress on each frame, then its exact end: the last draw is ms === step.ms, never past it', () => {
    const { s, host, drawsOf, playAct } = rig();
    s.start(true);
    expect(drawsOf('A')).toEqual([]); // beginning an act draws nothing; the first frame does
    playAct(16);
    const a = drawsOf('A');
    // 16 ms frames: 62 in progress (16 … 992), then the frame at 1008 draws exactly 1000.
    expect(a).toEqual([...Array.from({ length: 62 }, (_, i) => 16 * (i + 1)), 1000]);
    expect(host.t).toBe(1008);
    expect(s.phase).toBe('hold');
    expect(host.frames.size).toBe(0);
  });

  it('holds on one timer of the hold’s full length and requests no frame meanwhile', () => {
    const { s, host, playAct, drawsOf } = rig();
    s.start(true);
    playAct();
    const frames = host.framesRequested;
    expect(s.step?.id).toBe('H');
    expect(host.timerMs).toBe(5000);
    host.fire();
    // Through the whole hold: no frame. Then B's first frame.
    expect(host.framesRequested).toBe(frames + 1);
    expect(s.step?.id).toBe('B');
    expect(s.phase).toBe('act');
    expect(drawsOf('B')).toEqual([]);
  });

  it('freezes an act in place and resumes from its stored progress (t0 = now − progress)', () => {
    const { s, host, drawsOf, playAct } = rig();
    s.start(true);
    for (let i = 0; i < 20; i += 1) host.frame(20); // A drawn to 400 ms
    expect(drawsOf('A').at(-1)).toBe(400);
    host.t += 10;
    s.freeze(); // 410 ms into A
    expect(s.phase).toBe('act');
    expect(s.isRunning).toBe(false);
    expect(host.pending).toBe(0);
    const drawn = drawsOf('A').length;
    host.sleep(60_000); // hidden for a minute: nothing runs, nothing is drawn
    expect(drawsOf('A')).toHaveLength(drawn);
    s.resume();
    expect(s.phase).toBe('act');
    host.frame(20);
    expect(drawsOf('A').at(-1)).toBe(430); // stored 410 + one 20 ms frame, not a minute later
    playAct(20);
    expect(drawsOf('A').at(-1)).toBe(1000);
    expect(drawsOf('A').filter((ms) => ms === 1000)).toHaveLength(1);
    expect(s.step?.id).toBe('H');
  });

  it('freezes a hold with its time left and resumes the rest of it', () => {
    const { s, host, playAct } = rig();
    s.start(true);
    playAct(10);
    const start = host.t;
    host.t += 2000;
    s.freeze();
    expect(host.pending).toBe(0);
    host.sleep(30_000);
    s.resume();
    expect(s.phase).toBe('hold');
    expect(host.timerMs).toBe(3000);
    host.fire();
    expect(s.step?.id).toBe('B');
    expect(host.t - start).toBe(2000 + 30_000 + 3000);
  });

  it('halts an act by painting its end state at once, then nothing; resume goes on to the next step', () => {
    const { s, host, draws, drawsOf } = rig();
    s.start(true);
    for (let i = 0; i < 20; i += 1) host.frame(20);
    const before = draws.length;
    const frames = host.framesRequested;
    s.halt();
    // One synchronous paint, of the end state, inside the halt call.
    expect(draws.length).toBe(before + 1);
    expect(draws.at(-1)).toEqual({ id: 'A', ms: 1000, t: 400 });
    expect(s.phase).toBe('still');
    expect(host.pending).toBe(0);
    host.sleep(600_000);
    expect(host.framesRequested).toBe(frames);
    s.resume();
    // The act is done: the film goes on with the hold, in full, and A is never drawn again.
    expect(s.step?.id).toBe('H');
    expect(s.phase).toBe('hold');
    expect(host.timerMs).toBe(5000);
    host.fire();
    expect(s.step?.id).toBe('B');
    expect(drawsOf('A').filter((ms) => ms === 1000)).toHaveLength(1);
    expect(drawsOf('A').filter((ms) => ms < 1000)).toHaveLength(20);
  });

  it('halts a hold without a paint, and on resume that hold starts in full', () => {
    const { s, host, draws, playAct } = rig();
    s.start(true);
    playAct(10);
    host.t += 3000;
    const before = draws.length;
    s.halt();
    expect(draws.length).toBe(before);
    expect(s.phase).toBe('still');
    expect(host.pending).toBe(0);
    s.resume();
    expect(s.step?.id).toBe('H');
    expect(host.timerMs).toBe(5000);
  });

  it('starting not running paints the first act’s end state and stays still with nothing pending', () => {
    const { s, host, draws } = rig();
    s.start(false);
    expect(draws).toEqual([{ id: 'A', ms: 1000, t: 0 }]);
    expect(s.phase).toBe('still');
    expect(s.isRunning).toBe(false);
    expect(host.pending).toBe(0);
    host.sleep(600_000);
    expect(host.framesRequested).toBe(0);
    expect(host.timersSet).toBe(0);
    expect(draws).toHaveLength(1);
  });

  it('starting not running on a hold paints nothing and stays still with nothing pending', () => {
    const { s, host, draws } = rig([['hold', 'H', 5000], ['act', 'A', 1000]]);
    s.start(false);
    expect(draws).toEqual([]);
    expect(s.phase).toBe('still');
    expect(host.pending).toBe(0);
    expect(host.timersSet).toBe(0);
  });

  it('finishes a running act on request: its end state now, then the next step', () => {
    const { s, host, drawsOf } = rig();
    s.start(true);
    for (let i = 0; i < 5; i += 1) host.frame(20);
    s.finishAct();
    expect(drawsOf('A').at(-1)).toBe(1000);
    expect(s.step?.id).toBe('H');
    expect(host.timerMs).toBe(5000);
  });

  it('restarts from the owner’s next step, cancelling what was pending', () => {
    const { s, host, drawsOf } = rig();
    s.start(true);
    for (let i = 0; i < 5; i += 1) host.frame(20);
    s.restart(); // next() gives H
    expect(s.step?.id).toBe('H');
    expect(host.timerMs).toBe(5000);
    s.restart(); // next() gives B, from 0
    expect(s.step?.id).toBe('B');
    host.frame(20);
    expect(drawsOf('B')).toEqual([20]);
  });
});

// ---- the matrix: every way of not running × every wake -----------------------------------------

describe('drawing scheduler — nothing wakes a film that may not run', () => {
  const ways = ['freeze', 'halt'] as const;
  const wakes = ['input', 'restart', 'finishAct'] as const;
  const states = ['mid-act', 'mid-hold'] as const;
  for (const state of states) {
    for (const way of ways) {
      for (const wake of wakes) {
        it(`${way} ${state}, then ${wake}(): no frame, no timer, at most one paint and only of an end state`, () => {
          const { s, raw, host, draws } = rig(FILM, { loop: true });
          s.start(true);
          if (state === 'mid-act') for (let i = 0; i < 10; i += 1) host.frame(20);
          else { while (raw.step?.id !== 'H') host.frame(20); host.t += 1000; }
          s[way]();
          const frames = host.framesRequested;
          const timers = host.timersSet;
          const before = draws.length;
          s[wake]();
          s[wake](); // twice: a repeated wake is no different
          expect(host.framesRequested).toBe(frames);
          expect(host.timersSet).toBe(timers);
          expect(host.pending).toBe(0);
          expect(s.isRunning).toBe(false);
          const painted = draws.slice(before);
          expect(painted.length).toBeLessThanOrEqual(wake === 'input' ? 0 : 2);
          // Each paint is an end state (restart paints the new act's, finishAct the current one's).
          const ms = Object.fromEntries(FILM.map(([, id, len]) => [id, len]));
          for (const d of painted) expect(d.ms).toBe(ms[d.id]);
          host.sleep(600_000);
        });
      }
    }
  }

  it('a single wake paints at most once', () => {
    for (const way of ways) {
      for (const wake of wakes) {
        const { s, host, draws } = rig(FILM, { loop: true });
        s.start(true);
        for (let i = 0; i < 10; i += 1) host.frame(20);
        s[way]();
        const before = draws.length;
        s[wake]();
        expect(draws.length - before, `${way} then ${wake}`).toBeLessThanOrEqual(1);
      }
    }
  });

  // finishAct's contract: "Jump the current act to its end and go on (a window
  // opened: the sheet must stand finished)". Frozen, it paints the end state and
  // stands still — but the act is not marked done (halt() swaps in an ':after'
  // hold for exactly this), so resume() replays it from the progress the freeze
  // stored, and the finished sheet goes back to a partial draw-in. SUSPECTED BUG
  // (lib/drawings/schedule.ts finishAct). Not reachable from drawingFilm.ts today,
  // which never calls finishAct.
  it('after freeze + finishAct, resume goes on to the next step instead of replaying the finished act', () => {
    const { s, host, drawsOf } = rig();
    s.start(true);
    for (let i = 0; i < 10; i += 1) host.frame(20);
    s.freeze();
    s.finishAct();
    expect(drawsOf('A').at(-1)).toBe(1000);
    s.resume();
    expect(s.step?.id).toBe('H');
    expect(host.frames.size).toBe(0);
  });
});

// ---- rest ---------------------------------------------------------------------------------------

describe('drawing scheduler — rest after the visitor’s last input', () => {
  it('rests after 240 s without input', () => {
    expect(REST_AFTER_MS).toBe(240_000);
  });

  it('rests at the end of the first hold ending ≥ restAfter after the last input: nothing pending, the sheet left up', () => {
    const { s, raw, host, phases, playAct } = rig([['act', 'A', 1000], ['hold', 'H', 100_000]], { loop: true, restAfter: REST_AFTER_MS });
    s.start(true);
    const holdEnds: number[] = [];
    while (raw.phase !== 'rest') {
      if (raw.phase === 'act') playAct(10);
      else { host.fire(); holdEnds.push(host.t); }
    }
    // Holds end at 101 s and 202 s (go on), then 303 s ≥ 240 s: rest.
    expect(holdEnds).toEqual([101_000, 202_000, 303_000]);
    expect(phases.at(-1)).toBe('rest');
    expect(host.pending).toBe(0);
    const frames = host.framesRequested;
    host.sleep(3_600_000);
    expect(host.framesRequested).toBe(frames);
    // Any input wakes it: the next step begins.
    s.input();
    expect(s.phase).toBe('act');
    expect(s.step?.id).toBe('A');
    expect(host.frames.size).toBe(1);
  });

  it('counts from the last input, and rests at exactly restAfter (≥, not >)', () => {
    const { s, raw, host, playAct } = rig([['act', 'A', 1000], ['hold', 'H', 9000]], { loop: true, restAfter: 10_000 });
    s.start(true);
    playAct(10); // t = 1000
    host.fire(); // t = 10,000: exactly restAfter after construction
    expect(raw.phase).toBe('rest');
    host.t += 1;
    s.input(); // t = 10,001: wakes
    playAct(10); // t = 11,001
    host.t += 500;
    s.input(); // an input during the hold, t = 11,501
    host.fire(); // t = 20,001: 8,500 after the input
    expect(raw.phase).toBe('act');
    playAct(10); // t = 21,001
    host.fire(); // t = 30,001: 18,500 after the input
    expect(raw.phase).toBe('rest');
  });

  it('a frozen rest stays at rest: input does not wake it until the film may run, and resume alone does not either', () => {
    const { s, raw, host, playAct } = rig([['act', 'A', 1000], ['hold', 'H', 9000]], { loop: true, restAfter: 10_000 });
    s.start(true);
    playAct(10);
    host.fire();
    expect(raw.phase).toBe('rest');
    s.freeze();
    s.input();
    expect(raw.phase).toBe('rest');
    expect(host.pending).toBe(0);
    s.resume();
    expect(raw.phase).toBe('rest');
    expect(host.pending).toBe(0);
    s.input();
    expect(raw.phase).toBe('act');
  });
});

// ---- park and dispose ---------------------------------------------------------------------------

describe('drawing scheduler — park and dispose', () => {
  it('parks: cancels what is pending, and nothing but unpark leaves it', () => {
    const { s, host, draws } = rig(FILM, { loop: true });
    s.start(true);
    for (let i = 0; i < 10; i += 1) host.frame(20);
    s.park();
    expect(s.phase).toBe('park');
    expect(host.pending).toBe(0);
    const frames = host.framesRequested;
    const timers = host.timersSet;
    const before = draws.length;
    s.input();
    s.resume();
    s.restart();
    s.freeze();
    s.resume();
    s.halt();
    s.resume();
    expect(s.phase).toBe('park');
    expect(host.framesRequested).toBe(frames);
    expect(host.timersSet).toBe(timers);
    expect(draws.length).toBe(before); // the owner cleared the canvas: nothing paints into it
    host.sleep(600_000);
  });

  it('unparks into the owner’s next step: an act on frames when running, its end state when not', () => {
    const running = rig(FILM, { loop: true });
    running.s.start(true);
    running.host.frame(20);
    running.s.park();
    running.s.unpark();
    expect(running.s.step?.id).toBe('H'); // next() moves on; the owner resets its own cursor
    expect(running.s.phase).toBe('hold');
    running.s.unpark(); // not parked: nothing
    expect(running.s.step?.id).toBe('H');

    const still = rig(FILM, { loop: true });
    still.s.start(true);
    still.host.frame(20);
    still.s.park();
    still.s.halt();
    still.s.restart(); // refused while parked
    expect(still.s.phase).toBe('park');
    still.s.unpark(); // H: a hold, still
    still.s.unpark();
    expect(still.s.phase).toBe('still');
    still.s.restart(); // B, not running: its end state, once
    expect(still.draws.at(-1)).toEqual({ id: 'B', ms: 800, t: still.host.t });
    expect(still.host.pending).toBe(0);
  });

  // park()'s contract: "No room: stop everything (the owner clears the canvas)";
  // restart, resume and unpark all refuse a parked film. finishAct does not: the
  // step is still the act, so it paints the act's end into the cleared canvas
  // and, running, advance()s out of 'park' into the next step (here hold H's
  // timer; a frame when the next step is an act).
  // SUSPECTED BUG (lib/drawings/schedule.ts finishAct has no park guard). Not
  // reachable from drawingFilm.ts today, which never calls finishAct.
  it('a parked film stays parked through finishAct()', () => {
    const { s, raw, host } = rig(FILM, { loop: true });
    s.start(true);
    for (let i = 0; i < 10; i += 1) host.frame(20);
    s.park();
    // Called on the raw scheduler so the result, not the invariant check, is what fails.
    raw.finishAct();
    expect(raw.phase).toBe('park');
    expect(host.pending).toBe(0);
  });

  it('dispose cancels the pending frame or timer, and nothing afterwards requests one', () => {
    for (const where of ['act', 'hold'] as const) {
      const { s, raw, host } = rig(FILM, { loop: true });
      s.start(true);
      if (where === 'hold') { while (raw.phase !== 'hold') host.frame(20); }
      else host.frame(20);
      // A callback the browser had already queued still arrives after dispose.
      const stale = where === 'act' ? [...host.frames.values()][0] : [...host.timers.values()][0].cb;
      s.dispose();
      expect(host.pending).toBe(0);
      const frames = host.framesRequested;
      const timers = host.timersSet;
      (stale as (ts?: number) => void)(host.t + 16);
      s.resume();
      s.restart();
      s.input();
      s.unpark();
      s.park();
      s.unpark();
      s.start(true);
      s.freeze();
      s.resume();
      s.halt();
      s.resume();
      s.finishAct();
      expect(host.framesRequested, where).toBe(frames);
      expect(host.timersSet, where).toBe(timers);
      expect(host.pending).toBe(0);
    }
  });

  // dispose() leaves every other entry point inert (advance, beginAct, tick,
  // holdDone, resume and restart all check `disposed`), but halt() and finishAct()
  // do not check it and still call the act's draw — a paint into caches the film
  // released at teardown. SUSPECTED BUG (minor; lib/drawings/schedule.ts halt and
  // finishAct). drawingFilm.ts guards its own calls with its `disposed` flag, so
  // it is not reachable from the film today.
  it('a disposed scheduler paints nothing, whatever is called', () => {
    const { s, raw, host, draws } = rig();
    s.start(true);
    host.frame(20);
    s.dispose();
    const before = draws.length;
    raw.finishAct(); // draws A's end
    raw.halt(); // and again
    expect(draws.length).toBe(before);
  });
});

// ---- a real cycle -------------------------------------------------------------------------------

describe('drawing scheduler — a whole BLK_501 desk cycle', () => {
  const site = SITES.find((x) => x.id === 'BLK_501')!;
  const typ = decodeSheet(site, BLK_501_SHEETS.find((x) => x.key === 'TYP')!);
  const l1 = decodeSheet(site, BLK_501_SHEETS.find((x) => x.key === 'L1')!);
  // The facts as drawingFilm.ts factsFor() reads them (BLK_501's axonometric is readable: not plans-only).
  const facts: CycleFacts = {
    typicalRooms: typ.rooms.length,
    typicalCount: [...site.plan].filter((c) => c === String(site.sheets.indexOf('TYP'))).length,
    l1Risers: Math.max(0, ...l1.flights.map((f) => f.risers)),
    plansOnly: false,
  };
  const shots = deskCycle(site, facts);

  /** The shots as steps, the way drawingFilm.ts turns them: arrive (act), hold, exit (act). */
  const stepsOf = (list: readonly Shot[]): Spec[] => list.flatMap((shot): Spec[] => [
    ...(shot.arrive > 0 ? [['act', `${shot.id}:arrive`, shot.arrive] as const] : []),
    ...(shot.hold > 0 ? [['hold', `${shot.id}:hold`, shot.hold] as const] : []),
    ...(shot.exit > 0 ? [['act', `${shot.id}:exit`, shot.exit] as const] : []),
  ]);

  const drive = (dt: number) => {
    const specs = stepsOf(shots);
    const r = rig(specs);
    const frameIn = new Map<string, number>();
    const timerIn = new Map<string, number>();
    const offPhase: string[] = [];
    r.s.start(true);
    const t0 = r.host.t;
    while (r.host.pending) {
      const step = r.raw.step!;
      if (r.host.frames.size) {
        // Every frame the host runs was requested by an act, while it plays.
        if (step.kind !== 'act' || r.raw.phase !== 'act') offPhase.push(`frame in ${step.id} (${r.raw.phase})`);
        frameIn.set(step.id, (frameIn.get(step.id) ?? 0) + 1);
        r.host.frame(dt);
      } else {
        if (step.kind !== 'hold' || r.raw.phase !== 'hold') offPhase.push(`timer in ${step.id} (${r.raw.phase})`);
        timerIn.set(step.id, (timerIn.get(step.id) ?? 0) + 1);
        r.host.fire();
      }
    }
    return { ...r, specs, frameIn, timerIn, offPhase, elapsed: r.host.t - t0 };
  };

  it('is the 86,360 ms cycle of the sequence, from BLK_501’s own sheets (48 typical rooms, 19 typical storeys)', () => {
    expect(facts.typicalRooms).toBe(48);
    expect(facts.typicalCount).toBe(19);
    expect(cycleMs(shots)).toBe(86_360);
    expect(dutyCycle(shots)).toBeLessThanOrEqual(0.30);
  });

  it('requests frames only during acts, sets one timer per hold, and lasts exactly cycleMs on a 10 ms frame', () => {
    const { s, host, specs, frameIn, timerIn, offPhase, elapsed, drawsOf } = drive(10);
    expect(s.phase).toBe('done');
    expect(offPhase).toEqual([]);
    expect(host.overlaps).toBe(0);
    for (const [kind, id, ms] of specs) {
      if (kind === 'act') {
        expect(frameIn.get(id), id).toBe(ms / 10); // every act's ms is a multiple of 10
        expect(timerIn.get(id), id).toBeUndefined();
        expect(drawsOf(id).at(-1), id).toBe(ms);
        expect(drawsOf(id).filter((d) => d === ms), id).toHaveLength(1);
      } else {
        expect(frameIn.get(id), id).toBeUndefined(); // a hold requests 0 frames
        expect(timerIn.get(id), id).toBe(1);
      }
    }
    const actMs = specs.filter(([kind]) => kind === 'act').reduce((sum, [, , ms]) => sum + ms, 0);
    expect(host.framesRequested).toBe(actMs / 10);
    expect(host.timersSet).toBe(specs.filter(([kind]) => kind === 'hold').length);
    expect(elapsed).toBe(cycleMs(shots));
    expect(actMs / elapsed).toBeCloseTo(dutyCycle(shots), 12);
  });

  it('on a 17 ms frame too: frames only during acts, and each act overshoots its length by less than a frame', () => {
    const dt = 17;
    const { specs, frameIn, timerIn, offPhase, elapsed, drawsOf } = drive(dt);
    expect(offPhase).toEqual([]);
    const acts = specs.filter(([kind]) => kind === 'act');
    for (const [, id, ms] of acts) {
      expect(frameIn.get(id), id).toBe(Math.ceil(ms / dt));
      expect(drawsOf(id).at(-1), id).toBe(ms);
    }
    for (const [kind, id] of specs) if (kind === 'hold') expect(frameIn.get(id), id).toBeUndefined();
    expect([...timerIn.values()].every((n) => n === 1)).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(cycleMs(shots));
    expect(elapsed).toBeLessThan(cycleMs(shots) + acts.length * dt);
  });
});
