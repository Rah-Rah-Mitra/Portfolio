import type { Group } from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { siteChipLabel } from '../../../../lib/estate/announce';
import { decodeGround } from '../../../../lib/estate/ground';
import { parseNav } from '../../../../lib/estate/nav';
import { decodeWalk } from '../../../../lib/estate/walk';
import type { EstateSiteId } from '../../../../lib/estate/ids';
import {
  EstateScheduler, fetchPriority, planWants, streamCatalogue,
  type BuildingView, type PlanContext, type StreamCatalogue, type StreamClass, type StreamWant,
} from '../../../../lib/estate/scheduler';
import type { EstatePack } from '../../../../lib/estate/schema';
import { fetchBytes, isAbort, PackFetchError, parseGlb, readPayload, type Payload } from './loaders';
import { detailParts, facadeParts, interiorParts, massingParts, siteParts, type DecodedParts, type Part } from './parts';

// Streaming (plan §7.6): the engine side of lib/estate/scheduler.ts. The
// scheduler decides what to fetch, upload and free; this executes: one fetch
// per started id (≤ 4 in flight, aborted when no longer wanted), the sniffing
// read, the GLB decode, and the report back with the start token, so a late
// callback from a superseded fetch is never booked against a restart.
//
// Decoded files are kept whole on the CPU for the engine's life (re-uploads
// after an eviction or a context reset never re-download). Every class decodes
// here: s0, f, d and i are GLBs (parts the scheduler uploads one at a time);
// w (SN5W walk grids, lib/estate/walk.ts), nav (JSON, lib/estate/nav.ts) and
// ground (SN5G, lib/estate/ground.ts) are CPU data with no parts. A file whose
// payload is not what its class must be (a GLB where a walk grid belongs) is a
// decode failure: retried like a network one, then permanent, which for an
// interior, walk or nav file disables entering that building (§7.5).

export interface FileInfo {
  id: string;
  klass: StreamClass;
  site: EstateSiteId | null;
  siteIndex: number;
  /** Stored bytes (what travels). */
  bytes: number;
  /** For the progress label. */
  label: string;
  /** Which stage-0 file this is: the massing (one node per site) or the site layer. */
  stage: 'massing' | 'site' | null;
}

export interface DecodedFile {
  info: FileInfo;
  decoded: DecodedParts;
  parts: Part[];
}

export interface StreamingHooks {
  /** A file decoded and accepted by the scheduler: attach it to the scene. */
  decoded(file: DecodedFile): void;
  /** Something changed that a frame should see (a file arrived, a retry is due). */
  wake(): void;
  /** Stage 0 failed for good: phase error. */
  fatal(message: string): void;
  /** A content-hashed file 404'd: the pack was replaced under this page. */
  stale(url: string): void;
  /** Bytes arrived (for the progress line). */
  progress(): void;
  /**
   * A building's interior, walk grid or nav file failed for good (§7.5): Enter,
   * Plan and walk-in for it are off from now on; F stays whole. `message` is
   * the last failure's.
   */
  entryBlocked?(site: EstateSiteId, message: string): void;
}

export interface StreamingOptions {
  pack: EstatePack;
  /** The pack folder's URL, with a trailing slash. */
  base: string;
  fetchImpl: typeof fetch;
  scheduler: EstateScheduler;
  loader: GLTFLoader;
  now: () => number;
  hooks: StreamingHooks;
  setTimer: (ms: number, run: () => void) => unknown;
}

const CLASS_LABEL: Partial<Record<StreamClass, string>> = { f: 'FAÇADE', d: 'DETAIL', i: 'INTERIOR', w: 'WALKWAY', nav: 'PLAN' };

