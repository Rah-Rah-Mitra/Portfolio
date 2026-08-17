import { spawn } from 'node:child_process';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const input = path.resolve(process.argv[2] ?? 'public/media/field-calibration.mp4');
const outputStem = path.resolve(process.argv[3] ?? 'public/media/field-calibration');

const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(ffmpegPath, args, { stdio: 'inherit', windowsHide: true });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
});

await run(['-y', '-i', input, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '35', '-row-mt', '1', '-deadline', 'good', `${outputStem}.webm`]);
await run(['-y', '-ss', '00:00:01.5', '-i', input, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', `${outputStem}-poster.webp`]);
