import type { QualityTier } from '../types';
import type { InteractionArbitrator } from './InteractionArbitrator';
import type { NarrativeController } from './NarrativeController';

export const WORLD_POLICY_CHANGE_EVENT = 'portfolio:world-policy-change';

export type WorldPolicyChangeDetail = {
  allowWorld: boolean;
  qualityTier: QualityTier;
};

export const signalWorldPolicyChange = (detail: WorldPolicyChangeDetail) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(WORLD_POLICY_CHANGE_EVENT, { detail }));
};

export const resolveWorldPolicyHandoff = (options: {
  controller: NarrativeController;
  arbitrator: InteractionArbitrator;
  detail: WorldPolicyChangeDetail;
  releasePointerCapture: () => void;
  cancelTransition: () => void;
  restoreStoryShot: () => void;
}) => {
  if (options.detail.allowWorld) return { controllerState: options.controller.getState(), interactionState: options.arbitrator.state };
  options.cancelTransition();
  options.releasePointerCapture();
  options.arbitrator.reset();
  const controllerState = options.controller.resolveCapabilityPolicy(options.detail.qualityTier);
  options.restoreStoryShot();
  return { controllerState, interactionState: options.arbitrator.state };
};
