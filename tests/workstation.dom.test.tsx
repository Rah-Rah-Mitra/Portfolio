import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkstationProvider, useWorkstation } from '../contexts/WorkstationContext';
import { WorkstationAppFrame, WorkstationAppSurface, WorkstationRail } from '../components/WorkstationShell';

const Harness = ({ enabled = true }: { enabled?: boolean }) => (
  <WorkstationProvider enabled={enabled}>
    <WorkstationRail />
    <WorkstationAppSurface appId="home"><h1>Recruiter evidence</h1></WorkstationAppSurface>
    <WorkstationAppFrame appId="camera-lab"><p>Camera controls</p></WorkstationAppFrame>
    <WorkstationAppFrame appId="systems-lab"><p>Systems controls</p></WorkstationAppFrame>
    <WorkstationAppFrame appId="experience"><p>Experience timeline</p></WorkstationAppFrame>
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
  it('opens multiple application windows, focuses one, and writes only the focused route', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Workstation applications' })).not.toBeNull());
    expect(screen.getAllByRole('button', { name: /Open / })).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: 'Open Camera Lab' }));
    expect(window.location.search).toBe('?app=camera-lab');
    expect(screen.getByRole('dialog', { name: 'Camera Lab' })).not.toBeNull();
    expect(screen.getByText('Camera controls')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open Systems Lab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Experience' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(3);
    expect(screen.getByTestId('workstation-state').textContent).toContain('"focusedAppId":"experience"');
    fireEvent.pointerDown(screen.getByRole('dialog', { name: 'Camera Lab' }));
    expect(screen.getByTestId('workstation-state').textContent).toContain('"focusedAppId":"camera-lab"');
    expect(window.location.search).toBe('?app=camera-lab');
    expect(screen.getByRole('button', { name: 'Open Camera Lab' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.dataset.workstationActive).toBe('camera-lab');
  });

  it('presents Home as the maximized evidence Dossier rather than an unframed page', async () => {
    render(
      <WorkstationProvider enabled>
        <WorkstationAppSurface appId="home"><h1>Recruiter evidence</h1></WorkstationAppSurface>
      </WorkstationProvider>,
    );

    await waitFor(() => expect(screen.getByRole('region', { name: 'Home / Dossier application' })).not.toBeNull());
    expect(screen.getByText('PORTFOLIO WORKSTATION')).not.toBeNull();
    expect(screen.getByText('MAXIMIZED')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Recruiter evidence' })).not.toBeNull();
  });

  it('minimizes only the focused tool, falls back to the next window, and returns focus to its rail module', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Workstation applications' })).not.toBeNull());
    const cameraModule = screen.getByRole('button', { name: 'Open Camera Lab' });
    fireEvent.click(cameraModule);
    fireEvent.click(screen.getByRole('button', { name: 'Open Systems Lab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Minimize Camera Lab' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Camera Lab' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Systems Lab' })).not.toBeNull();
    expect(window.location.search).toBe('?app=systems-lab');
    expect(screen.getByTestId('workstation-state').textContent).toContain('"controlOwner":"app"');
    expect(document.documentElement.dataset.workstationActive).toBe('systems-lab');
    await waitFor(() => expect(document.activeElement).toBe(cameraModule));
  });

  it('uses Home as Show Desktop while keeping the Dossier mounted', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Workstation applications' })).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Open Camera Lab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Systems Lab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Home / Dossier' }));
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    expect(screen.getByRole('region', { name: 'Home / Dossier application' })).not.toBeNull();
    const state = JSON.parse(screen.getByTestId('workstation-state').textContent ?? '{}');
    expect(state.openAppIds).toEqual(['camera-lab', 'systems-lab']);
    expect(state.minimizedAppIds).toEqual(['camera-lab', 'systems-lab']);
    expect(state.windowStack).toEqual(['camera-lab', 'systems-lab']);
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
    expect(screen.getByTestId('workstation-state').textContent).toContain('"focusedAppId":"home"');
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

  it('provides Mac-style close, minimize, and maximize controls with titlebar restore', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Workstation applications' })).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Open Camera Lab' }));

    fireEvent.click(screen.getByRole('button', { name: 'Maximize Camera Lab' }));
    let state = JSON.parse(screen.getByTestId('workstation-state').textContent ?? '{}');
    expect(state.snapByApp['camera-lab']).toBe('maximized');

    fireEvent.doubleClick(screen.getByTestId('workstation-titlebar-camera-lab'));
    state = JSON.parse(screen.getByTestId('workstation-state').textContent ?? '{}');
    expect(state.snapByApp['camera-lab']).toBe('floating');

    fireEvent.click(screen.getByRole('button', { name: 'Close Camera Lab' }));
    expect(screen.queryByRole('dialog', { name: 'Camera Lab' })).toBeNull();
    expect(screen.getByTestId('workstation-state').textContent).toContain('"openAppIds":[]');
    expect(screen.getByRole('button', { name: 'Open Camera Lab' }).textContent).toContain('Status: Closed');
  });
});
