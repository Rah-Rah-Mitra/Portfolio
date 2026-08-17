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
});
