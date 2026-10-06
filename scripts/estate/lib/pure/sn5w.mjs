// SN5W walk-grid headers (plan §5.2) and the SN5G ground raster (§6.2 step
// 6e). Imports nothing.
//
// readWalkHeader reads the header and layer table the way lib/estate/walk.ts
// decodeWalk does, and checks the same header rules; the pack needs only the
// grid's placement and the layer tags to fill pack.json and to refuse a file
// built for other storeys. tests/estate-pipeline-pure.test.ts runs both over
// the same synthetic files. The rasters themselves are the runtime's business.

export const WALK_HEADER_BYTES = 64;
export const WALK_LAYER_BYTES = 32;
const MODES = ['raw', 'delta', 'same'];

// The shortest decimal that rounds to the same float32 (walk.ts f32Decimal), so
// 0.1 reads back as 0.1, not 0.10000000149011612.
const f32Decimal = (v) => {
  if (!Number.isFinite(v)) return v;
  for (let p = 1; p < 9; p += 1) {
    const d = Number(v.toPrecision(p));
    if (Math.fround(d) === v) return d;
  }
  return v;
};

const fail = (offset, problem) => { throw new Error(`SN5W @${offset}: ${problem}`); };

/** The header and layer table of an SN5W v1 file (raw bytes, not gzip). */
export const readWalkHeader = (bytes) => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = bytes.byteLength;
  if (size < WALK_HEADER_BYTES) fail(0, `${size} bytes is shorter than the header`);
  if (bytes[0] !== 0x53 || bytes[1] !== 0x4e || bytes[2] !== 0x35 || bytes[3] !== 0x57) fail(0, 'magic is not "SN5W"');
  const version = dv.getUint16(4, true);
  if (version !== 1) fail(4, `version ${version}; this reader knows 1`);
  const flags = dv.getUint16(6, true);
  if (flags & ~3) fail(6, `unknown flag bits 0x${flags.toString(16)}`);
  const cell = f32Decimal(dv.getFloat32(8, true));
  const radius = f32Decimal(dv.getFloat32(12, true));
  const step = f32Decimal(dv.getFloat32(16, true));
  const origin = [f32Decimal(dv.getFloat32(20, true)), f32Decimal(dv.getFloat32(24, true))];
  const nx = dv.getUint16(28, true), ny = dv.getUint16(30, true), count = dv.getUint16(32, true), refLayer = dv.getUint16(34, true);
  if (!(cell > 0)) fail(8, `cell ${cell}`);
  if (!nx || !ny) fail(28, 'empty grid');
  if (!count) fail(32, 'no layers');
  if (refLayer >= count) fail(34, `reference layer ${refLayer} of ${count}`);
  for (let o = 36; o < WALK_HEADER_BYTES; o += 1) if (bytes[o] !== 0) fail(o, 'reserved byte is not 0');
  if (size < WALK_HEADER_BYTES + WALK_LAYER_BYTES * count) fail(WALK_HEADER_BYTES, 'layer table runs past the end');
  const layers = [];
  for (let i = 0; i < count; i += 1) {
    const at = WALK_HEADER_BYTES + WALK_LAYER_BYTES * i;
    let tag = '';
    for (let k = 0; k < 4; k += 1) { const c = bytes[at + k]; if (c) tag += String.fromCharCode(c); }
    const mode = MODES[bytes[at + 8]];
    if (mode === undefined) fail(at + 8, `mode ${bytes[at + 8]}`);
    layers.push({ tag, ffl: f32Decimal(dv.getFloat32(at + 4, true)), mode });
  }
  return { version, flags, coarse: (flags & 2) !== 0, cell, radius, step, origin, nx, ny, refLayer, layers };
};

