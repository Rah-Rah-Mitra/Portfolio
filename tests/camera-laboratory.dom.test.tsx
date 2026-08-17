import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CameraLaboratory from '../components/CameraLaboratory';

afterEach(cleanup);

describe('Camera Laboratory', () => {
  it('keeps four persistent keyboard-operable modes with semantic results', () => {
    render(<CameraLaboratory />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    const intrinsics = screen.getByRole('tab', { name: 'Intrinsics' });
    intrinsics.focus();
    fireEvent.keyDown(intrinsics, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Extrinsics' }));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Extrinsics' }), { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Stereo' }));
    expect(screen.getByRole('tabpanel').textContent).toContain('Z = fB / d');
    expect(screen.getByRole('table', { name: 'Stereo results' }).textContent).toContain('3.000 m');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Stereo' }), { key: 'Home' });
    expect(document.activeElement).toBe(intrinsics);
  });

  it('updates stereo, emits a world event, and resets independently', () => {
    const onWorldEvent = vi.fn();
    render(<CameraLaboratory onWorldEvent={onWorldEvent} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stereo' }));
    const panel = screen.getByRole('tabpanel');
    fireEvent.change(within(panel).getByRole('spinbutton', { name: 'Disparity (px)' }), { target: { value: '21' } });
    expect(within(panel).getByRole('table', { name: 'Stereo results' }).textContent).toContain('4.000 m');
    expect(onWorldEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'STEREO_POINT_TRIANGULATED' }));
    expect(onWorldEvent.mock.calls[0][0].depthError).toBeCloseTo(0.8, 10);
    fireEvent.click(within(panel).getByRole('button', { name: 'Reset Stereo' }));
    expect((within(panel).getByRole('spinbutton', { name: 'Disparity (px)' }) as HTMLInputElement).value).toBe('28');
    expect(onWorldEvent).toHaveBeenCalledWith({ type: 'LAB_RESET', sceneId: 'camera-laboratory' });
  });

  it('labels invalid geometry and exposes the optional semantic Engineer View', () => {
    render(<CameraLaboratory qualityTier="balanced" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Extrinsics' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Object Z' }), { target: { value: '-1' } });
    expect(screen.getByRole('alert').textContent).toMatch(/behind the camera/i);
    fireEvent.click(screen.getByRole('button', { name: 'Show Engineer View' }));
    expect(screen.getByRole('region', { name: 'Engineer View' }).textContent).toContain('balanced');
    expect(screen.getByRole('region', { name: 'Engineer View' }).textContent).toContain('Intrinsic matrix K');
    expect(screen.getByText(/portfolio-site experiment, not professional project evidence/i)).not.toBeNull();
  });

  it('labels the optical blur model analytic and retains an example preset', () => {
    render(<CameraLaboratory />);
    fireEvent.click(screen.getByRole('tab', { name: 'Optics' }));
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toMatch(/analytic thin-lens sensor blur/i);
    fireEvent.click(within(panel).getByRole('button', { name: 'Load Optics example' }));
    expect((within(panel).getByRole('spinbutton', { name: 'F-number' }) as HTMLInputElement).value).toBe('1.4');
  });
});
