import type { CameraShotDefinition, ResolvedWorldAnchor, ResponsiveTier, Vector3Tuple, WorldAnchorDefinition } from '../types';

type InvalidationReason = 'fonts' | 'resize' | 'orientation' | 'viewport' | 'project-expansion' | 'media' | 'mutation' | 'zoom';
type FrameRequest = (callback: FrameRequestCallback) => number;

interface RegistryOptions {
  getViewport?: () => { width: number; height: number };
  refresh: () => void;
  requestFrame?: FrameRequest;
  cancelFrame?: (handle: number) => void;
}

const add = (a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (value: Vector3Tuple, factor: number): Vector3Tuple => [value[0] * factor, value[1] * factor, value[2] * factor];
const normalize = (value: Vector3Tuple): Vector3Tuple => {
  const length = Math.hypot(...value) || 1;
  return scale(value, 1 / length);
};
const cross = (a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export class WorldAnchorRegistry {
  private definitions = new Map<string, WorldAnchorDefinition>();
  private frame: number | null = null;
  private destroyed = false;
  private options: Required<RegistryOptions>;
  private teardown: Array<() => void> = [];
  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;
  private observedMedia = new WeakSet<EventTarget>();

  constructor(options: RegistryOptions) {
    this.options = {
      getViewport: options.getViewport ?? (() => ({ width: window.innerWidth, height: window.innerHeight })),
      refresh: options.refresh,
      requestFrame: options.requestFrame ?? window.requestAnimationFrame.bind(window),
      cancelFrame: options.cancelFrame ?? window.cancelAnimationFrame.bind(window),
    };
  }

  register(definition: WorldAnchorDefinition) { this.definitions.set(definition.id, definition); return () => this.definitions.delete(definition.id); }

  start() {
    if (typeof document === 'undefined') return;
    document.fonts?.ready.then(() => this.invalidate('fonts'));
    const listen = (target: EventTarget, name: string, handler: EventListener) => { target.addEventListener(name, handler); this.teardown.push(() => target.removeEventListener(name, handler)); };
    listen(window, 'orientationchange', () => this.invalidate('orientation'));
    listen(window, 'portfolio:projects-expanded', () => this.invalidate('project-expansion'));
    if (window.visualViewport) {
      listen(window.visualViewport, 'resize', () => this.invalidate('viewport'));
      listen(window.visualViewport, 'scroll', () => this.invalidate('zoom'));
    }
    const attachMedia = (media: Element) => {
      if (this.observedMedia.has(media)) return;
      this.observedMedia.add(media);
      listen(media, 'load', () => this.invalidate('media'));
      if (media instanceof HTMLVideoElement) listen(media, 'loadedmetadata', () => this.invalidate('media'));
    };
    document.querySelectorAll('img,video').forEach(attachMedia);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.invalidate('resize'));
      this.resizeObserver.observe(document.documentElement);
    }
    this.mutationObserver = new MutationObserver((records) => { records.forEach((record) => record.addedNodes.forEach((node) => { if (!(node instanceof Element)) return; if (node.matches('img,video')) attachMedia(node); node.querySelectorAll('img,video').forEach(attachMedia); })); this.invalidate('mutation'); });
    this.mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  invalidate(_reason: InvalidationReason) {
    if (this.destroyed || this.frame !== null) return;
    this.frame = this.options.requestFrame(() => {
      this.frame = this.options.requestFrame(() => {
        this.frame = null;
        if (!this.destroyed) this.options.refresh();
      });
    });
  }

  resolve(shot: CameraShotDefinition, tier: ResponsiveTier): ResolvedWorldAnchor[] {
    const viewport = this.options.getViewport();
    const forward = normalize([shot.target[0] - shot.position[0], shot.target[1] - shot.position[1], shot.target[2] - shot.position[2]]);
    const right = normalize(cross([0, 1, 0], forward));
    const up = normalize(cross(forward, right));
    return [...this.definitions.values()].flatMap((authored) => {
      const element = document.getElementById(authored.elementId);
      if (!element) return [];
      const override = tier === 'desktop' ? undefined : authored.responsive?.[tier];
      const definition = { ...authored, ...override, responsive: authored.responsive };
      const screenRect = element.getBoundingClientRect();
      const centerX = screenRect.left + screenRect.width / 2;
      const centerY = screenRect.top + screenRect.height / 2;
      const depth = definition.projectionDepth;
      const halfHeight = Math.tan(shot.fov * Math.PI / 360) * depth;
      const halfWidth = halfHeight * viewport.width / viewport.height;
      const offsetX = (centerX / viewport.width * 2 - 1) * halfWidth;
      const offsetY = (1 - centerY / viewport.height * 2) * halfHeight;
      const onRay = add(add(add(shot.position, scale(forward, depth)), scale(right, offsetX)), scale(up, offsetY));
      const safeTextIds = [...new Set([...(definition.occluderElementIds ?? []), ...(shot.safeTextRegionIds ?? [])])];
      const safeTextRects = safeTextIds.flatMap((id) => {
        const occluder = document.getElementById(id);
        return occluder ? [occluder.getBoundingClientRect()] : [];
      });
      return [{ ...definition, screenRect, worldPosition: add(onRay, definition.worldOffset), safeTextRects } as ResolvedWorldAnchor];
    });
  }

  destroy() {
    this.destroyed = true;
    if (this.frame !== null) this.options.cancelFrame(this.frame);
    this.frame = null;
    this.resizeObserver?.disconnect(); this.mutationObserver?.disconnect();
    this.teardown.splice(0).forEach((dispose) => dispose());
    this.definitions.clear();
  }
}
