import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraLab } from '../components/workbench/CameraLab';
import type { PortfolioWorldEvent } from '../types';

// The only jsdom file for the Camera Lab. Everything it draws is SVG, so no
// canvas, IntersectionObserver or rAF stubs are needed. The model itself is
// pinned in tests/camera-model.test.ts; this file holds what only a mounted
// component can show: keyboard tabs, the assistant's mode event, the world
// events, and the calibration state machine.

let events: PortfolioWorldEvent[] = [];
const record = (event: Event) => events.push((event as CustomEvent<PortfolioWorldEvent>).detail);

beforeEach(() => {
  events = [];
  window.addEventListener('portfolio:world-event', record);
});

afterEach(() => {
  cleanup();
  window.removeEventListener('portfolio:world-event', record);
  vi.useRealTimers();
});

const tab = (container: HTMLElement, mode: string) => container.querySelector<HTMLButtonElement>(`#cam-tab-${mode}`)!;
const selected = (container: HTMLElement) =>
  container.querySelector('[role="tab"][aria-selected="true"]')?.id.replace('cam-tab-', '');
const sendMode = (mode: string) =>
  act(() => {
    window.dispatchEvent(new CustomEvent('portfolio:camera-lab-mode', { detail: { mode } }));
  });

describe('Camera Lab', () => {
  it('moves between models with the keyboard, selection following focus', () => {
    const { container } = render(<CameraLab />);
    expect(screen.getByRole('tab', { name: 'Intrinsics' })).toBe(tab(container, 'intrinsics'));
    tab(container, 'intrinsics').focus();
    fireEvent.keyDown(tab(container, 'intrinsics'), { key: 'ArrowRight' });
    expect(selected(container)).toBe('extrinsics');
    expect(document.activeElement).toBe(tab(container, 'extrinsics'));
    fireEvent.keyDown(tab(container, 'extrinsics'), { key: 'End' });
    expect(selected(container)).toBe('stereo');
    fireEvent.keyDown(tab(container, 'stereo'), { key: 'Home' });
    expect(selected(container)).toBe('intrinsics');
    expect(document.activeElement).toBe(tab(container, 'intrinsics'));
  });

  it('follows the assistant’s mode event and ignores unknown modes', () => {
    const { container } = render(<CameraLab />);
    sendMode('stereo');
    expect(selected(container)).toBe('stereo');
    const panel = container.querySelector('#cam-panel')!;
    expect(panel.getAttribute('aria-labelledby')).toBe('cam-tab-stereo');
    expect(panel.textContent).toContain('fx·B');
    expect(panel.textContent).toContain('186.7');
    fireEvent.change(container.querySelector('#cam-ctl-baselineM')!, { target: { value: '0.24' } });
    expect(panel.textContent).toContain('373.3');
    sendMode('bogus');
    expect(selected(container)).toBe('stereo');
  });

  it('dispatches nothing at mount, and one LAB_RESET on reset', () => {
    vi.useFakeTimers();
    const { container } = render(<CameraLab />);
    expect(events).toHaveLength(0);
    sendMode('stereo');
    fireEvent.change(container.querySelector('#cam-ctl-baselineM')!, { target: { value: '0.24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset scene' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector('#cam-panel')!.textContent).toContain('186.7');
    // Reset cancels the pending debounce, so the baseline change never reports.
    expect(events).toEqual([{ type: 'LAB_RESET', sceneId: 'camera-laboratory' }]);
  });

  it('calibrates on demand, reports it, and marks the result stale', async () => {
    vi.useFakeTimers();
    const { container } = render(<CameraLab />);
    const status = () => container.querySelector('[role="status"]')!.textContent ?? '';
    expect(status()).toContain('Not yet run');
    const button = screen.getByRole('button', { name: 'Calibrate' }) as HTMLButtonElement;
    button.focus();
    fireEvent.click(button);
    expect(status()).toContain('Solving');
    // Busy, not `disabled`: a disabled focused button drops focus to <body> in a
    // real browser. A second press mid-solve is ignored by the handler instead.
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    act(() => {
      vi.runAllTimers();
    });
    // The solver is a dynamic import (it stays out of the entry chunk), so the
    // result lands once that module resolves, not on the timer alone.
    vi.useRealTimers();
    await waitFor(() => expect(container.querySelector('caption')?.textContent).toBe('Calibration results'));
    expect(status()).toContain('RMS 0.28');
    expect(button.getAttribute('aria-disabled')).toBeNull();
    expect(document.activeElement).toBe(button);
    const calibrated = events.filter((e) => e.type === 'CAMERA_CALIBRATED');
    expect(calibrated).toHaveLength(1);
    expect(calibrated[0].type === 'CAMERA_CALIBRATED' && calibrated[0].reprojectionError).toBeLessThan(1);
    fireEvent.change(container.querySelector('#cam-ctl-focalMm')!, { target: { value: '50' } });
    expect(status()).toContain('Stale');
    expect(container.querySelector('caption')?.textContent).toBe('Calibration results');
  });
});
