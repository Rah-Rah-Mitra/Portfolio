import type { PortfolioWorldEvent, SceneControlOwner, SceneId } from '../types';

export type InteractionArbitratorState = 'idle' | 'primed' | 'dragging' | 'exploring';

export type PointerIntent = {
  pointerId: number;
  x: number;
  y: number;
};

export type ArbitrationResult = {
  state: InteractionArbitratorState;
  capturePointer: boolean;
  preventDefault: boolean;
  owner?: SceneControlOwner;
};

export type KeyboardInteractionIntent = {
  delta: number;
  axis: 'x' | 'y';
  preventDefault: true;
};

type EventSink = (event: PortfolioWorldEvent) => void;

const idleResult = (): ArbitrationResult => ({
  state: 'idle',
  capturePointer: false,
  preventDefault: false,
  owner: 'story',
});

/**
 * Framework-independent intent arbitration for exhibits. Calling code remains
 * responsible for invoking pointer capture/preventDefault only when instructed.
 */
export class InteractionArbitrator {
  state: InteractionArbitratorState = 'idle';

  owner: SceneControlOwner = 'story';

  private activePointer: PointerIntent | null = null;

  private sceneId: SceneId | null = null;

  constructor(private readonly emit?: EventSink, private readonly threshold = 8) {}

  pointerDown(pointer: PointerIntent, sceneId: SceneId): ArbitrationResult {
    if (this.activePointer || this.state === 'exploring') return this.currentResult();
    this.activePointer = pointer;
    this.sceneId = sceneId;
    this.state = 'primed';
    this.owner = 'story';
    this.emit?.({ type: 'INTERACTION_PRIMED', sceneId, source: 'visitor' });
    return { state: this.state, capturePointer: false, preventDefault: false };
  }

  pointerMove(pointer: PointerIntent): ArbitrationResult {
    if (!this.activePointer || pointer.pointerId !== this.activePointer.pointerId || this.state === 'exploring') {
      return this.currentResult();
    }
    const distance = Math.hypot(pointer.x - this.activePointer.x, pointer.y - this.activePointer.y);
    if (this.state === 'primed' && distance >= this.threshold) {
      this.state = 'dragging';
      this.owner = 'visitor';
    }
    return {
      state: this.state,
      capturePointer: this.state === 'dragging',
      preventDefault: this.state === 'dragging',
    };
  }

  pointerUp(pointerId?: number): ArbitrationResult {
    if (!this.activePointer || (pointerId !== undefined && pointerId !== this.activePointer.pointerId)) return this.currentResult();
    return this.release();
  }

  pointerCancel(pointerId?: number): ArbitrationResult {
    if (!this.activePointer || (pointerId !== undefined && pointerId !== this.activePointer.pointerId)) return this.currentResult();
    return this.release();
  }

  scrollOut(): ArbitrationResult {
    return this.release();
  }

  focusLost(): ArbitrationResult {
    return this.release();
  }

  reset(): ArbitrationResult {
    if (this.sceneId) this.emit?.({ type: 'INTERACTION_RESET', sceneId: this.sceneId, source: 'visitor' });
    return this.release();
  }

  escape(): ArbitrationResult {
    const exitingExplore = this.state === 'exploring';
    const sceneId = this.sceneId;
    const result = this.release();
    if (exitingExplore && sceneId) this.emit?.({ type: 'EXPLORE_EXITED', sceneId, source: 'visitor' });
    return result;
  }

  enterExplore(sceneId: SceneId): ArbitrationResult {
    this.sceneId = sceneId;
    this.activePointer = null;
    this.state = 'exploring';
    this.owner = 'visitor';
    this.emit?.({ type: 'EXPLORE_ENTERED', sceneId, source: 'visitor' });
    return { state: this.state, capturePointer: false, preventDefault: false, owner: this.owner };
  }

  keyboardIntent(key: string, coarse: boolean): KeyboardInteractionIntent | null {
    const amount = coarse ? 10 : 1;
    if (key === 'ArrowLeft') return { delta: -amount, axis: 'x', preventDefault: true };
    if (key === 'ArrowRight') return { delta: amount, axis: 'x', preventDefault: true };
    if (key === 'ArrowUp') return { delta: -amount, axis: 'y', preventDefault: true };
    if (key === 'ArrowDown') return { delta: amount, axis: 'y', preventDefault: true };
    return null;
  }

  private release(): ArbitrationResult {
    this.activePointer = null;
    this.sceneId = null;
    this.state = 'idle';
    this.owner = 'story';
    return idleResult();
  }

  private currentResult(): ArbitrationResult {
    return {
      state: this.state,
      capturePointer: false,
      preventDefault: false,
      owner: this.owner,
    };
  }
}
