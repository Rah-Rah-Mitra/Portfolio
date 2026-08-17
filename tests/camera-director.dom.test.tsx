import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CameraDirector from '../components/CameraDirector';
import { cameraShots } from '../world/narrativeManifest';

afterEach(cleanup);
describe('development Camera Director live adapter', () => {
  it('publishes edited shot values immediately', () => {
    const onChange = vi.fn(); render(<CameraDirector shot={cameraShots[0]} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'FOV' }), { target: { value: '52' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'overview', fov: 52 }));
  });

  it('publishes typed light colors immediately', () => {
    const onChange = vi.fn();
    render(<CameraDirector shot={{ ...cameraShots[0], lighting: { key: 3, fill: 2, environment: 1, keyColor: '#ffffff', fillColor: '#ffffff' } }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Key light color'), { target: { value: '#d9fffb' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lighting: expect.objectContaining({ keyColor: '#d9fffb' }) }));
  });

  it('publishes dolly, orbit, Courier framing, and safe-region edits immediately', () => {
    const onChange = vi.fn();
    render(<CameraDirector shot={cameraShots[0]} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Dolly distance' }), { target: { value: '4.5' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Orbit azimuth min' }), { target: { value: '-0.4' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Character scale' }), { target: { value: '0.8' } });
    fireEvent.change(screen.getByLabelText('Safe text region IDs'), { target: { value: 'portfolio-title, hero-actions' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dollyDistance: 4.5 }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ orbitLimits: expect.objectContaining({ azimuth: [-.4, .6] }) }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ characterFraming: { scale: .8, offset: [0, 0, 0] } }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ safeTextRegionIds: ['portfolio-title', 'hero-actions'] }));
  });

  it('rejects invalid responsive JSON before it reaches the live world', () => {
    const onChange = vi.fn();
    render(<CameraDirector shot={cameraShots[0]} onChange={onChange} />);
    fireEvent.blur(screen.getByLabelText('Responsive override JSON'), { target: { value: '{"mobile":{"fov":null}}' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/responsive override is invalid/i)).not.toBeNull();
  });
});
