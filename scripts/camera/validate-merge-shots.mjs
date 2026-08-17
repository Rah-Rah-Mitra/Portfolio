import { readFile, writeFile } from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('Usage: node scripts/camera/validate-merge-shots.mjs <input.json> <output.json>');
const incoming = JSON.parse(await readFile(inputPath, 'utf8'));
const shots = Array.isArray(incoming) ? incoming : [incoming];
for (const shot of shots) {
  if (!shot.id || !shot.chapterId) throw new Error('Every shot needs id and chapterId.');
  if (!(shot.near > 0 && shot.far > shot.near)) throw new Error(`${shot.id}: invalid clipping planes.`);
  if (!(shot.fov > 5 && shot.fov < 120)) throw new Error(`${shot.id}: invalid FOV.`);
  if (!(shot.transition?.duration >= 0 && shot.transition.duration <= 0.45)) throw new Error(`${shot.id}: transition must be <= 0.45s.`);
}
await writeFile(outputPath, `${JSON.stringify(shots, null, 2)}\n`, 'utf8');
console.log(`Validated ${shots.length} camera shot(s) -> ${outputPath}`);
