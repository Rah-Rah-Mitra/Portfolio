import type { AsciiAnimStyle, AsciiCharSet, AsciiPreferences, AsciiRenderMode } from '../../types';

/**
 * Deterministic Canvas2D reimplementation of the 21st.dev "Electric Gaze" ASCII effect.
 * Pipeline per frame: sample source photo into a cell grid, adjust tone, then draw one
 * primitive per cell according to renderMode, modulated by the selected animation style.
 * Everything here is pure with respect to (grid, preferences, time) so frames replay
 * identically — no Math.random.
 */

export interface AsciiSourceImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface AsciiGrid {
  columns: number;
  rows: number;
  cellSize: number;
  red: Float32Array;
  green: Float32Array;
  blue: Float32Array;
  luminance: Float32Array;
  edge: Float32Array;
}

export const ASCII_SOURCE_URL = '/ascii-editor/demos/generated/ref-002.webp';

const TAU = Math.PI * 2;

export const asciiCharsetGlyphs = (charSet: AsciiCharSet, customChars: string): string => {
  switch (charSet) {
    case 'blocks': return ' ░▒▓█';
    case 'minimal': return ' .:*#';
    case 'digits': return ' 1234567890';
    case 'custom': return customChars.trim().length > 0 ? ` ${customChars.trim()}` : ' .:-=+*#%@';
    case 'standard': return ' .`\':,;i!~+xmo*#MW&8%B@$';
  }
};

/** Deterministic per-cell hash in [0, 1). */
export const cellHash = (column: number, row: number, salt: number): number => {
  let seed = (column * 374761393 + row * 668265263 + salt * 2147483647) | 0;
  seed = (seed ^ (seed >> 13)) | 0;
  seed = Math.imul(seed, 1274126177) | 0;
  seed = (seed ^ (seed >> 16)) >>> 0;
  return seed / 4294967296;
};

const REC709 = { r: 0.2126, g: 0.7152, b: 0.0722 };

/** Average the source image into cellSize buckets, cover-fitted onto width × height. */
export const buildAsciiGrid = (
  image: AsciiSourceImage,
  targetWidth: number,
  targetHeight: number,
  cellSize: number,
): AsciiGrid => {
  const size = Math.max(2, Math.floor(cellSize));
  const columns = Math.max(1, Math.ceil(targetWidth / size));
  const rows = Math.max(1, Math.ceil(targetHeight / size));
  const red = new Float32Array(columns * rows);
  const green = new Float32Array(columns * rows);
  const blue = new Float32Array(columns * rows);
  const luminance = new Float32Array(columns * rows);

  const coverScale = Math.max(targetWidth / image.width, targetHeight / image.height);
  const offsetX = (image.width - targetWidth / coverScale) / 2;
  const offsetY = (image.height - targetHeight / coverScale) / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const startX = Math.floor(offsetX + (column * size) / coverScale);
      const endX = Math.floor(offsetX + ((column + 1) * size) / coverScale);
      const startY = Math.floor(offsetY + (row * size) / coverScale);
      const endY = Math.floor(offsetY + ((row + 1) * size) / coverScale);
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let samples = 0;
      for (let y = Math.max(0, startY); y <= Math.min(image.height - 1, Math.max(startY, endY - 1)); y += 1) {
        for (let x = Math.max(0, startX); x <= Math.min(image.width - 1, Math.max(startX, endX - 1)); x += 1) {
          const index = (y * image.width + x) * 4;
          sumR += image.data[index]!;
          sumG += image.data[index + 1]!;
          sumB += image.data[index + 2]!;
          samples += 1;
        }
      }
      const cell = row * columns + column;
      if (samples === 0) continue;
      const r = sumR / samples / 255;
      const g = sumG / samples / 255;
      const b = sumB / samples / 255;
      red[cell] = r;
      green[cell] = g;
      blue[cell] = b;
      luminance[cell] = REC709.r * r + REC709.g * g + REC709.b * b;
    }
  }

  return { columns, rows, cellSize: size, red, green, blue, luminance, edge: computeEdgeField(luminance, columns, rows) };
};

