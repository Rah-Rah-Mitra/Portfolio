import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupportingMedia } from '../components/SupportingMedia';
import type { ProjectMedia } from '../types';

const media: ProjectMedia = {
  id: 'camera-lab-composite', kind: 'video', posterSrc: '/media/camera-lab-poster.webp',
  webmSrc: '/media/camera-lab.webm', mp4Src: '/media/camera-lab.mp4', durationSeconds: 4.04,
  width: 768, height: 512, alt: 'Optical test bench calibration mechanism.',
  transcript: 'A camera rail moves beside an aperture and teal calibration rays.',
  workflowId: 'ltxv-fast-t2v-distilled', provenanceId: 'camera-lab-composite-6081701', loadPriority: 'lazy',
};

class ObserverMock {
  static callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) { ObserverMock.callback = callback; }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
  root = null; rootMargin = ''; thresholds = [0];
}

describe('SupportingMedia', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', ObserverMock);
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('renders poster, accessible label, transcript, preload none, and visible control', () => {
    render(<SupportingMedia media={media} policy={{ attach: true, motionEnabled: true }} />);
    const video = screen.getByLabelText(media.alt) as HTMLVideoElement;
    expect(video.poster).toContain(media.posterSrc);
    expect(video.preload).toBe('none');
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.querySelectorAll('source')).toHaveLength(2);
    expect(screen.getByText(media.transcript!)).not.toBeNull();
    expect(screen.getByRole('button', { name: /play camera lab composite/i })).not.toBeNull();
  });

  it('omits sources in constrained policy and pauses when it leaves the viewport', async () => {
    const { rerender } = render(<SupportingMedia media={media} policy={{ attach: false, motionEnabled: false }} />);
    expect(screen.getByLabelText(media.alt).querySelectorAll('source')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /play camera/i })).toBeNull();
    rerender(<SupportingMedia media={media} policy={{ attach: true, motionEnabled: true }} />);
    const video = screen.getByLabelText(media.alt) as HTMLVideoElement;
    ObserverMock.callback([{ isIntersecting: true, intersectionRatio: .6, target: video } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    fireEvent.click(screen.getByRole('button', { name: /play camera/i }));
    expect(video.play).toHaveBeenCalled();
    ObserverMock.callback([{ isIntersecting: false, intersectionRatio: 0, target: video } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(video.pause).toHaveBeenCalled();
  });

  it('stops and unloads media when FX disables playback after attachment', () => {
    const { rerender } = render(<SupportingMedia media={media} policy={{ attach: true, motionEnabled: true }} />);
    const video = screen.getByLabelText(media.alt) as HTMLVideoElement;
    Object.defineProperty(video, 'load', { configurable: true, value: vi.fn() });

    rerender(<SupportingMedia media={media} policy={{ attach: false, motionEnabled: false }} />);

    expect(video.pause).toHaveBeenCalled();
    expect(video.load).toHaveBeenCalled();
    expect(video.querySelectorAll('source')).toHaveLength(0);
  });
});
