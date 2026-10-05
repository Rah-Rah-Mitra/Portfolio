import {
  calibrateDisplay, createGovernor, governorNotch, governorSample,
  type GovernorDecision, type GovernorNotch, type GovernorState,
} from '../../../../lib/estate/governorCore';
import type { EstateTier } from '../../../../lib/estate/tiers';
import type { GpuTimer } from './renderer';

// Automatic quality control, the engine side (plan §7.9). governorCore.ts holds
// every rule; this feeds it one sample per continuously drawn frame — the rAF
// interval, CPU time around update and render, GPU time where timer queries
// report — and says when the notch moved. Frames that uploaded, compiled or
// followed a resize are marked excluded and move nothing.

export interface GovernorChange {
  decision: GovernorDecision;
  notch: GovernorNotch;
}

export class EngineGovernor {
  readonly state: GovernorState;
  private readonly timer: GpuTimer | null;
  private lastTime = Number.NaN;
  private timing = false;

  constructor(tier: EstateTier, pixelRatio: number, timer: GpuTimer | null) {
    this.state = createGovernor({ tier, pixelRatio });
    this.timer = timer;
  }

  get notch(): GovernorNotch { return governorNotch(this.state); }

  /** Start GPU timing for this frame (only frames that follow another are sampled). */
  beginGpu(continuous: boolean): void {
    this.timing = continuous && this.timer !== null;
    if (this.timing) this.timer?.begin();
  }

  endGpu(): void {
    if (this.timing) this.timer?.end();
    this.timing = false;
  }

  /**
   * One drawn frame. `time` is the rAF timestamp; only a continuous frame (one
   * that directly follows another, frameLoop's beginFrame) is a sample, the
   * first after a rest carries the rest in its interval. Returns the change, or
   * null when the notch held.
   */
  sample(time: number, continuous: boolean, cpuMs: number, excluded: boolean): GovernorChange | null {
    const interval = time - this.lastTime;
    this.lastTime = time;
    if (!continuous) return null;
    const gpuMs = this.timer ? this.timer.poll() : Number.NaN;
    const decision = governorSample(this.state, { interval, cpuMs, gpuMs, excluded });
    return decision === 'hold' ? null : { decision, notch: governorNotch(this.state) };
  }

  /** The governor asks for a calibration burst (a slow spell it cannot place). */
  get wantsCalibration(): boolean { return this.state.recalibrate; }

  calibrate(intervals: readonly number[]): number {
    // The burst's own frames are not samples; the next frame starts afresh.
    this.lastTime = Number.NaN;
    return calibrateDisplay(this.state, intervals);
  }

  /** The last closed window's figures, for the debug readout. NaN until a window closes. */
  get debug(): { droppedPct: number; cpuP95Ms: number; gpuP95Ms: number } {
    const s = this.state;
    return { droppedPct: s.lastDropShare * 100, cpuP95Ms: s.lastCpuP95, gpuP95Ms: s.lastGpuP95 };
  }

  /** A rest or a stop: the next frame's interval is not a sample. */
  rest(): void {
    this.lastTime = Number.NaN;
  }
}
