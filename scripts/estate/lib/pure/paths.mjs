// Path and leak rules for the estate pack (plan §6.2 step 15). Imports nothing.
//
// packPathProblem is a byte-for-byte port of lib/estate/schema.ts
// packPathProblem: the pack tool runs under plain Node 24 without a TypeScript
// toolchain, and lib/estate's modules use extensionless imports Node's ESM
// loader cannot resolve, so the few pure rules the tool needs are duplicated
// here and tests/estate-pipeline-pure.test.ts imports both sides and proves
// they agree on every case it can think of. Change both or neither.

/** The pack-relative path alphabet (schema.ts PACK_PATH). */
export const PACK_PATH = /^[A-Za-z0-9._/-]+$/;

/** Why `path` is not a safe pack-relative path, or null when it is (schema.ts packPathProblem). */
export const packPathProblem = (path) => {
  if (!path) return 'empty path';
  if (path.includes('\\')) return 'backslash in path';
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'absolute path';
  const segments = path.split('/');
  if (segments.includes('..')) return "'..' segment";
  if (!PACK_PATH.test(path)) return 'characters outside [A-Za-z0-9._/-]';
  if (segments.some((s) => s === '' || s === '.')) return "empty or '.' segment";
  return null;
};

// The leak pattern (plan §5.5, §6.2 step 15, U1's tests/test_leaks.py): a
// Windows drive path, a macOS or Windows home folder, or the username.
export const LEAK_SOURCE = String.raw`[A-Za-z]:\\|/Users/|\\Users\\|rapiular`;
export const LEAK_PATTERN = new RegExp(LEAK_SOURCE);

// In binary payloads (meshopt-compressed geometry, int16 rasters, image data)
// three bytes like "C:\" turn up by chance about once per 330 KB, so a scan of
// a 10 MB pack with the drive-letter alternative would refuse a clean pack
// most runs. Binary payloads never hold strings: every string a GLB carries is
// in its JSON chunk, which is scanned as text with the full pattern. Binary
// spans are scanned for the literals that cannot occur by chance (≥ 7 bytes,
// p ≈ 2^-56 per offset) — and any drive path under a home folder still trips
// them, because it contains "\Users\".
export const BINARY_LEAK_LITERALS = ['/Users/', '\\Users\\', 'rapiular'];

const latin1 = (bytes) => {
  // Decode in slices: String.fromCharCode.apply on a 10 MB array overflows the stack.
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
  }
  return out;
};

/** The first leak in a text span (bytes or string), as { offset, match }, or null. */
export const textLeak = (data) => {
  const text = typeof data === 'string' ? data : latin1(data);
  const m = LEAK_PATTERN.exec(text);
  return m ? { offset: m.index, match: m[0] } : null;
};

/** The first leak literal in a binary span, as { offset, match }, or null. */
export const binaryLeak = (bytes) => {
  const text = latin1(bytes);
  let best = null;
  for (const lit of BINARY_LEAK_LITERALS) {
    const at = text.indexOf(lit);
    if (at >= 0 && (best === null || at < best.offset)) best = { offset: at, match: lit };
  }
  return best;
};

/**
 * Splits a GLB into its spans: the JSON chunk is text, everything else binary.
 * Returns null when the bytes are not a well-formed GLB 2.0 container.
 */
export const glbSpans = (bytes) => {
  if (bytes.length < 20) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) return null;
  if (dv.getUint32(8, true) !== bytes.length) return null;
  const spans = [{ kind: 'binary', start: 0, end: 12 }];
  let at = 12;
  while (at < bytes.length) {
    if (at + 8 > bytes.length) return null;
    const len = dv.getUint32(at, true);
    const type = dv.getUint32(at + 4, true);
    const end = at + 8 + len;
    if (end > bytes.length) return null;
    spans.push({ kind: 'binary', start: at, end: at + 8 });
    spans.push({ kind: type === 0x4e4f534a ? 'text' : 'binary', start: at + 8, end });
    at = end;
  }
  return spans;
};

/**
 * Scans one decoded payload. `kind` is 'text' (JSON, TS, txt), 'glb' (JSON
 * chunk as text, the rest binary) or 'binary'. Returns the first hit as
 * { offset, match } or null. A GLB that does not parse is scanned as text, so a
 * malformed file fails closed rather than slipping through as "binary".
 */
export const leakInPayload = (bytes, kind) => {
  if (kind === 'text') return textLeak(bytes);
  if (kind === 'glb') {
    const spans = glbSpans(bytes);
    if (!spans) return textLeak(bytes) ?? { offset: 0, match: '(not a GLB: refusing an unparseable payload)' };
    for (const span of spans) {
      const slice = bytes.subarray(span.start, span.end);
      const hit = span.kind === 'text' ? textLeak(slice) : binaryLeak(slice);
      if (hit) return { offset: span.start + hit.offset, match: hit.match };
    }
    return null;
  }
  return binaryLeak(bytes);
};

/** How a pack file's decoded payload is scanned, from its name. */
export const payloadKind = (path) => {
  if (/\.glb(\.gz)?$/.test(path)) return 'glb';
  if (/\.(json|ts|txt|md)$/.test(path)) return 'text';
  return 'binary';
};
