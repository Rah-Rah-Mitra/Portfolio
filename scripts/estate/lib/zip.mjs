// A minimal zip reader for the release zips (stored and deflate entries, no
// encryption, no zip64). Node builtins only. Upstream's `estate release`
// writes plain deflate-9 zips well under 4 GiB (plan §5.5), so anything else
// is refused rather than half-read.

import { closeSync, openSync, readSync, fstatSync } from 'node:fs';
import { inflateRawSync, crc32 } from 'node:zlib';

const readAt = (fd, offset, length) => {
  const buf = Buffer.alloc(length);
  let got = 0;
  while (got < length) {
    const n = readSync(fd, buf, got, length - got, offset + got);
    if (n === 0) throw new Error(`zip: unexpected end of file at ${offset + got}`);
    got += n;
  }
  return buf;
};

/** Opens a zip and lists its entries: [{ name, method, crc, csize, size, offset }]. */
export const openZip = (path) => {
  const fd = openSync(path, 'r');
  const size = fstatSync(fd).size;
  const tailLen = Math.min(size, 65557);
  const tail = readAt(fd, size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) { closeSync(fd); throw new Error(`zip: ${path} has no end-of-central-directory record`); }
  const count = tail.readUInt16LE(eocd + 10);
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) { closeSync(fd); throw new Error(`zip: ${path} is zip64, which this reader refuses`); }
  const cd = readAt(fd, cdOffset, cdSize);
  const entries = [];
  let at = 0;
  for (let k = 0; k < count; k += 1) {
    if (cd.readUInt32LE(at) !== 0x02014b50) { closeSync(fd); throw new Error(`zip: bad central directory entry ${k}`); }
    const flags = cd.readUInt16LE(at + 8);
    const method = cd.readUInt16LE(at + 10);
    const crc = cd.readUInt32LE(at + 16);
    const csize = cd.readUInt32LE(at + 20);
    const usize = cd.readUInt32LE(at + 24);
    const nameLen = cd.readUInt16LE(at + 28);
    const extraLen = cd.readUInt16LE(at + 30);
    const commentLen = cd.readUInt16LE(at + 32);
    const offset = cd.readUInt32LE(at + 42);
    const name = cd.toString('utf8', at + 46, at + 46 + nameLen);
    if (flags & 1) { closeSync(fd); throw new Error(`zip: ${name} is encrypted`); }
    if (method !== 0 && method !== 8) { closeSync(fd); throw new Error(`zip: ${name} uses method ${method}`); }
    if (csize === 0xffffffff || usize === 0xffffffff || offset === 0xffffffff) { closeSync(fd); throw new Error(`zip: ${name} needs zip64`); }
    entries.push({ name, method, crc, csize, size: usize, offset });
    at += 46 + nameLen + extraLen + commentLen;
  }
  const read = (entry) => {
    const local = readAt(fd, entry.offset, 30);
    if (local.readUInt32LE(0) !== 0x04034b50) throw new Error(`zip: ${entry.name} has no local header`);
    const start = entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    const data = readAt(fd, start, entry.csize);
    const out = entry.method === 0 ? data : inflateRawSync(data);
    if (out.length !== entry.size) throw new Error(`zip: ${entry.name} inflated to ${out.length} B, expected ${entry.size}`);
    if ((crc32(out) >>> 0) !== entry.crc) throw new Error(`zip: ${entry.name} fails its CRC`);
    return out;
  };
  return { entries, read, close: () => closeSync(fd) };
};
