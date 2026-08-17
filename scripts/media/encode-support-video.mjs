import { spawn } from 'node:child_process';
import { rename } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const input = path.resolve(process.argv[2] ?? 'public/media/field-calibration.mp4');
const outputStem = path.resolve(process.argv[3] ?? 'public/media/field-calibration');
const duration = process.argv[4] ?? '4.04';
const finalMp4 = `${outputStem}.mp4`;
const encodedMp4 = path.resolve(input) === path.resolve(finalMp4) ? `${outputStem}.encoded.mp4` : finalMp4;

const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(ffmpegPath, args, { stdio: 'inherit', windowsHide: true });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
});

await run(['-y', '-i', input, '-t', duration, '-an', '-map_metadata', '-1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', encodedMp4]);
if (encodedMp4 !== finalMp4) await rename(encodedMp4, finalMp4);
await run(['-y', '-i', input, '-t', duration, '-an', '-map_metadata', '-1', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-deadline', 'good', `${outputStem}.webm`]);
await run(['-y', '-ss', '00:00:01.5', '-i', input, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', `${outputStem}-poster.webp`]);
