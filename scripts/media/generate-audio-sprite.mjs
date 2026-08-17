import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const rate = 44_100;
const duration = 1.9;
const samples = new Float32Array(Math.ceil(rate * duration));
let randomState = 0x6081703;
const noise = () => { randomState = (1664525 * randomState + 1013904223) >>> 0; return randomState / 0xffffffff * 2 - 1; };
const addTone = (start, length, frequency, gain, decay = 7) => {
  const begin = Math.floor(start * rate); const count = Math.floor(length * rate);
  for (let i = 0; i < count; i += 1) {
    const envelope = Math.sin(Math.PI * i / count) * Math.exp(-decay * i / count);
    samples[begin + i] += Math.sin(2 * Math.PI * frequency * i / rate) * gain * envelope;
  }
};
const addNoise = (start, length, gain) => {
  const begin = Math.floor(start * rate); const count = Math.floor(length * rate);
  for (let i = 0; i < count; i += 1) samples[begin + i] += noise() * gain * Math.exp(-9 * i / count);
};

// Footstep, optical click, rail servo, confirmation, and scene transition.
addNoise(0, .18, .06); addTone(.01, .16, 95, .08);
addTone(.28, .12, 980, .065, 12); addNoise(.28, .06, .018);
addTone(.5, .42, 155, .035, 2); addTone(.5, .42, 235, .025, 3);
addTone(1.02, .17, 620, .045, 5); addTone(1.18, .17, 930, .035, 5);
addTone(1.46, .32, 210, .025, 2); addTone(1.46, .32, 315, .022, 2);

const pcm = Buffer.alloc(samples.length * 2);
for (let i = 0; i < samples.length; i += 1) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);

const outputDirectory = path.resolve('public/media');
const wavePath = path.join(outputDirectory, '.optical-cues.wav');
const outputPath = path.join(outputDirectory, 'optical-cues.mp3');
await mkdir(outputDirectory, { recursive: true });
await writeFile(wavePath, Buffer.concat([header, pcm]));
await new Promise((resolve, reject) => {
  const process = spawn(ffmpegPath, ['-y', '-i', wavePath, '-ac', '1', '-ar', String(rate), '-c:a', 'libmp3lame', '-b:a', '48k', outputPath], { stdio: 'inherit', windowsHide: true });
  process.once('error', reject); process.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
});
await rm(wavePath, { force: true });
