import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DepartureIris,
  FlowShopExhibit,
  ProjectSystemInspector,
  SpatialSystemsExhibit,
} from '../components/InteractiveExhibits';

afterEach(cleanup);

describe('direct-manipulation exhibits', () => {
  it('renders one semantic flow-shop result and updates it through keyboard-equivalent controls', () => {
    const events = vi.fn();
    render(<FlowShopExhibit onWorldEvent={events} />);
    const exhibit = screen.getByRole('region', { name: 'Systems in Motion' });
    expect(within(exhibit).getByText('Makespan 18')).not.toBeNull();
    expect(within(exhibit).getByRole('table', { name: /two-machine Gantt/i })).not.toBeNull();
    fireEvent.click(within(exhibit).getByRole('button', { name: 'Move job C earlier' }));
    expect(within(exhibit).getByText('Makespan 17')).not.toBeNull();
    expect(within(exhibit).getByRole('status').textContent).toMatch(/one time unit/i);
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'JOB_REORDERED', oldMakespan: 18, newMakespan: 17, makespanDelta: -1 }));
    fireEvent.click(within(exhibit).getByRole('button', { name: 'Reset schedule' }));
    expect(within(exhibit).getByText('Makespan 18')).not.toBeNull();
  });

  it('renders spatial controls, exact result table, disclaimer, overlays, and Reset', () => {
    const events = vi.fn();
    render(<SpatialSystemsExhibit onWorldEvent={events} />);
    const exhibit = screen.getByRole('region', { name: 'Spatial Systems' });
    expect(within(exhibit).getByText(/synthetic allocation illustration/i)).not.toBeNull();
    expect(within(exhibit).getByRole('table', { name: /plot distances/i })).not.toBeNull();
    expect(within(exhibit).getByText(/North is the nearest eligible plot/i)).not.toBeNull();
    fireEvent.change(within(exhibit).getByRole('slider', { name: 'Marker X coordinate' }), { target: { value: '82' } });
    fireEvent.change(within(exhibit).getByRole('slider', { name: 'Marker Y coordinate' }), { target: { value: '22' } });
    expect(within(exhibit).getByText(/East is the nearest eligible plot/i)).not.toBeNull();
    fireEvent.click(within(exhibit).getByRole('button', { name: 'Show capacity overlay' }));
    expect(within(exhibit).getByRole('button', { name: 'Hide capacity overlay' })).not.toBeNull();
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'MAP_MARKER_MOVED', markerId: 'allocation-marker', coordinates: [82, 22], selectedPlot: 'east' }));
    fireEvent.click(within(exhibit).getByRole('button', { name: 'Reset spatial exhibit' }));
    expect(within(exhibit).getByRole('slider', { name: 'Marker X coordinate' })).toHaveProperty('value', '45');
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'INTERACTION_RESET', sceneId: 'spatial-systems' }));
  });

  it('keeps complete project diagrams while changing their inspected stage', () => {
    const events = vi.fn();
    render(<ProjectSystemInspector kind="flow-shop" onWorldEvent={events} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect CP-SAT schedule' }));
    expect(screen.getByRole('status').textContent).toMatch(/CP-SAT schedule/i);
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'PROJECT_OPENED', projectId: 'hybrid-flow-shop-digital-twin', selectedId: 'cp-sat-schedule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset project diagram' }));
    expect(screen.getByRole('status').textContent).toMatch(/Operating constraints/i);

    cleanup();
    render(<ProjectSystemInspector kind="on-the-spectrum" onWorldEvent={events} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Three.js playable-world QA' }));
    expect(screen.getByRole('status').textContent).toMatch(/Three\.js playable-world QA/i);
  });

  it('keeps every handoff visible while the six-blade iris changes state', () => {
    const events = vi.fn();
    render(<DepartureIris onWorldEvent={events} />);
    expect(screen.getAllByTestId('iris-blade')).toHaveLength(6);
    expect(screen.getByRole('link', { name: /Email Rahul/i })).not.toBeNull();
    expect(screen.getByRole('link', { name: /GitHub/i })).not.toBeNull();
    expect(screen.getByRole('link', { name: /LinkedIn/i })).not.toBeNull();
    expect(screen.getByRole('link', { name: /General résumé/i })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate iris' }));
    expect(screen.getByRole('status').textContent).toMatch(/calibrated/i);
    expect(screen.getByRole('link', { name: /Email Rahul/i })).not.toBeNull();
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEPARTURE_COMPLETED', state: 'calibrated' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset iris' }));
    expect(screen.getByRole('status').textContent).toMatch(/open/i);
  });
});
