import { describe, expect, it, vi } from 'vitest';
import { NarrativeController } from '../lib/NarrativeController';

describe('NarrativeController', () => {
  it('is the sole owner and restores the current story shot within 450ms', () => {
    const controller = new NarrativeController({ chapterId: 'home', cameraShotId: 'shot-home', characterPoseId: 'idle-home' });
    controller.enterExplore('camera-laboratory');
    expect(controller.getState().controlOwner).toBe('visitor');
    const transition = controller.exitExplore('escape');
    expect(transition.durationMs).toBeLessThanOrEqual(450);
    expect(controller.getState().controlOwner).toBe('transition');
    controller.completeTransition();
    expect(controller.getState()).toMatchObject({ controlOwner: 'story', cameraShotId: 'shot-home' });
  });

  it('resolves rapid scroll to a credible direction-specific arrival in about 180ms', () => {
    const controller = new NarrativeController({ chapterId: 'home', cameraShotId: 'shot-home', characterPoseId: 'idle-home' });
    const resolution = controller.updateScroll({ chapterId: 'work', progress: 0.92, velocityPxPerSecond: -2600, cameraShotId: 'shot-work' });
    expect(resolution.skippedTraversal).toBe(true);
    expect(resolution.durationMs).toBe(180);
    expect(controller.getState().characterPoseId).toBe('work-arrival-reverse');
  });

  it('prioritizes ownership and quality, coalesces low reactions, and returns to story pose', () => {
    const controller = new NarrativeController({ chapterId: 'home', cameraShotId: 'shot-home', characterPoseId: 'idle-home' });
    controller.dispatch({ type: 'PROJECT_OPENED', projectId: 'churp', selectedId: 'map', selectedIndex: 0 });
    controller.dispatch({ type: 'INTERACTION_CHANGED', sceneId: 'spatial-systems', source: 'visitor', detail: 'hover-a' });
    controller.dispatch({ type: 'INTERACTION_CHANGED', sceneId: 'spatial-systems', source: 'visitor', detail: 'hover-b' });
    expect(controller.getState().reaction?.id).toBe('inspect-project');
    controller.dispatch({ type: 'QUALITY_CHANGED', tier: 'reduced' });
    expect(controller.getState()).toMatchObject({ qualityTier: 'reduced', reaction: { id: 'quality-change' } });
    controller.clearReaction();
    expect(controller.getState()).toMatchObject({ reaction: null, characterPoseId: 'idle-home' });
  });

  it('exits Explore on a capability change and tears down subscribers', () => {
    const controller = new NarrativeController({ chapterId: 'home', cameraShotId: 'shot-home', characterPoseId: 'idle-home' });
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.enterExplore('camera-laboratory');
    controller.dispatch({ type: 'QUALITY_CHANGED', tier: 'static' });
    expect(controller.getState().controlOwner).toBe('transition');
    controller.destroy();
    controller.completeTransition();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('coalesces repeated low-priority ambient reactions', () => {
    const controller = new NarrativeController({ chapterId: 'home', cameraShotId: 'shot-home', characterPoseId: 'idle-home' });
    const listener = vi.fn();
    controller.subscribe(listener);
    const hover = { type: 'INTERACTION_CHANGED', sceneId: 'calibration', source: 'visitor', detail: 'hover' } as const;
    controller.dispatch(hover);
    controller.dispatch(hover);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
