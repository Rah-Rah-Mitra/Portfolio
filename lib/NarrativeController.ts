import type { PortfolioWorldEvent, QualityTier, SceneControlOwner, SceneId } from '../types';

export interface NarrativeState {
  activeChapterId: string;
  normalizedProgress: number;
  direction: 'forward' | 'reverse';
  velocityPxPerSecond: number;
  cameraShotId: string;
  characterPoseId: string;
  controlOwner: SceneControlOwner;
  exploreSceneId: SceneId | null;
  reaction: { id: string; priority: number } | null;
  qualityTier: QualityTier;
}

type Listener = (state: Readonly<NarrativeState>) => void;

const eventReaction = (event: PortfolioWorldEvent): { id: string; priority: number } => {
  switch (event.type) {
    case 'QUALITY_CHANGED': return { id: 'quality-change', priority: 100 };
    case 'LAB_RESET': case 'INTERACTION_RESET': return { id: 'reset', priority: 100 };
    case 'CAMERA_CALIBRATED': return { id: event.reprojectionError < 1 ? 'calibration-success' : 'calibration-puzzled', priority: 60 };
    case 'STEREO_POINT_TRIANGULATED': return { id: event.depthError < 0.25 ? 'stereo-success' : 'stereo-puzzled', priority: 60 };
    case 'PROJECT_OPENED': return { id: 'inspect-project', priority: 50 };
    case 'JOB_REORDERED': return { id: 'point-bottleneck', priority: 50 };
    case 'MAP_MARKER_MOVED': return { id: 'inspect-marker', priority: 50 };
    case 'EXPLORE_ENTERED': case 'EXPLORE_EXITED': return { id: 'ownership-change', priority: 100 };
    default: return { id: 'ambient-look', priority: 10 };
  }
};

export class NarrativeController {
  private state: NarrativeState;
  private listeners = new Set<Listener>();
  private destroyed = false;
  private storyPoseId: string;
  private storyShotId: string;
  private reactionTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly reactionDurationMs: number;

  constructor(initial: { chapterId: string; cameraShotId: string; characterPoseId: string; qualityTier?: QualityTier; reactionDurationMs?: number }) {
    this.storyPoseId = initial.characterPoseId;
    this.storyShotId = initial.cameraShotId;
    this.reactionDurationMs = initial.reactionDurationMs ?? 900;
    this.state = { activeChapterId: initial.chapterId, normalizedProgress: 0, direction: 'forward', velocityPxPerSecond: 0, cameraShotId: initial.cameraShotId, characterPoseId: initial.characterPoseId, controlOwner: 'story', exploreSceneId: null, reaction: null, qualityTier: initial.qualityTier ?? 'full' };
  }

  getState = (): Readonly<NarrativeState> => ({ ...this.state });
  subscribe = (listener: Listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private notify() { if (!this.destroyed) this.listeners.forEach((listener) => listener(this.getState())); }
  private scheduleReactionClear() {
    if (this.reactionTimer) clearTimeout(this.reactionTimer);
    this.reactionTimer = setTimeout(() => { this.reactionTimer = null; this.clearReaction(); }, this.reactionDurationMs);
  }

  updateScroll(input: { chapterId: string; progress: number; velocityPxPerSecond: number; cameraShotId: string }) {
    const reverse = input.velocityPxPerSecond < 0;
    const rapid = Math.abs(input.velocityPxPerSecond) >= 2500;
    this.storyPoseId = `${input.chapterId}-${rapid ? 'arrival' : 'traverse'}-${reverse ? 'reverse' : 'forward'}`;
    this.storyShotId = input.cameraShotId;
    this.state = { ...this.state, activeChapterId: input.chapterId, normalizedProgress: Math.max(0, Math.min(1, input.progress)), direction: reverse ? 'reverse' : 'forward', velocityPxPerSecond: input.velocityPxPerSecond, cameraShotId: this.state.controlOwner === 'visitor' ? this.state.cameraShotId : input.cameraShotId, characterPoseId: this.storyPoseId };
    this.notify();
    return { skippedTraversal: rapid, durationMs: rapid ? 180 : 360, poseId: this.storyPoseId };
  }

  enterExplore(sceneId: SceneId) {
    if (this.destroyed) return;
    this.state = { ...this.state, controlOwner: 'visitor', exploreSceneId: sceneId, reaction: { id: 'ownership-change', priority: 100 } };
    this.notify();
    this.scheduleReactionClear();
  }

  exitExplore(_reason: 'escape' | 'exit' | 'scroll' | 'capability-change') {
    this.state = { ...this.state, controlOwner: 'transition', exploreSceneId: null, cameraShotId: this.storyShotId, characterPoseId: this.storyPoseId };
    this.notify();
    return { durationMs: 420, cameraShotId: this.storyShotId };
  }

  completeTransition() {
    if (this.destroyed) return;
    this.state = { ...this.state, controlOwner: 'story', cameraShotId: this.storyShotId, characterPoseId: this.storyPoseId, reaction: null };
    this.notify();
  }

  resolveCapabilityPolicy(qualityTier: QualityTier) {
    if (this.reactionTimer) clearTimeout(this.reactionTimer);
    this.reactionTimer = null;
    this.state = { ...this.state, controlOwner: 'story', exploreSceneId: null, cameraShotId: this.storyShotId, characterPoseId: this.storyPoseId, reaction: null, qualityTier };
    this.notify();
    return this.getState();
  }

  authorCameraShot(cameraShotId: string) {
    if (this.destroyed) return;
    this.storyShotId = cameraShotId;
    this.state = { ...this.state, cameraShotId };
    this.notify();
  }

  dispatch(event: PortfolioWorldEvent) {
    if (this.destroyed) return;
    const reaction = eventReaction(event);
    if (this.state.reaction && this.state.reaction.priority > reaction.priority) return;
    if (reaction.priority <= 10 && this.state.reaction?.id === reaction.id) return;
    if (event.type === 'QUALITY_CHANGED') {
      this.state = { ...this.state, qualityTier: event.tier, reaction };
      if (this.state.controlOwner === 'visitor' && (event.tier === 'static' || event.tier === 'reduced')) {
        this.state = { ...this.state, controlOwner: 'transition', exploreSceneId: null, cameraShotId: this.storyShotId, characterPoseId: this.storyPoseId };
      }
    } else {
      this.state = { ...this.state, reaction };
    }
    this.notify();
    this.scheduleReactionClear();
  }

  clearReaction() {
    if (this.destroyed) return;
    if (this.reactionTimer) clearTimeout(this.reactionTimer);
    this.reactionTimer = null;
    this.state = { ...this.state, reaction: null, characterPoseId: this.storyPoseId };
    this.notify();
  }

  destroy() { this.destroyed = true; if (this.reactionTimer) clearTimeout(this.reactionTimer); this.reactionTimer = null; this.listeners.clear(); }
}