/** Every streamable file of the pack, by id (its path). */
export const fileIndex = (pack: EstatePack): Map<string, FileInfo> => {
  const index = new Map<string, FileInfo>();
  const add = (id: string | undefined, klass: StreamClass, site: EstateSiteId | null, siteIndex: number, bytes: number,
    stage: FileInfo['stage'] = null) => {
    if (!id) return;
    const label = site === null ? 'STREAMING ESTATE' : `STREAMING ${siteChipLabel(site)} ${CLASS_LABEL[klass] ?? ''}`.trim();
    index.set(id, { id, klass, site, siteIndex, bytes, label, stage });
  };
  if (pack.massing) add(pack.massing.path, 's0', null, -1, pack.massing.bytes, 'massing');
  if (pack.site) {
    add(pack.site.file.path, 's0', null, -1, pack.site.file.bytes, 'site');
    if (pack.site.ground) add(pack.site.ground.path, 'ground', null, -1, pack.site.ground.bytes);
  }
  pack.sites.forEach((site, i) => {
    add(site.facade?.path, 'f', site.id, i, site.facade?.bytes ?? 0);
    add(site.detail?.path, 'd', site.id, i, site.detail?.bytes ?? 0);
    add(site.interior?.path, 'i', site.id, i, site.interior?.bytes ?? 0);
    add(site.walk?.path, 'w', site.id, i, site.walk?.bytes ?? 0);
    add(site.nav?.path, 'nav', site.id, i, site.nav?.bytes ?? 0);
  });
  return index;
};

/** The classes this build decodes: all of them (P5 added i, w, nav and ground). */
export const DECODED_CLASSES: ReadonlySet<StreamClass> = new Set<StreamClass>(['s0', 'f', 'd', 'i', 'w', 'nav', 'ground']);

/** What each class's payload must sniff as, after any gunzip. */
const PAYLOAD_KIND: Readonly<Record<StreamClass, Payload['kind']>> = {
  s0: 'gltf', f: 'gltf', d: 'gltf', i: 'gltf', w: 'sn5w', nav: 'json', ground: 'sn5g',
};

interface Flight { controller: AbortController; token: number }

export class Streaming {
  readonly scheduler: EstateScheduler;
  readonly catalogue: StreamCatalogue;
  readonly files: Map<string, FileInfo>;
  /** Decoded files, by id: the CPU copies. */
  readonly decoded = new Map<string, DecodedFile>();
  private readonly options: StreamingOptions;
  private readonly flights = new Map<string, Flight>();
  private readonly wants: StreamWant[] = [];
  private readonly kept: StreamWant[] = [];
  private readonly noViews: BuildingView[] = [];
  private retryAt = Infinity;
  private closed = false;
  /** Stored bytes received so far, and of the files started, for progress. */
  receivedBytes = 0;
  startedBytes = 0;
  stage0Bytes = 0;
  stage0Received = 0;
  lastLabel: string | null = null;

  constructor(options: StreamingOptions) {
    this.options = options;
    this.scheduler = options.scheduler;
    this.files = fileIndex(options.pack);
    this.catalogue = streamCatalogue(options.pack);
    for (const id of this.catalogue.stage0) this.stage0Bytes += this.files.get(id)?.bytes ?? 0;
  }

  /**
   * Re-plan and start what the slots allow. `views` are the last detail
   * selection's (none before the first frame: then only stage 0 and P4 F would
   * be wanted, so preload passes frozen to keep it to stage 0).
   */
  pump(views: ArrayLike<BuildingView | undefined> | null, context: PlanContext): void {
    if (this.closed) return;
    const scheduler = this.scheduler;
    // Classes this build cannot decode yet are left out of the want-set, or
    // the scheduler would fetch interiors nobody can draw.
    const wants = planWants(this.catalogue, views ?? this.noViews, context, this.wants);
    const kept = this.kept;
    kept.length = 0;
    for (let k = 0; k < wants.length; k += 1) if (DECODED_CLASSES.has(wants[k].klass)) kept.push(wants[k]);
    for (const id of scheduler.setWants(kept)) this.abort(id);
    const now = this.options.now();
    for (const id of scheduler.startDownloads(now)) this.start(id);
    this.armRetry(now);
  }

  private armRetry(now: number) {
    const at = this.scheduler.nextRetryAt(now);
    if (!(at < Infinity) || at >= this.retryAt) return;
    this.retryAt = at;
    this.options.setTimer(Math.max(0, at - now), () => {
      this.retryAt = Infinity;
      if (!this.closed) this.options.hooks.wake();
    });
  }

  private abort(id: string) {
    const flight = this.flights.get(id);
    if (!flight) return;
    this.flights.delete(id);
    flight.controller.abort();
  }

  private start(id: string) {
    const info = this.files.get(id);
    if (!info) return;
    const controller = new AbortController();
    const token = this.scheduler.token(id);
    this.flights.set(id, { controller, token });
    this.startedBytes += info.bytes;
    this.lastLabel = info.label;
    this.options.hooks.progress();
    void this.run(info, controller, token);
  }

