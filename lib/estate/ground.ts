// Outdoor ground heights for the Estate window's Walk and Fly (plan §6.2 step
// 6e, §8.4): the SN5G v1 decoder and the height lookups. Pure, so the engine
// and node tests run the same code.
//
// One file for the whole estate, written by the pack tool
// (scripts/estate/lib/pure/sn5w.mjs writeGround, from SITE_lod0's ground
// surfaces) and stored gzipped at site/ground.<h8>.bin.gz; the engine's loader
// gunzips it and sniffs the magic before this sees it.
//
// Frame: the ESTATE frame (x east, y north, Z up, metres), not block-local:
// the grid covers the site's ground surfaces, not one building. Cell (ix, iy)
// covers [lo + i·cell, lo + (i+1)·cell) on each axis and holds the top height
// of the ground surfaces at its centre (lo + (i + 0.5)·cell), in centimetres,
// or nodata where no ground surface covers that centre. Raster index iy·nx + ix,
// row-major from the south-west.
//
// Nodata is common near buildings: the ground surfaces stop short of the
// building aprons (33 of the 45 entrance spawns stand on nodata cells), and
// there Walk takes the building's own L1 walk grid instead (§8.4). So a lookup
// answers null for nodata rather than guessing a height, and the caller picks
// the fallback: nearestGround() within a short reach, or the building grid.
//
// SN5G v1, little-endian, 32-byte header then int16 per cell:
//   0 char[4] "SN5G"  4 u16 version = 1  6 u16 flags = 0
//   8 f32 cell (0.5)  12 f32 lo_x  16 f32 lo_y   (estate frame, the south-west corner)
//  20 u16 nx  22 u16 ny  24 i16 nodata (0x7FFF)  26 u16 reserved = 0  28 u32 reserved = 0
//  32 int16[nx·ny] centimetres; nodata where nothing covers the cell's centre
// The reader below and sn5w.mjs readGround agree byte for byte
// (tests/estate-ground.test.ts runs both over the same files).

export const GROUND_HEADER_BYTES = 32;
/** The raster value for a cell no ground surface covers. */
export const GROUND_NODATA = 0x7fff;

export interface GroundGrid {
  version: 1;
  /** Cell edge, m (0.5 in v1.2). */
  cell: number;
  /** Estate-frame corner of cell (0, 0), m. */
  loX: number;
  loY: number;
  nx: number;
  ny: number;
  /** Top ground height at each cell's centre, cm, or GROUND_NODATA. Read only. */
  heights: Int16Array;
  /** Cells holding a height (not nodata). */
  readonly covered: number;
}

export class GroundFormatError extends Error {
  /** Byte offset of the field at fault. */
  readonly offset: number;
  constructor(offset: number, problem: string) {
    super(`SN5G @${offset}: ${problem}`);
    this.name = 'GroundFormatError';
    this.offset = offset;
  }
}

const fail = (offset: number, problem: string): never => {
  throw new GroundFormatError(offset, problem);
};

// The shortest decimal that rounds to the same float32 (walk.ts f32Decimal),
// so a corner written as 12.3 reads back as 12.3, not 12.300000190734863.
const f32Decimal = (v: number): number => {
  if (!Number.isFinite(v)) return v;
  for (let p = 1; p < 9; p += 1) {
    const d = Number(v.toPrecision(p));
    if (Math.fround(d) === v) return d;
  }
  return v;
};

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/**
 * Parse an SN5G v1 file (the gunzipped payload). Throws GroundFormatError (with
 * the byte offset) on anything outside the format: magic, version, flags,
 * a non-positive or non-finite cell, a non-finite corner, an empty grid, a
 * nodata value other than 0x7FFF, non-zero reserved bytes, or a length that is
 * not exactly the header plus nx · ny cells. Copies the raster into an aligned
 * array it owns, so the input buffer may be reused.
 */
