import type { PortfolioWorldEvent } from '../types';

export const COURIER_CLIP_ALIASES = {
  idle: 'idle-neutral', inspect: 'inspect-object', point: 'point-result', success: 'acknowledge-success',
  puzzled: 'inspect-puzzled', stepAside: 'step-aside', look: 'look-target', reset: 'return-neutral',
  arrivalForward: 'arrival-forward-snapshot', arrivalReverse: 'arrival-reverse-snapshot',
  traverseForward: 'traverse-forward', traverseReverse: 'traverse-reverse-authored', mechanicalNeutral: 'mechanical-neutral',
} as const;

export type CourierReactionAlias = keyof Pick<typeof COURIER_CLIP_ALIASES, 'inspect' | 'point' | 'success' | 'puzzled' | 'stepAside' | 'look' | 'reset'>;
export type CourierReaction = { id: string; alias: CourierReactionAlias; clip: string; priority: number; coalesceKey: string };

const build = (id: string, alias: CourierReactionAlias, priority: number, coalesceKey: string = alias): CourierReaction => ({
  id, alias, clip: COURIER_CLIP_ALIASES[alias], priority, coalesceKey,
});

export const reactionForEvent = (event: PortfolioWorldEvent): CourierReaction => {
  switch (event.type) {
    case 'QUALITY_CHANGED': return build('quality-change', 'stepAside', 100, event.type);
    case 'EXPLORE_ENTERED': return build('explore-entered', 'stepAside', 100, event.type);
    case 'EXPLORE_EXITED': return build('explore-exited', 'look', 100, event.type);
    case 'LAB_RESET': case 'INTERACTION_RESET': return build('reset', 'reset', 100, 'reset');
    case 'CAMERA_CALIBRATED': return event.reprojectionError < 1
      ? build('calibration-success', 'success', 60, 'camera-calibration')
      : build('calibration-puzzled', 'puzzled', 60, 'camera-calibration');
    case 'STEREO_POINT_TRIANGULATED': return event.depthError < .25
      ? build('stereo-success', 'success', 60, 'stereo-calibration')
      : build('stereo-puzzled', 'puzzled', 60, 'stereo-calibration');
    case 'PROJECT_OPENED': return build('inspect-project', 'inspect', 50, `project:${event.projectId}`);
    case 'JOB_REORDERED': return build('point-bottleneck', 'point', 50, 'flow-shop-result');
    case 'MAP_MARKER_MOVED': return build('inspect-marker', 'inspect', 50, `marker:${event.markerId}`);
    case 'CAMERA_LAB_UPDATED': return build('step-aside', 'stepAside', 20, 'camera-drag');
    default: return build('ambient-look', 'look', 10, `ambient:${event.type}`);
  }
};

export const shouldRestartReaction = (current: CourierReaction | null, next: CourierReaction, elapsedMilliseconds: number): boolean => {
  if (!current) return true;
  if (next.priority > current.priority) return true;
  if (next.coalesceKey === current.coalesceKey) return false;
  return next.id !== current.id || elapsedMilliseconds >= 240;
};

export const traversalClipFor = (input: { direction: 'forward' | 'reverse'; rapid: boolean; family: 'walk' | 'run' | 'vault' | 'jump' | 'mechanical' }) => {
  if (input.family === 'mechanical') return { alias: 'mechanicalNeutral' as const, reversePlayback: input.direction === 'reverse' };
  if (input.rapid) return { alias: input.direction === 'reverse' ? 'arrivalReverse' as const : 'arrivalForward' as const, reversePlayback: false };
  return { alias: input.direction === 'reverse' ? 'traverseReverse' as const : 'traverseForward' as const, reversePlayback: false };
};