  private async run(info: FileInfo, controller: AbortController, token: number) {
    const { options } = this;
    const url = options.base + info.id;
    try {
      const stored = await fetchBytes(options.fetchImpl, url, {
        signal: controller.signal,
        priority: fetchPriority(this.priorityOf(info.id)),
      });
      if (this.closed || controller.signal.aborted) return;
      this.receivedBytes += info.bytes;
      if (info.klass === 's0') this.stage0Received += info.bytes;
      const payload = await readPayload(stored, url);
      const want = PAYLOAD_KIND[info.klass];
      if (payload.kind !== want) throw new PackFetchError(url, null, `${url}: expected ${want}, got ${payload.kind}`);
      const decoded = await this.decodePayload(info, payload);
      if (this.closed) return;
      const parts = decoded.parts;
      if (this.flights.get(info.id)?.token === token) this.flights.delete(info.id);
      if (!this.scheduler.complete(info.id, parts.map((p) => ({ bytes: p.bytes, role: p.role })), token)) return;
      const file = { info, decoded, parts };
      this.decoded.set(info.id, file);
      options.hooks.decoded(file);
      options.hooks.progress();
      options.hooks.wake();
    } catch (error) {
      if (this.flights.get(info.id)?.token === token) this.flights.delete(info.id);
      if (this.closed || isAbort(error)) return;
      const status = error instanceof PackFetchError ? error.status ?? undefined : undefined;
      const outcome = this.scheduler.fail(info.id, options.now(), status, token);
      if (!outcome) return;
      switch (outcome.kind) {
        case 'stale':
          for (const id of outcome.abort) this.abort(id);
          options.hooks.stale(url);
          return;
        case 'fatal':
          options.hooks.fatal(error instanceof Error ? error.message : String(error));
          return;
        case 'retry':
          this.armRetry(options.now());
          return;
        default:
          // A coarser level from now on (lod reads levelCap); for an interior,
          // walk or nav file, entering that building is off from now on.
          if (outcome.entryBlocked && info.site !== null) {
            options.hooks.entryBlocked?.(info.site, error instanceof Error ? error.message : String(error));
          }
          options.hooks.wake();
      }
    }
  }

  /** A payload of the right kind → its decoded form. Throws on a malformed one (a decode failure, retried). */
  private async decodePayload(info: FileInfo, payload: Payload): Promise<DecodedParts> {
    const site = info.siteIndex >= 0 ? this.options.pack.sites[info.siteIndex] : null;
    switch (info.klass) {
      case 'w':
        if (!site) throw new Error(`${info.id}: a walk grid belongs to a site`);
        return { kind: 'walk', parts: [], walk: decodeWalk(payload.bytes, site.id) };
      case 'nav':
        if (!site) throw new Error(`${info.id}: a nav file belongs to a site`);
        return { kind: 'nav', parts: [], nav: parseNav(JSON.parse(new TextDecoder().decode(payload.bytes)), site.id) };
      case 'ground':
        return { kind: 'ground', parts: [], ground: decodeGround(payload.bytes) };
      default: {
        const gltf = await parseGlb(this.options.loader, payload.bytes);
        if (info.klass === 'i') {
          if (!site) throw new Error(`${info.id}: an interior belongs to a site`);
          return interiorParts(gltf.scene, site.storeys);
        }
        return decode(info, gltf.scene);
      }
    }
  }

  private priorityOf(id: string): 0 | 1 | 2 | 3 | 4 {
    for (let k = 0; k < this.kept.length; k += 1) if (this.kept[k].id === id) return this.kept[k].priority;
    return 4;
  }

  /** Parts of a decoded file (eviction, re-upload). */
  partsOf(id: string): readonly Part[] | null {
    return this.decoded.get(id)?.parts ?? null;
  }

  /** Downloads queued or in flight. */
  get pending(): number {
    return this.flights.size;
  }

  /** Aborts every download; nothing starts again. */
  close(): void {
    this.closed = true;
    for (const flight of this.flights.values()) flight.controller.abort();
    this.flights.clear();
  }
}

const decode = (info: FileInfo, scene: Group): DecodedParts => {
  if (info.klass === 'f') return facadeParts(scene);
  if (info.klass === 'd') return detailParts(scene);
  return info.stage === 'massing' ? massingParts(scene) : siteParts(scene);
};
