import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'public');
const limits = {
  'media/field-calibration-poster.webp': 200_000,
  'media/field-calibration.mp4': 2_500_000,
  'media/field-calibration.webm': 2_500_000,
};

let failed = false;
for (const [relative, limit] of Object.entries(limits)) {
  const size = (await stat(path.join(root, relative))).size;
  console.log(`${relative}: ${(size / 1_000).toFixed(1)} KB / ${(limit / 1_000).toFixed(0)} KB`);
  if (size > limit) failed = true;
}

const mediaFiles = await readdir(path.join(root, 'media'));
const total = (await Promise.all(mediaFiles.map(async (name) => (await stat(path.join(root, 'media', name))).size))).reduce((sum, size) => sum + size, 0);
console.log(`new shipped video media: ${(total / 1_000_000).toFixed(2)} MB / 10.00 MB`);
if (total > 10_000_000) failed = true;
if (failed) process.exitCode = 1;
