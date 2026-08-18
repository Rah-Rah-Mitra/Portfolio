import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppearanceProvider } from '../contexts/AppearanceContext';
import NBodyBackground from '../components/NBodyBackground';

class WorkerStub {
  static instances: WorkerStub[] = [];
  messages: Array<{ message: Record<string, unknown>; transfer?: Transferable[] }> = [];
  listeners = new Map<string, EventListener>();
  terminate = vi.fn();
  constructor() { WorkerStub.instances.push(this); }
  addEventListener(type: string, listener: EventListener) { this.listeners.set(type, listener); }
  removeEventListener(type: string) { this.listeners.delete(type); }
  postMessage(message: Record<string, unknown>, transfer?: Transferable[]) { this.messages.push({ message, transfer }); }
}

beforeEach(() => {
  WorkerStub.instances = [];
  localStorage.clear();
  vi.stubGlobal('Worker', WorkerStub);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 17));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NBodyBackground', () => {
  it('initializes a deterministic Worker and advances only from visible animation ticks', async () => {
    render(<AppearanceProvider><NBodyBackground active /></AppearanceProvider>);
    const canvas = screen.getByLabelText('Animated two-dimensional gravitational N-body field');
    expect(canvas.tagName).toBe('CANVAS');
    await waitFor(() => expect(WorkerStub.instances).toHaveLength(1));
    expect(WorkerStub.instances[0]!.messages[0]!.message).toMatchObject({ type: 'initialize', config: { particleCount: 2048, expansionOrder: 8, leafCapacity: 48, seed: 41 } });
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('posts pause without starting an animation loop when activity is suspended', async () => {
    const view = render(<AppearanceProvider><NBodyBackground active /></AppearanceProvider>);
    await waitFor(() => expect(WorkerStub.instances).toHaveLength(1));
    view.rerender(<AppearanceProvider><NBodyBackground active={false} /></AppearanceProvider>);
    expect(WorkerStub.instances[0]!.messages.at(-1)?.message).toEqual({ type: 'pause', paused: true });
  });

  it('normalizes pointer attraction and supports an explicit Reset control', async () => {
    render(<AppearanceProvider><NBodyBackground active /></AppearanceProvider>);
    const canvas = screen.getByLabelText('Animated two-dimensional gravitational N-body field');
    Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) }) });
    fireEvent.pointerMove(canvas, { clientX: 750, clientY: 125 });
    expect(WorkerStub.instances[0]!.messages.at(-1)?.message).toMatchObject({ type: 'pointer', x: 0.5, y: 0.5, active: true });
    fireEvent.click(screen.getByRole('button', { name: 'Reset N-body field' }));
    expect(WorkerStub.instances[0]!.messages.at(-1)?.message).toEqual({ type: 'reset', seed: 41 });
  });
});