// ---- SN5G: outdoor ground heights ----------------------------------------------------
//
// Little-endian, 32-byte header then one int16 per cell:
//   0 char[4] "SN5G"  4 u16 version=1  6 u16 flags=0
//   8 f32 cell (0.5)  12 f32 lo_x  16 f32 lo_y   (estate frame, the grid's south-west corner)
//  20 u16 nx  22 u16 ny  24 i16 nodata (0x7FFF)  26 u16 reserved  28 u32 reserved
//  32 int16[nx·ny], index iy·nx + ix: the top ground height at the cell's centre
//     (lo + (i + 0.5)·cell), in centimetres; nodata where no ground surface covers it.
// The magic makes the payload sniffable after gunzip, like glTF and SN5W.

export const GROUND_HEADER_BYTES = 32;
export const GROUND_NODATA = 0x7fff;

export const writeGround = ({ cell, lo, nx, ny, heightsCm }) => {
  if (heightsCm.length !== nx * ny) throw new Error('ground raster size mismatch');
  const buf = new Uint8Array(GROUND_HEADER_BYTES + nx * ny * 2);
  const dv = new DataView(buf.buffer);
  buf.set([0x53, 0x4e, 0x35, 0x47], 0); // "SN5G"
  dv.setUint16(4, 1, true);
  dv.setUint16(6, 0, true);
  dv.setFloat32(8, cell, true);
  dv.setFloat32(12, lo[0], true);
  dv.setFloat32(16, lo[1], true);
  dv.setUint16(20, nx, true);
  dv.setUint16(22, ny, true);
  dv.setInt16(24, GROUND_NODATA, true);
  for (let i = 0; i < heightsCm.length; i += 1) dv.setInt16(GROUND_HEADER_BYTES + i * 2, heightsCm[i], true);
  return buf;
};

export const readGround = (bytes) => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < GROUND_HEADER_BYTES || bytes[0] !== 0x53 || bytes[1] !== 0x4e || bytes[2] !== 0x35 || bytes[3] !== 0x47) throw new Error('not an SN5G file');
  if (dv.getUint16(4, true) !== 1) throw new Error('SN5G version is not 1');
  const cell = f32Decimal(dv.getFloat32(8, true));
  const lo = [f32Decimal(dv.getFloat32(12, true)), f32Decimal(dv.getFloat32(16, true))];
  const nx = dv.getUint16(20, true), ny = dv.getUint16(22, true);
  if (bytes.byteLength !== GROUND_HEADER_BYTES + nx * ny * 2) throw new Error('SN5G size does not match its grid');
  const heightsCm = new Int16Array(nx * ny);
  for (let i = 0; i < heightsCm.length; i += 1) heightsCm[i] = dv.getInt16(GROUND_HEADER_BYTES + i * 2, true);
  return { cell, lo, nx, ny, nodata: dv.getInt16(24, true), heightsCm };
};

/**
 * Rasterises the top height of upward-facing ground triangles (estate frame,
 * Z up: three [x, y, z] each, flattened 9 per triangle) at each cell centre.
 * Cells nothing covers stay nodata. Heights round to the nearest centimetre.
 */
export const rasterGround = (tris, { cell, lo, nx, ny }) => {
  const top = new Float64Array(nx * ny).fill(-Infinity);
  for (let o = 0; o < tris.length; o += 9) {
    const ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
    const bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5];
    const cx = tris[o + 6], cy = tris[o + 7], cz = tris[o + 8];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue; // vertical or degenerate: no top surface
    const ix0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - lo[0]) / cell - 0.5));
    const ix1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - lo[0]) / cell - 0.5));
    const iy0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - lo[1]) / cell - 0.5));
    const iy1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - lo[1]) / cell - 0.5));
    for (let iy = iy0; iy <= iy1; iy += 1) {
      const py = lo[1] + (iy + 0.5) * cell;
      for (let ix = ix0; ix <= ix1; ix += 1) {
        const px = lo[0] + (ix + 0.5) * cell;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const z = l1 * az + l2 * bz + l3 * cz;
        const k = iy * nx + ix;
        if (z > top[k]) top[k] = z;
      }
    }
  }
  const heightsCm = new Int16Array(nx * ny);
  for (let k = 0; k < top.length; k += 1) heightsCm[k] = top[k] === -Infinity ? GROUND_NODATA : Math.round(top[k] * 100);
  return heightsCm;
};
