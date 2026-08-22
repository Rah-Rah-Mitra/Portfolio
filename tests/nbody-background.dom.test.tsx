import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { AppearanceProvider, useAppearance } from '../contexts/AppearanceContext';
import NBodyBackground from '../components/NBodyBackground';

const PatchProbe: React.FC = () => {
  const { patchNBody } = useAppearance();
  return <button type="button" onClick={() => patchNBody({ particleCount: 1024 })}>Patch bodies</button>;
};

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

  it('keeps stepping through a replacement worker after a configuration change', async () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    (requestAnimationFrame as unknown as ReturnType<typeof vi.fn>).mockImplementation((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    render(<AppearanceProvider><NBodyBackground active /><PatchProbe /></AppearanceProvider>);
    await waitFor(() => expect(WorkerStub.instances).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Patch bodies' }));
    await waitFor(() => expect(WorkerStub.instances).toHaveLength(2));
    const [first, second] = WorkerStub.instances;
    expect(first!.terminate).toHaveBeenCalled();
    expect(second!.messages[0]!.message).toMatchObject({ type: 'initialize', config: { particleCount: 1024 } });

    second!.listeners.get('message')?.({ data: { type: 'ready', effectiveParticleCount: 1024 } } as unknown as Event);
    const tick = frameCallbacks.at(-1);
    expect(tick).toBeDefined();
    tick!(1000);
    const stepped = second!.messages.find((entry) => (entry.message as { type?: string }).type === 'step');
    expect(stepped).toBeDefined();
    expect(first!.messages.some((entry) => (entry.message as { type?: string }).type === 'step')).toBe(false);
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
