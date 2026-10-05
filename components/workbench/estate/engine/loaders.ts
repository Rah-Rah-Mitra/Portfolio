import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Fetching and decoding pack files (plan §7.6, decision C7, C9). Every file is
// stored pre-gzipped and named by its raw payload's hash, so what arrives may
// be the gzip bytes (a static host that serves .gz as a plain file) or already
// inflated (one that sets Content-Encoding: gzip). The first bytes say which:
//   1F 8B  → gzip, inflated here with DecompressionStream('gzip');
//   glTF   → a GLB, used as is;
//   SN5W   → a walk grid (P5), used as is;
// and after inflating, the same sniff runs once more (a nav file is JSON, the
// ground SN5G). Anything else is an error, never guessed at.
//
// GLBs go through three's GLTFLoader with the meshopt decoder. The decoder is a
// module singleton shared by every engine on the page, so its two workers are
// reference-counted: started by the first engine that needs them, stopped when
// the last one is disposed (useWorkers(0) asks each worker to close).

export type PayloadKind = 'gzip' | 'gltf' | 'sn5w' | 'sn5g' | 'json' | 'unknown';

const ascii = (bytes: Uint8Array, at: number, text: string): boolean => {
  if (bytes.length < at + text.length) return false;
  for (let i = 0; i < text.length; i += 1) if (bytes[at + i] !== text.charCodeAt(i)) return false;
  return true;
};

/** What the first bytes say a payload is. */
export const sniff = (bytes: Uint8Array): PayloadKind => {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip';
  if (ascii(bytes, 0, 'glTF')) return 'gltf';
  if (ascii(bytes, 0, 'SN5W')) return 'sn5w';
  if (ascii(bytes, 0, 'SN5G')) return 'sn5g';
  // JSON: optional whitespace, then an object or array.
  for (let i = 0; i < bytes.length && i < 64; i += 1) {
    const b = bytes[i];
    if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) continue;
    return b === 0x7b || b === 0x5b ? 'json' : 'unknown';
  }
  return 'unknown';
};

/** Inflates gzip bytes with the platform's DecompressionStream (no JavaScript inflater in the chunk). */
export const gunzip = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** A pack file that could not be had. `status` is the HTTP status when there was a response. */
export class PackFetchError extends Error {
  readonly status: number | null;
  readonly url: string;
  constructor(url: string, status: number | null, message: string) {
    super(message);
    this.name = 'PackFetchError';
    this.status = status;
    this.url = url;
  }
}

export const isAbort = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';

export interface FetchOptions {
  signal?: AbortSignal;
  priority?: 'high' | 'auto' | 'low';
}

/** GET a pack file's stored bytes. Throws PackFetchError (with the status) on anything but 2xx. */
export const fetchBytes = async (fetchImpl: typeof fetch, url: string, options: FetchOptions = {}): Promise<Uint8Array> => {
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: options.signal, priority: options.priority, credentials: 'same-origin' });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new PackFetchError(url, null, `${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new PackFetchError(url, response.status, `${url}: HTTP ${response.status}`);
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new PackFetchError(url, null, `${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export interface Payload {
  kind: Exclude<PayloadKind, 'gzip' | 'unknown'>;
  bytes: Uint8Array;
}

/** Stored bytes → the payload: gunzip when the bytes are gzip, then sniff again. Throws on an unknown kind. */
export const readPayload = async (stored: Uint8Array, url = 'payload'): Promise<Payload> => {
  let bytes = stored;
  let kind = sniff(bytes);
  if (kind === 'gzip') {
    bytes = await gunzip(bytes);
    kind = sniff(bytes);
    if (kind === 'gzip') throw new PackFetchError(url, null, `${url}: gzip inside gzip`);
  }
  if (kind === 'unknown') throw new PackFetchError(url, null, `${url}: not a pack payload (first bytes unknown)`);
  return { kind, bytes };
};

/** The ArrayBuffer GLTFLoader wants: the payload's own bytes, copied only when it is a view into a larger buffer. */
const ownBuffer = (bytes: Uint8Array): ArrayBuffer => (
  bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer
    ? bytes.buffer
    : bytes.slice().buffer as ArrayBuffer
);

// ---- the decoder ------------------------------------------------------------------------------

let decoderUsers = 0;
const DECODER_WORKERS = 2;

/**
 * One engine's claim on the meshopt decoder. The first claim starts its two
 * workers (where Worker exists: not in node tests, which decode on the main
 * thread); release() is idempotent, and the last one stops them.
 */
export const claimDecoder = (): (() => void) => {
  decoderUsers += 1;
  if (decoderUsers === 1 && typeof Worker !== 'undefined') MeshoptDecoder.useWorkers(DECODER_WORKERS);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    decoderUsers -= 1;
    if (decoderUsers === 0 && typeof Worker !== 'undefined') MeshoptDecoder.useWorkers(0);
  };
};

/** A GLTFLoader with the meshopt decoder, one per engine. */
export const createGlbLoader = (): GLTFLoader => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** Parse a GLB payload. Waits for the decoder's wasm first. */
export const parseGlb = async (loader: GLTFLoader, bytes: Uint8Array): Promise<GLTF> => {
  await MeshoptDecoder.ready;
  return loader.parseAsync(ownBuffer(bytes), '');
};
