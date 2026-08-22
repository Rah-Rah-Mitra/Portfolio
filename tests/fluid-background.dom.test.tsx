import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppearanceProvider } from '../contexts/AppearanceContext';
import FluidBackground from '../components/FluidBackground';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Fluid desktop background', () => {
  it('does not request a WebGL context while the GPU lease is inactive', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<AppearanceProvider><FluidBackground active={false} /></AppearanceProvider>);
    expect(context).not.toHaveBeenCalled();
  });

  it('uses Appearance fluid settings rather than the retired FX toggle', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<AppearanceProvider><FluidBackground active /></AppearanceProvider>);
    expect(context).toHaveBeenCalledWith('webgl2', expect.objectContaining({ alpha: true }));
  });
});