/** Sobel magnitude over the cell luminance field, normalised to [0, 1]. */
export const computeEdgeField = (luminance: Float32Array, columns: number, rows: number): Float32Array => {
  const edge = new Float32Array(columns * rows);
  const at = (column: number, row: number) => luminance[Math.min(rows - 1, Math.max(0, row)) * columns + Math.min(columns - 1, Math.max(0, column))]!;
  let peak = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const gx = (at(column + 1, row - 1) + 2 * at(column + 1, row) + at(column + 1, row + 1))
        - (at(column - 1, row - 1) + 2 * at(column - 1, row) + at(column - 1, row + 1));
      const gy = (at(column - 1, row + 1) + 2 * at(column, row + 1) + at(column + 1, row + 1))
        - (at(column - 1, row - 1) + 2 * at(column, row - 1) + at(column + 1, row - 1));
      const magnitude = Math.hypot(gx, gy);
      edge[row * columns + column] = magnitude;
      if (magnitude > peak) peak = magnitude;
    }
  }
  if (peak > 0) for (let index = 0; index < edge.length; index += 1) edge[index] = edge[index]! / peak;
  return edge;
};

export interface ToneOptions {
  brightness: number;
  contrast: number;
  invert: boolean;
}

/** Brightness (−100..100), contrast (0..300, 100 = identity), optional inversion. Returns [0, 1]. */
export const adjustTone = (value: number, options: ToneOptions): number => {
  let tone = value + options.brightness / 100;
  const contrast = options.contrast / 100;
  tone = (tone - 0.5) * contrast + 0.5;
  tone = Math.min(1, Math.max(0, tone));
  return options.invert ? 1 - tone : tone;
};

export interface CellColorOptions {
  saturation: number;
  grayscale: number;
  tint: string;
  tintOpacity: number;
}

const hexChannel = (tint: string, index: number): number => parseInt(tint.slice(1 + index * 2, 3 + index * 2), 16) / 255;

/** Saturation → grayscale mix → multiply-blend tint, matching the reference ordering. */
export const adjustCellColor = (
  r: number,
  g: number,
  b: number,
  tone: number,
  options: CellColorOptions,
): [number, number, number] => {
  const luminance = REC709.r * r + REC709.g * g + REC709.b * b;
  const saturation = options.saturation / 100;
  let outR = luminance + (r - luminance) * saturation;
  let outG = luminance + (g - luminance) * saturation;
  let outB = luminance + (b - luminance) * saturation;
  const gray = options.grayscale / 100;
  outR = outR + (tone - outR) * gray;
  outG = outG + (tone - outG) * gray;
  outB = outB + (tone - outB) * gray;
  const tintAmount = options.tintOpacity / 100;
  if (tintAmount > 0) {
    outR = outR * (1 - tintAmount) + outR * hexChannel(options.tint, 0) * tintAmount;
    outG = outG * (1 - tintAmount) + outG * hexChannel(options.tint, 1) * tintAmount;
    outB = outB * (1 - tintAmount) + outB * hexChannel(options.tint, 2) * tintAmount;
  }
  const scale = tone / Math.max(0.0001, luminance);
  const lit = (channel: number) => Math.min(1, Math.max(0, channel * (0.35 + 0.65 * scale)));
  return [lit(outR), lit(outG), lit(outB)];
};

