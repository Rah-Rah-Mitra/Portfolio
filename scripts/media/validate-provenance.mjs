import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const provenance = JSON.parse(await readFile(path.join(root, 'workflows/media/provenance.json'), 'utf8'));
const generated = provenance.records.filter((record) => ['camera-lab-composite-6081701', 'hybrid-flow-shop-vignette-6081702'].includes(record.id));
if (generated.length !== 2 || generated.some((record) => record.status !== 'rejected-not-shipped')) throw new Error('Both Task 6 generated supports must have truthful rejected provenance.');
for (const record of generated) {
  if (!/^[A-F0-9]{64}$/.test(record.sourceWorkflowSha256) || !/^[A-F0-9]{64}$/.test(record.committedWorkflowSha256)) throw new Error(`${record.id} workflow hashes are incomplete.`);
  if (!record.positivePrompt || !record.negativePrompt || !record.seed || !record.modelSha256 || !record.license) throw new Error(`${record.id} generation provenance is incomplete.`);
}
for (const forbidden of ['camera-lab-composite.mp4', 'camera-lab-composite.webm', 'hybrid-flow-shop-vignette.mp4', 'hybrid-flow-shop-vignette.webm']) {
  try { await access(path.join(root, 'public/media', forbidden)); throw new Error(`Rejected output is public: ${forbidden}`); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}
const audio = provenance.records.find((record) => record.id === 'optical-cues-audio-sprite');
const audioPath = path.join(root, 'public/media/optical-cues.mp3');
const bytes = await readFile(audioPath);
const digest = createHash('sha256').update(bytes).digest('hex').toUpperCase();
if (digest !== audio.outputSha256 || (await stat(audioPath)).size !== audio.outputBytes || bytes.length >= 200_000) throw new Error('Audio sprite hash/size provenance is invalid.');
console.log(JSON.stringify({ generatedSupports: generated.map(({ id, status, seed }) => ({ id, status, seed })), audio: { bytes: bytes.length, sha256: digest } }, null, 2));
