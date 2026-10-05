// Posters (plan §6.2 step 12): ESTATE_aerial_NE.png → aerial-1600.webp,
// aerial-800.webp and aerial-800.jpg, through the pinned ffmpeg-static with
// every metadata stream dropped (-map_metadata -1) and bit-exact muxing, so
// no path, clock or encoder string reaches a published byte. Each image takes
// the best quality that fits its budget (packBudgets.json classes.poster), tried
// from the top down, so a rebuild picks the same setting.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const run = (args) => {
  // ffmpeg-static fetches its binary in an install script; npm 11 warns about
  // install scripts it has not been told to allow, and a future npm may skip them.
  if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error('ffmpeg-static has no binary: rerun `npm run estate:setup` and let its install script run (docs/portfolio/estate-pack.md)');
  return execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
};

const COMMON = ['-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-frames:v', '1'];

/** Dimensions of a PNG from its IHDR. */
export const pngSize = (png) => {
  if (png.readUInt32BE(12) !== 0x49484452) throw new Error('not a PNG (no IHDR first)');
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
};

// RIFF chunk ids inside a WebP; only image data may ship.
const webpChunks = (buf) => {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') throw new Error('not a WebP');
  const ids = [];
  for (let at = 12; at + 8 <= buf.length;) {
    const id = buf.toString('latin1', at, at + 4); const len = buf.readUInt32LE(at + 4);
    ids.push(id); at += 8 + len + (len & 1);
  }
  return ids;
};

// JPEG markers before the scan; APP1 (Exif/XMP), APP2 (ICC) and COM must be absent.
const jpegMarkers = (buf) => {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
  const out = [];
  for (let at = 2; at + 4 <= buf.length;) {
    if (buf[at] !== 0xff) break;
    const m = buf[at + 1];
    out.push(m);
    if (m === 0xda) break;
    at += 2 + buf.readUInt16BE(at + 2);
  }
  return out;
};

/** Refuses an image carrying anything but pixels. */
export const metadataProblem = (name, buf) => {
  if (name.endsWith('.webp')) {
    const bad = webpChunks(buf).filter((id) => !['VP8 ', 'VP8L', 'VP8X', 'ALPH'].includes(id));
    return bad.length ? `${name} carries chunks ${bad.join(', ')}` : null;
  }
  if (name.endsWith('.jpg')) {
    const bad = jpegMarkers(buf).filter((m) => m === 0xe1 || m === 0xe2 || m === 0xfe || (m >= 0xe3 && m <= 0xef));
    return bad.length ? `${name} carries markers ${bad.map((m) => `0x${m.toString(16)}`).join(', ')}` : null;
  }
  return `${name}: unknown image type`;
};

/**
 * Encodes the three posters from a PNG's bytes. `caps`: packBudgets.json
 * classes.poster.files. Returns [{ name, bytes: Buffer, w, h, quality }].
 */
export const encodePosters = (png, caps) => {
  const { w, h } = pngSize(png);
  if (w !== 1600) throw new Error(`ESTATE_aerial_NE.png is ${w}×${h}; the posters expect 1600 px wide`);
  const dir = mkdtempSync(join(tmpdir(), 'estate-poster-'));
  try {
    const src = join(dir, 'src.png');
    writeFileSync(src, png);
    const jobs = [
      { name: 'aerial-1600.webp', width: 1600, kind: 'webp' },
      { name: 'aerial-800.webp', width: 800, kind: 'webp' },
      { name: 'aerial-800.jpg', width: 800, kind: 'jpg' },
    ];
    return jobs.map((job) => {
      const cap = caps[job.name];
      if (!cap) throw new Error(`packBudgets.json has no poster cap for ${job.name}`);
      const out = join(dir, job.name);
      const scale = job.width === w ? [] : ['-vf', `scale=${job.width}:-2:flags=lanczos`];
      const tries = job.kind === 'webp' ? [92, 88, 84, 80, 76, 72, 68, 64, 60, 55, 50, 45, 40] : [2, 3, 4, 5, 6, 7, 8, 10, 12];
      for (const q of tries) {
        const codec = job.kind === 'webp'
          ? ['-c:v', 'libwebp', '-lossless', '0', '-quality', String(q), '-compression_level', '6', '-preset', 'picture', '-pix_fmt', 'yuv420p']
          : ['-c:v', 'mjpeg', '-q:v', String(q), '-pix_fmt', 'yuvj420p', '-huffman', 'optimal'];
        run(['-i', src, ...scale, ...COMMON, ...codec, out]);
        const bytes = readFileSync(out);
        if (bytes.length <= cap) {
          const problem = metadataProblem(job.name, bytes);
          if (problem) throw new Error(problem);
          return { name: job.name, bytes, w: job.width, h: Math.round((h * job.width) / w), quality: q };
        }
      }
      throw new Error(`${job.name} does not fit ${cap} B at any quality tried`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
