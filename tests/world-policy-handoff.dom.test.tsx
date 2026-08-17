import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExperienceModeControl } from '../components/PortfolioExperience';
import { ExperienceModeProvider } from '../contexts/ExperienceModeContext';
import { InteractionArbitrator } from '../lib/InteractionArbitrator';
import { NarrativeController } from '../lib/NarrativeController';
import * as handoffModule from '../lib/worldPolicyHandoff';

afterEach(() => { cleanup(); sessionStorage.clear(); window.history.replaceState(null, '', '/'); });

describe('world policy handoff', () => {
  it('clears Guided Explore ownership and active interaction before Quick Scan applies', async () => {
    const controller = new NarrativeController({ chapterId: 'technical-lab', cameraShotId: 'camera-lab', characterPoseId: 'lab-arrival-forward' });
    const arbitrator = new InteractionArbitrator();
    controller.enterExplore('camera-laboratory'); arbitrator.enterExplore('camera-laboratory');
    const releasePointerCapture = vi.fn(); const cancelTransition = vi.fn(); const restoreStoryShot = vi.fn();
    const resolveHandoff = (handoffModule as typeof handoffModule & { resolveWorldPolicyHandoff?: (options: unknown) => unknown }).resolveWorldPolicyHandoff;
    expect(resolveHandoff).toBeTypeOf('function');
    const listener = (event: Event) => resolveHandoff?.({ controller, arbitrator, detail: (event as CustomEvent).detail, releasePointerCapture, cancelTransition, restoreStoryShot });
    window.addEventListener(handoffModule.WORLD_POLICY_CHANGE_EVENT, listener);

    render(<ExperienceModeProvider capabilities={{ saveData: false, reducedMotion: false, webgl: 'full' }}><ExperienceModeControl /></ExperienceModeProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guided' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Quick Scan' }));

    expect(controller.getState()).toMatchObject({ controlOwner: 'story', exploreSceneId: null, qualityTier: 'static' });
    expect(arbitrator.state).toBe('idle');
    expect(releasePointerCapture).toHaveBeenCalledOnce();
    expect(cancelTransition).toHaveBeenCalledOnce();
    expect(restoreStoryShot).toHaveBeenCalledOnce();
    window.removeEventListener(handoffModule.WORLD_POLICY_CHANGE_EVENT, listener); controller.destroy();
  });
});
