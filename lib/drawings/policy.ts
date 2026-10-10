import type { ExperiencePolicy } from '../experienceMode';

// The desk drawing set's activity (docs/portfolio/desk-drawing-set.md §5 "Policy").
// It is the desk's default background, so unlike N-body and smoke
// (desktopBackgroundPolicy.resolveBackdropActivity, unchanged) it does mount on
// the light policies — as one finished still: Save-Data and reduced motion get
// the cover sheet and never the film. ?mode=scan keeps the plain grid. Mounted,
// the film animates only while nothing holds it: a hidden page, halted motion
// (lib/motion), the Estate window holding the GPU (lib/gpuClaim), or a running
// N-body or smoke field (one ambient motion at a time). Pure.

export type DrawingScope = 'cover' | 'film';

export type DrawingState =
  | 'pending' | 'save-data' | 'reduced-motion' | 'hidden' | 'motion-halted' | 'yielded' | 'fx' | 'running';

export interface DrawingActivityInput {
  enabled: boolean;
  /** The experience policy has resolved (ExperienceModeContext `resolved`): before that it is the static default. */
  resolved: boolean;
  policy: Pick<ExperiencePolicy, 'mode' | 'reason'>;
  motionHalted: boolean;
  documentHidden: boolean;
  /** The Estate window holds the GPU. */
  yielded: boolean;
  /** An N-body field or fluid smoke is animating behind it. */
  fx: boolean;
}

export interface DrawingActivity {
  mount: boolean;
  scope: DrawingScope | null;
  running: boolean;
  state: DrawingState | null;
}

const OFF: DrawingActivity = { mount: false, scope: null, running: false, state: null };

/** `leased` is whether the drawing was mounted on the previous render. */
export const resolveDrawingActivity = (input: DrawingActivityInput, leased: boolean): DrawingActivity => {
  if (!input.enabled) return OFF;
  if (!input.resolved && !leased) return { ...OFF, state: 'pending' };
  if (input.policy.reason === 'query' && input.policy.mode === 'scan') return OFF;
  if (input.policy.reason === 'save-data') return { mount: true, scope: 'cover', running: false, state: 'save-data' };
  if (input.policy.reason === 'reduced-motion') return { mount: true, scope: 'cover', running: false, state: 'reduced-motion' };
  const film = (state: DrawingState, running = false): DrawingActivity => ({ mount: true, scope: 'film', running, state });
  if (input.documentHidden) return film('hidden');
  if (input.motionHalted) return film('motion-halted');
  if (input.yielded) return film('yielded');
  if (input.fx) return film('fx');
  return film('running', true);
};
