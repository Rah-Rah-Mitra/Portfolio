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

  it('marks the inspected operation and its predecessors in the shared Gantt result', () => {
    render(<FlowShopExhibit />);
    const exhibit = screen.getByRole('region', { name: 'Systems in Motion' });
    fireEvent.focus(within(exhibit).getByRole('button', { name: '10–12' }));
    expect(within(exhibit).getByRole('button', { name: '10–12' }).getAttribute('aria-current')).toBe('true');
    expect(exhibit.querySelector('[data-operation-id="B-M2"]')?.classList.contains('is-inspected')).toBe(true);
    expect(exhibit.querySelector('[data-operation-id="A-M2"]')?.classList.contains('is-predecessor')).toBe(true);
    expect(exhibit.querySelector('[data-operation-id="B-M1"]')?.classList.contains('is-predecessor')).toBe(true);
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

  it('preserves touch scrolling and cancels active direct manipulation through global listeners', () => {
    const events = vi.fn();
    const view = render(<SpatialSystemsExhibit onWorldEvent={events} />);
    const marker = screen.getByRole('button', { name: 'Move allocation marker' }) as HTMLButtonElement;
    expect(marker.getAttribute('data-touch-policy')).toBe('pan-y');
    expect(screen.getByText(/On touch, drag horizontally to move X/i)).not.toBeNull();
    Object.defineProperty(marker.parentElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) }),
    });
    Object.defineProperty(marker, 'setPointerCapture', { configurable: true, value: vi.fn() });
    Object.defineProperty(marker, 'hasPointerCapture', { configurable: true, value: vi.fn(() => true) });
    Object.defineProperty(marker, 'releasePointerCapture', { configurable: true, value: vi.fn() });

    fireEvent.pointerDown(marker, { pointerId: 17, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerMove(marker, { pointerId: 17, pointerType: 'touch', clientX: 14, clientY: 35 });
    expect(marker.getAttribute('data-interaction-state')).toBe('primed');
    expect(marker.setPointerCapture).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'INTERACTION_CHANGED', detail: 'marker-drag-started' }));
    fireEvent.pointerCancel(marker, { pointerId: 17, pointerType: 'touch' });
    events.mockClear();

    fireEvent.pointerDown(marker, { pointerId: 18, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerMove(marker, { pointerId: 18, pointerType: 'touch', clientX: 25, clientY: 12 });
    expect(marker.getAttribute('data-interaction-state')).toBe('dragging');
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'INTERACTION_CHANGED', detail: 'marker-drag-started' }));
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'INTERACTION_CHANGED', detail: expect.stringMatching(/^marker:/) }));
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'MAP_MARKER_MOVED' }));
    expect(screen.getByRole('slider', { name: 'Marker Y coordinate' })).toHaveProperty('value', '44');

    fireEvent.scroll(window);
    expect(marker.getAttribute('data-interaction-state')).toBe('idle');
    expect(marker.getAttribute('data-control-owner')).toBe('story');
    expect(marker.releasePointerCapture).toHaveBeenCalledWith(18);
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'INTERACTION_CHANGED', detail: 'cancelled:scroll' }));

    const callsBeforeUnmount = events.mock.calls.length;
    view.unmount();
    fireEvent.scroll(window);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(events).toHaveBeenCalledTimes(callsBeforeUnmount);
  });

  it('cancels active manipulation on global Escape and restores story ownership', () => {
    const events = vi.fn();
    render(<SpatialSystemsExhibit onWorldEvent={events} />);
    const marker = screen.getByRole('button', { name: 'Move allocation marker' }) as HTMLButtonElement;
    Object.defineProperty(marker, 'setPointerCapture', { configurable: true, value: vi.fn() });
    Object.defineProperty(marker, 'hasPointerCapture', { configurable: true, value: vi.fn(() => true) });
    Object.defineProperty(marker, 'releasePointerCapture', { configurable: true, value: vi.fn() });
    fireEvent.pointerDown(marker, { pointerId: 9, pointerType: 'mouse', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(marker, { pointerId: 9, pointerType: 'mouse', clientX: 9, clientY: 0 });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(marker.getAttribute('data-interaction-state')).toBe('idle');
    expect(marker.getAttribute('data-control-owner')).toBe('story');
    expect(marker.releasePointerCapture).toHaveBeenCalledWith(9);
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'INTERACTION_CHANGED', detail: 'cancelled:escape' }));
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
