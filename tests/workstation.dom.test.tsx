import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkstationProvider, useWorkstation } from '../contexts/WorkstationContext';
import { WorkstationAppFrame, WorkstationRail } from '../components/WorkstationShell';

const Harness = ({ enabled = true }: { enabled?: boolean }) => (
  <WorkstationProvider enabled={enabled}>
    <WorkstationRail />
    <WorkstationAppFrame appId="camera-lab"><p>Camera controls</p></WorkstationAppFrame>
    <StateProbe />
  </WorkstationProvider>
);

const StateProbe = () => {
  const { state } = useWorkstation();
  return <output data-testid="workstation-state">{JSON.stringify(state)}</output>;
};

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('workstation shell', () => {
  it('opens one focused application from the ten-module rail and writes shareable history', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Workstation applications' })).not.toBeNull());
    expect(screen.getAllByRole('button', { name: /Open / })).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: 'Open Camera Lab' }));
    expect(window.location.search).toBe('?app=camera-lab');
    expect(screen.getByRole('dialog', { name: 'Camera Lab' })).not.toBeNull();
    expect(screen.getByText('Camera controls')).not.toBeNull();
    expect(screen.getByTestId('workstation-state').textContent).toContain('"activeAppId":"camera-lab"');
    expect(screen.getByRole('button', { name: 'Open Camera Lab' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.dataset.workstationActive).toBe('camera-lab');
  });

  it('minimizes the active tool, restores document ownership, and returns focus to its rail module', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Workstation applications' })).not.toBeNull());
    const cameraModule = screen.getByRole('button', { name: 'Open Camera Lab' });
    fireEvent.click(cameraModule);
    fireEvent.click(screen.getByRole('button', { name: 'Minimize Camera Lab' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Camera Lab' })).toBeNull());
    expect(window.location.search).toBe('');
    expect(screen.getByTestId('workstation-state').textContent).toContain('"controlOwner":"document"');
    expect(document.documentElement.dataset.workstationActive).toBeUndefined();
    await waitFor(() => expect(document.activeElement).toBe(cameraModule));
  });

  it('restores a deep-linked application and synchronizes browser history', async () => {
    window.history.replaceState(null, '', '/?app=camera-lab#technical-lab');
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Camera Lab' })).not.toBeNull());

    window.history.replaceState(null, '', '/#technical-lab');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Camera Lab' })).toBeNull());
  });

  it('suppresses workstation chrome and ignores app routes in Quick Scan', async () => {
    window.history.replaceState(null, '', '/?mode=scan&app=camera-lab');
    render(<Harness enabled={false} />);
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Workstation applications' })).toBeNull());
    expect(screen.queryByRole('dialog', { name: 'Camera Lab' })).toBeNull();
    expect(screen.getByTestId('workstation-state').textContent).toContain('"activeAppId":"home"');
  });

  it('offers direct and keyboard-equivalent move, resize, and snap controls', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Workstation applications' })).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Open Camera Lab' }));

    const move = screen.getByRole('button', { name: 'Move Camera Lab window' });
    fireEvent.keyDown(move, { key: 'ArrowRight' });
    let state = JSON.parse(screen.getByTestId('workstation-state').textContent ?? '{}');
    expect(state.boundsByApp['camera-lab'].x).toBeGreaterThan(0);

    const resize = screen.getByRole('button', { name: 'Resize Camera Lab window' });
    const beforeWidth = state.boundsByApp['camera-lab'].width;
    fireEvent.keyDown(resize, { key: 'ArrowLeft', shiftKey: true });
    state = JSON.parse(screen.getByTestId('workstation-state').textContent ?? '{}');
    expect(state.boundsByApp['camera-lab'].width).toBeLessThan(beforeWidth);

    fireEvent.click(screen.getByRole('button', { name: 'Snap Camera Lab left' }));
    state = JSON.parse(screen.getByTestId('workstation-state').textContent ?? '{}');
    expect(state.snapByApp['camera-lab']).toBe('left');
  });
});