export interface AnimSample {
  toneShift: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

/** Time-driven modulation per animation style; speed and intensity are 0..100. */
export const sampleAnimation = (
  style: AsciiAnimStyle,
  timeSeconds: number,
  column: number,
  row: number,
  columns: number,
  rows: number,
  speed: number,
  intensity: number,
): AnimSample => {
  const rate = 0.2 + (speed / 100) * 2.2;
  const amount = intensity / 100;
  const t = timeSeconds * rate;
  switch (style) {
    case 'wave': {
      const phase = t * 2.4 + (column + row) * 0.32;
      return { toneShift: Math.sin(phase) * amount * 0.22, offsetX: 0, offsetY: Math.sin(phase) * amount * 2.4, scale: 1 };
    }
    case 'pulse': {
      const phase = Math.sin(t * 2.2);
      return { toneShift: phase * amount * 0.18, offsetX: 0, offsetY: 0, scale: 1 + phase * amount * 0.16 };
    }
    case 'shimmer': {
      const seedPhase = cellHash(column, row, 7) * TAU;
      const sparkle = Math.sin(t * 3.1 + seedPhase) * Math.sin(t * 1.7 + seedPhase * 1.7);
      return { toneShift: sparkle * amount * 0.3, offsetX: 0, offsetY: 0, scale: 1 + sparkle * amount * 0.08 };
    }
    case 'ripple': {
      const dx = column - columns / 2;
      const dy = row - rows / 2;
      const distance = Math.hypot(dx, dy);
      const phase = distance * 0.45 - t * 3.4;
      return { toneShift: Math.sin(phase) * amount * 0.24, offsetX: 0, offsetY: Math.sin(phase) * amount * 1.6, scale: 1 };
    }
    case 'flicker': {
      const step = Math.floor(timeSeconds * (2 + rate * 6));
      const noise = cellHash(column, row, step % 1024);
      const spike = noise > 0.94 ? (noise - 0.94) / 0.06 : 0;
      return { toneShift: (noise - 0.5) * amount * 0.12 + spike * amount * 0.5, offsetX: 0, offsetY: 0, scale: 1 };
    }
  }
};

export const asciiGlyphFor = (tone: number, glyphs: string): string => {
  const index = Math.min(glyphs.length - 1, Math.max(0, Math.round(tone * (glyphs.length - 1))));
  return glyphs[index]!;
};

const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export const bayerThreshold = (column: number, row: number): number => (BAYER_4[(row % 4) * 4 + (column % 4)]! + 0.5) / 16;

export interface CellDrawContext {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  size: number;
  tone: number;
  color: string;
  column: number;
  row: number;
  glyphs: string;
  density: number;
  timeSeconds: number;
  rows: number;
}

const HEX_DIGITS = '0123456789ABCDEF';
const MATRIX_GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅ0123456789Z';
const DISCO_HUES = [356, 32, 58, 130, 190, 262, 300];

/** Draw one grid cell for the given render mode. The ctx font is preset by the caller. */
export const drawAsciiCell = (mode: AsciiRenderMode, cell: CellDrawContext): void => {
  const { ctx, x, y, size, tone, color, column, row, glyphs, density, timeSeconds } = cell;
  const half = size / 2;
  const centerX = x + half;
  const centerY = y + half;
  const densityScale = 0.35 + (density / 100) * 0.9;
  const extent = Math.max(1, size * densityScale * Math.max(0.12, tone));
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  switch (mode) {
    case 'characters': {
      ctx.fillText(asciiGlyphFor(tone, glyphs), centerX, centerY);
      return;
    }
    case 'dither': {
      if (tone >= bayerThreshold(column, row)) {
        const dot = Math.max(1, size * (0.42 + tone * 0.5) * densityScale);
        ctx.fillRect(centerX - dot / 2, centerY - dot / 2, dot, dot);
      }
      return;
    }
    case 'mosaic': {
      const inset = Math.max(0.5, size * 0.08);
      ctx.globalAlpha *= 0.35 + tone * 0.65;
      ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
      return;
    }
    case 'pixel': {
      ctx.globalAlpha *= 0.25 + tone * 0.75;
      ctx.fillRect(x, y, size, size);
      return;
    }
    case 'dots': {
      ctx.beginPath();
      ctx.arc(centerX, centerY, extent / 2, 0, TAU);
      ctx.fill();
      return;
    }
    case 'cross': {
      const arm = extent;
      const thickness = Math.max(1, size * 0.16);
      ctx.fillRect(centerX - arm / 2, centerY - thickness / 2, arm, thickness);
      ctx.fillRect(centerX - thickness / 2, centerY - arm / 2, thickness, arm);
      return;
    }
    case 'diamond': {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - extent / 2);
      ctx.lineTo(centerX + extent / 2, centerY);
      ctx.lineTo(centerX, centerY + extent / 2);
      ctx.lineTo(centerX - extent / 2, centerY);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'voxel': {
      const depth = Math.max(1, extent * 0.32);
      const side = Math.max(1, extent * 0.8);
      ctx.globalAlpha *= 0.9;
      ctx.fillRect(centerX - side / 2, centerY - side / 2, side, side);
      ctx.globalAlpha *= 0.55;
      ctx.beginPath();
      ctx.moveTo(centerX - side / 2, centerY - side / 2);
      ctx.lineTo(centerX - side / 2 + depth, centerY - side / 2 - depth);
      ctx.lineTo(centerX + side / 2 + depth, centerY - side / 2 - depth);
      ctx.lineTo(centerX + side / 2, centerY - side / 2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(centerX + side / 2, centerY - side / 2);
      ctx.lineTo(centerX + side / 2 + depth, centerY - side / 2 - depth);
      ctx.lineTo(centerX + side / 2 + depth, centerY + side / 2 - depth);
      ctx.lineTo(centerX + side / 2, centerY + side / 2);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'lego': {
      const inset = Math.max(0.5, size * 0.06);
      ctx.globalAlpha *= 0.3 + tone * 0.7;
      ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
      ctx.globalAlpha *= 0.8;
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.max(0.8, size * 0.22), 0, TAU);
      ctx.fill();
      return;
    }
    case 'mixed': {
      const pick = cellHash(column, row, 3);
      if (pick < 0.34) drawAsciiCell('characters', cell);
      else if (pick < 0.67) drawAsciiCell('dots', cell);
      else drawAsciiCell('dither', cell);
      return;
    }
    case 'lines': {
      const thickness = Math.max(0.8, size * (0.1 + tone * 0.5) * densityScale);
      ctx.fillRect(x, centerY - thickness / 2, size, thickness);
      return;
    }
    case 'diagonal': {
      ctx.lineWidth = Math.max(0.8, size * 0.14 * (0.4 + tone));
      ctx.beginPath();
      if (cellHash(column, row, 11) > 0.5) {
        ctx.moveTo(x, y + size);
        ctx.lineTo(x + size, y);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y + size);
      }
      ctx.stroke();
      return;
    }
    case 'braille': {
      const dot = Math.max(0.7, size * 0.16);
      const filled = Math.round(tone * 8);
      for (let index = 0; index < 8; index += 1) {
        if (index >= filled) break;
        const dotColumn = index % 2;
        const dotRow = Math.floor(index / 2);
        ctx.beginPath();
        ctx.arc(x + size * (0.3 + dotColumn * 0.4), y + size * (0.16 + dotRow * 0.22), dot / 2, 0, TAU);
        ctx.fill();
      }
      return;
    }
    case 'disco': {
      const hue = DISCO_HUES[Math.floor(cellHash(column, row, 5) * DISCO_HUES.length + timeSeconds * 0.8) % DISCO_HUES.length]!;
      ctx.fillStyle = `hsl(${hue} 85% ${Math.round(28 + tone * 45)}%)`;
      ctx.beginPath();
      ctx.arc(centerX, centerY, extent / 2, 0, TAU);
      ctx.fill();
      return;
    }
    case 'hexdump': {
      const glyph = HEX_DIGITS[Math.min(15, Math.floor(tone * 16))]!;
      ctx.fillText(glyph, centerX, centerY);
      return;
    }
    case 'matrix': {
      const columnSpeed = 2.4 + cellHash(column, 0, 17) * 5;
      const span = cell.rows + 14;
      const head = (timeSeconds * columnSpeed + cellHash(column, 0, 23) * span) % span;
      const distance = head - row;
      if (distance < 0 || distance > 12) return;
      const fade = 1 - distance / 12;
      const glyphStep = Math.floor(timeSeconds * 8 + cellHash(column, row, 29) * 64);
      const glyph = MATRIX_GLYPHS[(glyphStep + row) % MATRIX_GLYPHS.length]!;
      const presence = 0.35 + tone * 0.65;
      ctx.fillStyle = distance < 1 ? `rgba(214, 255, 226, ${0.95 * presence})` : `rgba(56, 224, 120, ${(0.18 + fade * 0.72) * presence})`;
      ctx.fillText(glyph, centerX, centerY);
      return;
    }
    case 'rings': {
      ctx.lineWidth = Math.max(0.7, size * 0.12);
      const ringCount = 1 + Math.round(tone * 2);
      for (let ring = 1; ring <= ringCount; ring += 1) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, (extent / 2) * (ring / ringCount), 0, TAU);
        ctx.stroke();
      }
      return;
    }
    case 'hearts': {
      const scale = extent / 16;
      ctx.save();
      ctx.translate(centerX, centerY - extent * 0.1);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.moveTo(0, 3);
      ctx.bezierCurveTo(-8, -4, -4, -10, 0, -5);
      ctx.bezierCurveTo(4, -10, 8, -4, 0, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    case 'stars': {
      const spikes = 4;
      const outer = extent / 2;
      const inner = outer * 0.4;
      ctx.beginPath();
      for (let point = 0; point < spikes * 2; point += 1) {
        const radius = point % 2 === 0 ? outer : inner;
        const angle = (point / (spikes * 2)) * TAU - Math.PI / 2;
        const px = centerX + Math.cos(angle) * radius;
        const py = centerY + Math.sin(angle) * radius;
        if (point === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'hexagons': {
      const radius = (size / 2) * (0.35 + tone * 0.62);
      const shiftX = row % 2 === 0 ? 0 : size * 0.5;
      ctx.beginPath();
      for (let point = 0; point < 6; point += 1) {
        const angle = (point / 6) * TAU + Math.PI / 6;
        const px = centerX + shiftX + Math.cos(angle) * radius;
        const py = centerY + Math.sin(angle) * radius;
        if (point === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'triangles': {
      const up = (column + row) % 2 === 0;
      ctx.globalAlpha *= 0.3 + tone * 0.7;
      ctx.beginPath();
      if (up) {
        ctx.moveTo(x, y + size);
        ctx.lineTo(x + size, y + size);
        ctx.lineTo(x + half, y);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + half, y + size);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'bubbles': {
      const wobble = Math.sin(timeSeconds * 1.4 + cellHash(column, row, 31) * TAU) * size * 0.12;
      ctx.globalAlpha *= 0.28 + tone * 0.6;
      ctx.lineWidth = Math.max(0.7, size * 0.1);
      ctx.beginPath();
      ctx.arc(centerX, centerY + wobble, extent / 2, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(centerX - extent * 0.14, centerY + wobble - extent * 0.14, extent * 0.1, 0, TAU);
      ctx.fill();
      return;
    }
    case 'hatch': {
      const passes = Math.round(tone * 4);
      ctx.lineWidth = Math.max(0.6, size * 0.08);
      for (let pass = 0; pass < passes; pass += 1) {
        const offset = (pass / 4) * size;
        ctx.beginPath();
        ctx.moveTo(x + offset, y + size);
        ctx.lineTo(x + size, y + offset);
        ctx.stroke();
        if (pass >= 2) {
          ctx.beginPath();
          ctx.moveTo(x + size - offset, y + size);
          ctx.lineTo(x, y + offset);
          ctx.stroke();
        }
      }
      return;
    }
    case 'contour': {
      const bands = 6;
      const band = Math.floor(tone * bands);
      if (band % 2 === 0) return;
      ctx.lineWidth = Math.max(0.7, size * 0.1);
      ctx.beginPath();
      ctx.moveTo(x, centerY + Math.sin(column * 0.8 + band) * size * 0.2);
      ctx.quadraticCurveTo(centerX, centerY + Math.cos(row * 0.7 + band) * size * 0.3, x + size, centerY + Math.sin(column * 0.8 + band + 1) * size * 0.2);
      ctx.stroke();
      return;
    }
    case 'halfblocks': {
      ctx.globalAlpha *= 0.3 + tone * 0.7;
      ctx.fillRect(x, y, size, half);
      ctx.globalAlpha *= 0.72;
      ctx.fillRect(x, y + half, size, half);
      return;
    }
  }
};

export interface AsciiFrameOptions {
  width: number;
  height: number;
  timeSeconds: number;
  preferences: AsciiPreferences;
  surfaceColor: string;
  sourceCanvas?: CanvasImageSource | null;
  reducedMotion?: boolean;
}

/** Render one complete frame of the effect onto ctx. */
export const renderAsciiFrame = (ctx: CanvasRenderingContext2D, grid: AsciiGrid, options: AsciiFrameOptions): void => {
  const { width, height, preferences, surfaceColor } = options;
  const timeSeconds = options.reducedMotion || !preferences.animated ? 0 : options.timeSeconds;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = surfaceColor;
  ctx.fillRect(0, 0, width, height);

  if (options.sourceCanvas && preferences.bgMode !== 'none' && preferences.bgMode !== 'solid') {
    ctx.save();
    ctx.globalAlpha = preferences.bgOpacity / 100;
    if (preferences.bgMode === 'blur' && typeof ctx.filter === 'string') ctx.filter = `blur(${preferences.bgBlur}px)`;
    ctx.drawImage(options.sourceCanvas, 0, 0, width, height);
    ctx.restore();
  }

  const glyphs = asciiCharsetGlyphs(preferences.charSet, preferences.customChars);
  const size = grid.cellSize;
  ctx.font = `${Math.max(4, Math.round(size * 1.05))}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const coverage = preferences.coverage / 100;
  const edgeAmount = preferences.edgeEmphasis / 100;
  const toneOptions: ToneOptions = { brightness: preferences.brightness, contrast: preferences.contrast, invert: preferences.invert };
  const colorOptions: CellColorOptions = {
    saturation: preferences.saturation,
    grayscale: preferences.grayscale,
    tint: preferences.tint,
    tintOpacity: preferences.tintOpacity,
  };

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      if (coverage < 1 && cellHash(column, row, 1) > coverage) continue;
      const index = row * grid.columns + column;
      let tone = adjustTone(grid.luminance[index]!, toneOptions);
      if (edgeAmount > 0) tone = Math.min(1, tone + grid.edge[index]! * edgeAmount);
      const anim = sampleAnimation(
        preferences.animStyle,
        timeSeconds,
        column,
        row,
        grid.columns,
        grid.rows,
        preferences.animSpeed,
        preferences.animIntensity,
      );
      tone = Math.min(1, Math.max(0, tone + (preferences.animated && !options.reducedMotion ? anim.toneShift : 0)));
      if (tone <= 0.004 && preferences.renderMode !== 'matrix') continue;
      const [r, g, b] = adjustCellColor(grid.red[index]!, grid.green[index]!, grid.blue[index]!, tone, colorOptions);
      const color = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
      ctx.save();
      const drawSize = size * anim.scale;
      const drawX = column * size + anim.offsetX - (drawSize - size) / 2;
      const drawY = row * size + anim.offsetY - (drawSize - size) / 2;
      drawAsciiCell(preferences.renderMode, {
        ctx,
        x: drawX,
        y: drawY,
        size: drawSize,
        tone,
        color,
        column,
        row,
        glyphs,
        density: preferences.density,
        timeSeconds,
        rows: grid.rows,
      });
      ctx.restore();
    }
  }

  renderPostEffects(ctx, width, height, timeSeconds, preferences);
};

const renderPostEffects = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeSeconds: number,
  preferences: AsciiPreferences,
): void => {
  const { pfx } = preferences;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (pfx.pixelate.enabled && pfx.pixelate.intensity > 0) {
    const block = 2 + Math.round((pfx.pixelate.intensity / 100) * 14);
    const smallWidth = Math.max(1, Math.floor(width / block));
    const smallHeight = Math.max(1, Math.floor(height / block));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, smallWidth, smallHeight);
    ctx.drawImage(ctx.canvas, 0, 0, smallWidth, smallHeight, 0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
  }

  if (pfx.bloom.enabled && pfx.bloom.intensity > 0 && typeof ctx.filter === 'string') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (pfx.bloom.intensity / 100) * 0.6;
    ctx.filter = `blur(${2 + (pfx.bloom.intensity / 100) * 8}px)`;
    ctx.drawImage(ctx.canvas, 0, 0, width, height);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  if (pfx.chromatic.enabled && pfx.chromatic.intensity > 0) {
    const shift = 1 + (pfx.chromatic.intensity / 100) * 6;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18;
    ctx.drawImage(ctx.canvas, -shift, 0, width, height);
    ctx.drawImage(ctx.canvas, shift, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  if (pfx.halftone.enabled && pfx.halftone.intensity > 0) {
    const pitch = 7;
    ctx.globalAlpha = (pfx.halftone.intensity / 100) * 0.5;
    ctx.fillStyle = '#000000';
    for (let y = 0; y < height; y += pitch) {
      for (let x = (Math.floor(y / pitch) % 2) * (pitch / 2); x < width; x += pitch) {
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  if (pfx.scanLines.enabled && pfx.scanLines.intensity > 0) {
    ctx.globalAlpha = (pfx.scanLines.intensity / 100) * 0.5;
    ctx.fillStyle = '#000000';
    for (let y = Math.floor(timeSeconds * 18) % 3; y < height; y += 3) ctx.fillRect(0, y, width, 1);
    ctx.globalAlpha = 1;
  }

  if (pfx.glitch.enabled && pfx.glitch.intensity > 0) {
    const step = Math.floor(timeSeconds * 5);
    if (cellHash(step, 0, 41) < 0.3 + (pfx.glitch.intensity / 100) * 0.5) {
      const bands = 2 + Math.round((pfx.glitch.intensity / 100) * 4);
      for (let band = 0; band < bands; band += 1) {
        const bandY = Math.floor(cellHash(step, band, 43) * height);
        const bandHeight = 4 + Math.floor(cellHash(step, band, 47) * 14);
        const displacement = Math.round((cellHash(step, band, 53) - 0.5) * (pfx.glitch.intensity / 100) * 60);
        ctx.drawImage(ctx.canvas, 0, bandY, width, bandHeight, displacement, bandY, width, bandHeight);
      }
    }
  }

  if (pfx.filmGrain.enabled && pfx.filmGrain.intensity > 0) {
    const step = Math.floor(timeSeconds * 24);
    const grains = Math.round((width * height) / 900 * (pfx.filmGrain.intensity / 100));
    ctx.globalAlpha = 0.16;
    for (let grain = 0; grain < grains; grain += 1) {
      const gx = cellHash(grain, step, 59) * width;
      const gy = cellHash(grain, step, 61) * height;
      ctx.fillStyle = cellHash(grain, step, 67) > 0.5 ? '#ffffff' : '#000000';
      ctx.fillRect(gx, gy, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  if (pfx.filmDust.enabled && pfx.filmDust.intensity > 0) {
    const step = Math.floor(timeSeconds * 3);
    const specks = 1 + Math.round((pfx.filmDust.intensity / 100) * 6);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#e8e4da';
    for (let speck = 0; speck < specks; speck += 1) {
      if (cellHash(step, speck, 71) < 0.4) continue;
      const sx = cellHash(step, speck, 73) * width;
      const sy = cellHash(step, speck, 79) * height;
      ctx.fillRect(sx, sy, 1 + cellHash(step, speck, 83) * 2, 1 + cellHash(step, speck, 89) * 6);
    }
    ctx.globalAlpha = 1;
  }

  if (pfx.vignette.enabled && pfx.vignette.intensity > 0) {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.72);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${(pfx.vignette.intensity / 100) * 0.85})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();
};
