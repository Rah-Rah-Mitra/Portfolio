import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MechanicalExhibitViewport, { mechanismAssets } from '../components/MechanicalExhibitViewport';

afterEach(cleanup);

describe('real workstation mechanisms', () => {
  it('maps every exhibit to a GLB and a rendered WebP fallback', () => {
    expect(Object.keys(mechanismAssets)).toEqual(['optical-rail', 'flow-shop-machine', 'spatial-allocation-table']);
    for (const asset of Object.values(mechanismAssets)) {
      expect(asset.model.endsWith('.glb')).toBe(true);
      expect(asset.poster.endsWith('.webp')).toBe(true);
    }
  });

  it('keeps a semantic deterministic-render fallback without creating WebGL', () => {
    const { container } = render(<MechanicalExhibitViewport assetId="flow-shop-machine" enhanced={false} />);
    const image = screen.getByRole('img', { name: 'Rendered two-machine flow-shop mechanism' });
    expect(image.getAttribute('src')).toBe('/workstation/posters/flow-shop-machine.webp');
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.getByText(/deterministic TypeScript schedule/i)).not.toBeNull();
  });

  it('exposes keyboard-operable model selection controls through the systems deck', () => {
    render(<MechanicalExhibitViewport assetId="spatial-allocation-table" enhanced={false} />);
    const rotate = screen.getByRole('button', { name: 'Rotate mechanism right' });
    fireEvent.keyDown(rotate, { key: 'ArrowRight' });
    expect(rotate).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Reset mechanism view' })).not.toBeNull();
  });
});
