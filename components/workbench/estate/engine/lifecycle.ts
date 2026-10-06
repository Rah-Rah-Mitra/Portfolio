import type { EstateEngineEvent } from '../engineApi';

// The engine's lifecycle core (plan §7.10): who may emit, the context-loss
// listeners, and the ordered teardown. No three and no DOM beyond EventTarget,
// so tests/estate-engine-dispose.test.ts drives it with a fake canvas whose
// loseContext() fires webglcontextlost synchronously, as some browsers do.
//
// The rule it exists for: dispose() is silent. The shell disposes in reaction
// to events (error, stale, unavailable) and on release; a `lost` fired by the
// engine's own forceContextLoss() during that teardown would reach a shell that
// already moved on and count as a GPU reset. So the order is: mark disposing,
// take the engine's own context listeners off, clear timers, dispose the
// renderer and force the loss, remove the canvas, release the decoder workers,
// abort downloads — and the emitter refuses everything from the first step.

type Listener = (event: EstateEngineEvent) => void;
type Payload = EstateEngineEvent extends infer E ? E extends EstateEngineEvent ? Omit<E, 'token'> : never : never;

/**
 * Stamps the instance token and delivers to the shell's onEvent, then to
 * subscribers. Closed by dispose(): nothing is delivered afterwards, even an
 * event already being delivered when a listener disposes (later listeners in
 * that round are skipped).
 */
export class EngineEmitter {
  readonly token: number;
  private readonly primary: Listener;
  private readonly listeners = new Set<Listener>();
  private closed = false;

  constructor(token: number, primary: Listener) {
    this.token = token;
    this.primary = primary;
  }

  get isClosed(): boolean { return this.closed; }

  emit(payload: Payload): void {
    if (this.closed) return;
    const event = { ...payload, token: this.token } as EstateEngineEvent;
    try {
      this.primary(event);
    } catch (error) {
      reportListenerError(error);
    }
    for (const listener of [...this.listeners]) {
      if (this.closed) return;
      try {
        listener(event);
      } catch (error) {
        reportListenerError(error);
      }
    }
  }

  subscribe(listener: Listener): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }
}

// A listener's exception must not break the engine's own bookkeeping; it is
// surfaced on the console (asynchronously, like an uncaught error) instead.
const reportListenerError = (error: unknown) => {
  setTimeout(() => { throw error; }, 0);
};

export interface ContextWatchHooks {
  /** webglcontextlost, default already prevented. */
  lost(): void;
  restored(): void;
}

/**
 * The engine's own webglcontextlost / webglcontextrestored listeners. three's
 * renderer adds its own on the same canvas (it prevents the default too, which
 * is what lets the browser restore); these only tell the engine.
 */
export class ContextWatch {
  private readonly target: EventTarget;
  private readonly hooks: ContextWatchHooks;
  private attached = false;

  constructor(target: EventTarget, hooks: ContextWatchHooks) {
    this.target = target;
    this.hooks = hooks;
  }

  private readonly onLost = (event: Event) => {
    event.preventDefault();
    this.hooks.lost();
  };

  private readonly onRestored = () => {
    this.hooks.restored();
  };

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.target.addEventListener('webglcontextlost', this.onLost, false);
    this.target.addEventListener('webglcontextrestored', this.onRestored, false);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.target.removeEventListener('webglcontextlost', this.onLost, false);
    this.target.removeEventListener('webglcontextrestored', this.onRestored, false);
  }
}

/** Every timeout the engine arms, so teardown can clear them all in one step. */
export class TimerSet {
  private readonly ids = new Set<ReturnType<typeof setTimeout>>();

  after(ms: number, run: () => void): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      this.ids.delete(id);
      run();
    }, ms);
    this.ids.add(id);
    return id;
  }

  cancel(id: ReturnType<typeof setTimeout> | null | undefined): void {
    if (id === null || id === undefined) return;
    clearTimeout(id);
    this.ids.delete(id);
  }

  clear(): void {
    for (const id of this.ids) clearTimeout(id);
    this.ids.clear();
  }

  get size(): number { return this.ids.size; }
}

/** The §7.10 teardown, step by step; each step optional, each isolated from the others' failures. */
export interface TeardownSteps {
  /** 1. disposing = true: close the emitter and stop the frame loop. */
  close: () => void;
  /** 2. Remove the engine's own webglcontextlost / -restored listeners. */
  detachContextListeners?: () => void;
  /** 3. Clear every timer (retries, resize debounce, readouts). */
  clearTimers?: () => void;
  /** 4a. renderer.dispose(). */
  disposeRenderer?: () => void;
  /** 4b. renderer.forceContextLoss(): may fire webglcontextlost synchronously. */
  loseContext?: () => void;
  /** 5. Remove the canvas from the stage. */
  removeCanvas?: () => void;
  /** 6. Release the meshopt decoder workers. */
  releaseWorkers?: () => void;
  /** 7. Abort every download still in flight. */
  abortDownloads?: () => void;
}

/** The order the steps run in; exported so the test can pin it. */
export const TEARDOWN_ORDER = [
  'close', 'detachContextListeners', 'clearTimers', 'disposeRenderer', 'loseContext', 'removeCanvas', 'releaseWorkers', 'abortDownloads',
] as const satisfies ReadonlyArray<keyof TeardownSteps>;

/**
 * Runs the steps in TEARDOWN_ORDER. A step that throws (a renderer already
 * half gone, a canvas detached by React first) is reported and the rest still
 * run: a teardown that stops halfway leaks a GPU context.
 */
export const runTeardown = (steps: TeardownSteps): void => {
  for (const name of TEARDOWN_ORDER) {
    const step = steps[name];
    if (!step) continue;
    try {
      step();
    } catch (error) {
      reportListenerError(error);
    }
  }
};
