import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import EffectsLabPanel from '../components/EffectsLabPanel';
import { EffectsProvider } from '../contexts/PhysicsContext';

afterEach(cleanup);

describe('effects lab world handoff', () => {
  it('keeps the working FX controls and presents Explore World as an honest anchor', () => {
    render(
      <EffectsProvider>
        <EffectsLabPanel />
      </EffectsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /FX, open optional effects lab/ }));
    const dialog = screen.getByRole('dialog', { name: 'Effects lab' });

    ['Smash', 'Gravity', 'Fluid field', 'Text signal'].forEach((label) => {
      expect(within(dialog).getByRole('button', { name: new RegExp(label, 'i') })).not.toBeNull();
    });
    expect(dialog.textContent).not.toMatch(/Spatial portfolio map|Lazy-loaded Three\.js environment/i);
    expect(dialog.textContent).toContain('The shared optical test bench is this site’s enhancement target.');
    expect(within(dialog).getByRole('link', { name: 'Explore World' }).getAttribute('href')).toBe('#world');
  });
});
