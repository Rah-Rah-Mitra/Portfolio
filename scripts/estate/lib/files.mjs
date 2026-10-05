// Content-hashed pack files (plan §6.2 step 10, decision C9). Node builtins only.
//
// A file is named by sha256 of its RAW payload, never of its gzip bytes: zlib
// builds and platforms differ in what they emit for the same input (V3 found
// the OS byte alone varies), and the name has to survive a rebuild on another
// machine. The gzip is still made deterministic: level 9, mtime 0, and header
// byte 9 (OS) forced to 0xff ("unknown").

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync, gzipSync, constants } from 'node:zlib';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** gzip, level 9, mtime 0, OS byte 0xff. Node writes no FNAME/FCOMMENT, so the header is 10 bytes. */
export const gzipDeterministic = (raw) => {
  const gz = gzipSync(raw, { level: 9, memLevel: 9, strategy: constants.Z_DEFAULT_STRATEGY });
  if (gz[0] !== 0x1f || gz[1] !== 0x8b || gz[2] !== 8) throw new Error('zlib did not write a gzip header');
  if (gz[3] !== 0) throw new Error(`gzip flags 0x${gz[3].toString(16)}: expected none`);
  gz[4] = 0; gz[5] = 0; gz[6] = 0; gz[7] = 0; // MTIME = 0
  gz[9] = 0xff; // OS = unknown
  return gz;
};

export const gunzip = (gz) => gunzipSync(gz);

/**
 * Writes one pack file and returns its FileRef. `stem` is the path without
 * the hash and extension (`f/BLK_509`), `ext` the extension after the hash
 * (`glb.gz`, `walk.gz`, `json`, `webp`). When `gzip` is true the stored bytes
 * are the gzip of `raw`; otherwise raw is stored and bytes = rawBytes.
 */
export const writeHashed = (outDir, stem, ext, raw, { gzip }) => {
  const buf = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  const hash = sha256(buf);
  const path = `${stem}.${hash.slice(0, 8)}.${ext}`;
  const stored = gzip ? gzipDeterministic(buf) : buf;
  const full = join(outDir, ...path.split('/'));
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, stored);
  return { path, bytes: stored.length, rawBytes: buf.length, sha256: hash, gzSha256: sha256(stored) };
};