export const decodeGround = (input: ArrayBuffer | ArrayBufferView): GroundGrid => {
  const bytes = ArrayBuffer.isView(input)
    ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : new Uint8Array(input);
  const size = bytes.byteLength;
  if (size < GROUND_HEADER_BYTES) fail(0, `${size} bytes is shorter than the ${GROUND_HEADER_BYTES}-byte header`);
  if (bytes[0] !== 0x53 || bytes[1] !== 0x4e || bytes[2] !== 0x35 || bytes[3] !== 0x47) fail(0, 'magic is not "SN5G"');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, size);
  const version = dv.getUint16(4, true);
  if (version !== 1) fail(4, `version ${version}; this reader knows 1`);
  const flags = dv.getUint16(6, true);
  if (flags !== 0) fail(6, `flags 0x${flags.toString(16)}; v1 defines none`);
  const cell = f32Decimal(dv.getFloat32(8, true));
  if (!(cell > 0 && cell < Infinity)) fail(8, `cell ${cell} m`);
  const loX = f32Decimal(dv.getFloat32(12, true));
  const loY = f32Decimal(dv.getFloat32(16, true));
  if (!Number.isFinite(loX)) fail(12, `corner x ${loX}`);
  if (!Number.isFinite(loY)) fail(16, `corner y ${loY}`);
  const nx = dv.getUint16(20, true);
  const ny = dv.getUint16(22, true);
  if (nx === 0) fail(20, 'nx is 0');
  if (ny === 0) fail(22, 'ny is 0');
  const nodata = dv.getInt16(24, true);
  if (nodata !== GROUND_NODATA) fail(24, `nodata ${nodata}; v1 uses ${GROUND_NODATA}`);
  for (let o = 26; o < GROUND_HEADER_BYTES; o += 1) if (bytes[o] !== 0) fail(o, 'reserved byte is not 0');
  const cells = nx * ny;
  const expected = GROUND_HEADER_BYTES + cells * 2;
  if (size !== expected) fail(GROUND_HEADER_BYTES, `${size} bytes; a ${nx} × ${ny} grid needs ${expected}`);

  let heights: Int16Array;
  const start = bytes.byteOffset + GROUND_HEADER_BYTES;
  if (LITTLE_ENDIAN) {
    heights = new Int16Array(bytes.buffer.slice(start, start + cells * 2));
  } else {
    heights = new Int16Array(cells);
    for (let i = 0; i < cells; i += 1) heights[i] = dv.getInt16(GROUND_HEADER_BYTES + 2 * i, true);
  }
  let covered = 0;
  for (let i = 0; i < cells; i += 1) if (heights[i] !== GROUND_NODATA) covered += 1;
  return { version: 1, cell, loX, loY, nx, ny, heights, covered };
};

/** The cell index (iy · nx + ix) holding estate (x, y), or −1 off the grid. */
export const groundCell = (ground: GroundGrid, x: number, y: number): number => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
  const ix = Math.floor((x - ground.loX) / ground.cell);
  const iy = Math.floor((y - ground.loY) / ground.cell);
  if (ix < 0 || iy < 0 || ix >= ground.nx || iy >= ground.ny) return -1;
  return iy * ground.nx + ix;
};

/**
 * The ground height at estate (x, y), m: the sample of the cell the point lies
 * in (each cell holds the height at its centre), or null off the grid or on a
 * nodata cell. Kerbs arrive as steps of their own height, which the walker's
 * feet spring (walk.ts followFloor) smooths.
 */
export const groundAt = (ground: GroundGrid, x: number, y: number): number | null => {
  const k = groundCell(ground, x, y);
  if (k < 0) return null;
  const v = ground.heights[k];
  return v === GROUND_NODATA ? null : v / 100;
};

export interface GroundHit {
  /** Height, m. */
  z: number;
  /** Centre of the cell it came from, estate frame, m. */
  x: number;
  y: number;
  /** Plan distance from the asked point to that centre, m (0 when the point's own cell answered). */
  distance: number;
}

/**
 * The height of the point's own cell when it has one, else of the covered cell
 * whose centre is nearest (ties: lower iy, then lower ix), no farther than
 * `maxDist` m. Fills `out` and returns true, or returns false. For a walker at
 * a building's apron, where the surfaces stop short (prefer the building's L1
 * walk grid there when it is resident).
 */
export const nearestGround = (ground: GroundGrid, x: number, y: number, maxDist: number, out: GroundHit): boolean => {
  const own = groundAt(ground, x, y);
  if (own !== null) {
    const k = groundCell(ground, x, y);
    out.z = own;
    out.x = ground.loX + ((k % ground.nx) + 0.5) * ground.cell;
    out.y = ground.loY + (Math.floor(k / ground.nx) + 0.5) * ground.cell;
    out.distance = 0;
    return true;
  }
  if (!(maxDist > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const { cell, nx, ny, loX, loY, heights } = ground;
  const cx = Math.floor((x - loX) / cell);
  const cy = Math.floor((y - loY) / cell);
  const reach = Math.ceil(maxDist / cell) + 1;
  const limit = maxDist * maxDist + 1e-9;
  let best = Infinity;
  for (let iy = Math.max(0, cy - reach); iy <= Math.min(ny - 1, cy + reach); iy += 1) {
    const py = loY + (iy + 0.5) * cell;
    for (let ix = Math.max(0, cx - reach); ix <= Math.min(nx - 1, cx + reach); ix += 1) {
      const v = heights[iy * nx + ix];
      if (v === GROUND_NODATA) continue;
      const px = loX + (ix + 0.5) * cell;
      const d2 = (px - x) * (px - x) + (py - y) * (py - y);
      if (d2 > limit || d2 >= best) continue;
      best = d2;
      out.z = v / 100;
      out.x = px;
      out.y = py;
    }
  }
  if (best === Infinity) return false;
  out.distance = Math.sqrt(best);
  return true;
};
