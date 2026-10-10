import { REST_AFTER_MS } from './effects';

// The drawing set's clock (docs/portfolio/desk-drawing-set.md §5 "Scheduler"). A
// film is a chain of steps: acts, which animate and are the only thing that ever
// requests an animation frame, and holds, which sleep on one timer. At most one
// frame or one timer is pending at any time, and none at rest (CLAUDE.md's motion
// rule: loops sleep when idle; tests/e2e/estate.spec counts every frame).
//
// What stops it, and how it comes back:
//  - freeze (the page is hidden, the Estate window holds the GPU): cancel, keep
//    the pixels and the progress; resume where it stood.
//  - halt (motion paused or reduced, or an N-body or smoke field animating):
//    the act jumps to its end state in one synchronous paint, then nothing; on
//    resume the next step (a hold) starts in full.
//  - rest: a hold that ends four minutes after the visitor's last input leaves
//    the finished sheet up and schedules nothing; any input wakes it.
//  - park: no room on the desk; the film's owner clears the canvas.
// Pure: the clock, frames and timers are injected (tests/drawing-schedule.test.ts
// drives it with a fake host).

export interface SchedulerHost {
  now(): number;
  requestFrame(cb: (ts: number) => void): number;
  cancelFrame(id: number): void;
  setTimer(cb: () => void, ms: number): number;
  clearTimer(id: number): void;
}

export type Step =
  | { kind: 'act'; id: string; ms: number; draw: (ms: number) => void }
  | { kind: 'hold'; id: string; ms: number };

export type SchedulePhase = 'idle' | 'act' | 'hold' | 'still' | 'rest' | 'park' | 'done';

export class Scheduler {
  phase: SchedulePhase = 'idle';
  step: Step | null = null;
  private running = false;
  /** Into the current act, ms (kept across a freeze). */
  private progress = 0;
  private t0 = 0;
  private holdLeft = 0;
  private holdStart = 0;
  private frameId: number | null = null;
  private timerId: number | null = null;
  private lastInput: number;
  private disposed = false;

  constructor(
    private readonly host: SchedulerHost,
    private readonly next: () => Step | null,
    private readonly onChange: (phase: SchedulePhase, step: Step | null) => void = () => {},
    private readonly restAfter = REST_AFTER_MS,
  ) {
    this.lastInput = host.now();
  }

  /** Frames or timers pending: 0 or 1, never 2. */
  get pending(): number {
    return (this.frameId === null ? 0 : 1) + (this.timerId === null ? 0 : 1);
  }

  get isRunning(): boolean {
    return this.running;
  }

  private set(phase: SchedulePhase) {
    this.phase = phase;
    this.onChange(phase, this.step);
  }

  private cancel() {
    if (this.frameId !== null) { this.host.cancelFrame(this.frameId); this.frameId = null; }
    if (this.timerId !== null) { this.host.clearTimer(this.timerId); this.timerId = null; }
  }

  /** Begin: the first step, painted at once if it is an act and the film may not run. */
  start(running: boolean) {
    this.running = running;
    if (this.phase === 'idle') this.advance();
  }

  private advance() {
    if (this.disposed) return;
    this.cancel();
    this.step = this.next();
    this.progress = 0;
    if (!this.step) { this.set('done'); return; }
    if (this.step.kind === 'act') {
      if (this.running) this.beginAct();
      else {
        // A film that may not move shows the act's end state, and stops there.
        this.step.draw(this.step.ms);
        this.set('still');
      }
    } else {
      this.holdLeft = this.step.ms;
      if (this.running) this.beginHold();
      else this.set('still');
    }
  }

  /** The only place a frame is ever requested. */
  private beginAct() {
    const step = this.step;
    if (!step || step.kind !== 'act' || !this.running || this.disposed) return;
    this.cancel();
    this.t0 = this.host.now() - this.progress;
    this.set('act');
    this.frameId = this.host.requestFrame(this.tick);
  }

  private tick = () => {
    this.frameId = null;
    const step = this.step;
    if (!step || step.kind !== 'act' || !this.running || this.disposed) return;
    const t = this.host.now() - this.t0;
    if (t >= step.ms) {
      step.draw(step.ms);
      this.advance();
      return;
    }
    this.progress = t;
    step.draw(t);
    this.frameId = this.host.requestFrame(this.tick);
  };

  private beginHold() {
    if (!this.running || this.disposed) return;
    this.cancel();
    this.holdStart = this.host.now();
    this.set('hold');
    this.timerId = this.host.setTimer(this.holdDone, Math.max(0, this.holdLeft));
  }

  private holdDone = () => {
    this.timerId = null;
    if (this.disposed) return;
    if (this.host.now() - this.lastInput >= this.restAfter) {
      this.holdLeft = 0;
      this.set('rest');
      return;
    }
    this.advance();
  };

  /** Freeze in place (hidden, yielded): pixels and progress kept. */
  freeze() {
    if (!this.running) return;
    this.running = false;
    if (this.phase === 'act') this.progress = Math.min(this.host.now() - this.t0, this.step?.ms ?? 0);
    if (this.phase === 'hold') this.holdLeft = Math.max(0, this.holdLeft - (this.host.now() - this.holdStart));
    this.cancel();
  }

  /** Halt (motion halted, an FX field animating): the act's end state now, then still. */
  halt() {
    if (this.disposed) return;
    this.running = false;
    this.cancel();
    if (this.step?.kind === 'act' && (this.phase === 'act' || this.phase === 'still')) {
      this.step.draw(this.step.ms);
      // The act is done; on resume the film goes on with the next step.
      this.step = { kind: 'hold', id: `${this.step.id}:after`, ms: 0 };
      this.holdLeft = 0;
    } else if (this.step?.kind === 'hold') {
      this.holdLeft = this.step.ms;
    }
    if (this.phase !== 'park' && this.phase !== 'done') this.set('still');
  }

  /** Allowed to run again: resume a frozen act or hold, or go on from a still. */
  resume() {
    if (this.disposed || this.running) return;
    this.running = true;
    if (this.phase === 'park' || this.phase === 'rest' || this.phase === 'done') return;
    if (this.phase === 'idle') { this.advance(); return; }
    if (this.step?.kind === 'act') this.beginAct();
    else if (this.step?.kind === 'hold') {
      if (this.phase === 'still' && this.holdLeft === 0) this.advance();
      else this.beginHold();
    } else this.advance();
  }

  /** The visitor did something: the rest clock restarts, and a rested film wakes. */
  input() {
    this.lastInput = this.host.now();
    if (this.phase === 'rest' && this.running) this.advance();
  }

  /** Jump the current act to its end and go on (a window opened: the sheet must stand finished). */
  finishAct() {
    if (this.disposed || this.phase === 'park' || this.step?.kind !== 'act') return;
    this.cancel();
    this.step.draw(this.step.ms);
    if (this.running) { this.advance(); return; }
    // Not running: the act is done all the same, so a later resume goes on to the next step.
    this.step = { kind: 'hold', id: `${this.step.id}:after`, ms: 0 };
    this.holdLeft = 0;
    this.set('still');
  }

  /** Start over from the owner's next step (a new place, a new way of watching). */
  restart() {
    if (this.disposed || this.phase === 'park') return;
    this.cancel();
    this.step = null;
    this.advance();
  }

  /** No room: stop everything (the owner clears the canvas). */
  park() {
    this.cancel();
    this.set('park');
  }

  /** Room again: start over from the owner's next step. */
  unpark() {
    if (this.phase !== 'park') return;
    this.set('idle');
    this.advance();
  }

  dispose() {
    this.disposed = true;
    this.cancel();
  }
}
