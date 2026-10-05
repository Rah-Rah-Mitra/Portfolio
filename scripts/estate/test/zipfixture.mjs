// A deflate zip writer for the tests, just enough for lib/zip.mjs (no zip64, no extras).

import { writeFileSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';

export const writeZip = (path, entries) => {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, data] of entries) {
    const n = Buffer.from(name); const comp = deflateRawSync(data); const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, comp); centrals.push(central, n);
    offset += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(path, Buffer.concat([...locals, cd, end]));
};
