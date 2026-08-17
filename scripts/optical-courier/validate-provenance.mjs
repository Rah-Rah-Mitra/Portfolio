import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const hashFile = async (relativePath) => createHash('sha256').update(await readFile(path.join(root, relativePath))).digest('hex');
const fail = (message) => { throw new Error(message); };

const manifest = await readJson('workflows/optical-courier/prompt-manifest.json');
const geometry = await readJson('assets/optical-courier/pre-mixamo/validation-report.json');
const fbxRoundTrip = await readJson('assets/optical-courier/pre-mixamo/fbx-roundtrip-report.json');
const proof = await readJson('assets/optical-courier/proofs/hunyuan-proof-report.json');

if (manifest.status !== 'pre-rig-ready') fail(`Unexpected checkpoint status: ${manifest.status}`);
if (manifest.generations?.length !== 3) fail('Exactly three fixed-seed candidate records are required');
if (new Set(manifest.generations.map(({ seed }) => seed)).size !== 3) fail('Candidate seeds are not unique');
if (!manifest.generations.some(({ id, review }) => id === manifest.selectedCandidateId && review.approved)) fail('Selected candidate is not approved');
for (const output of manifest.selectedOutputs) {
  await stat(path.join(root, output.path));
  if (await hashFile(output.path) !== output.sha256) fail(`Output hash mismatch: ${output.path}`);
}
if (geometry.geometry.primaryConnectedComponents !== 1 || geometry.geometry.nonManifoldEdges !== 0) fail('Pre-Mixamo body geometry is not connected and manifold');
if (geometry.rig.status !== 'not-rigged') fail('Pre-Mixamo report must not claim a rig');
if (await hashFile(fbxRoundTrip.source) !== fbxRoundTrip.sha256) fail('FBX hash no longer matches its round-trip report');
if (proof.decision !== 'rejected-for-deformation' && proof.decision !== 'accepted-for-deformation') fail('Hunyuan proof decision is missing');

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = tracked.filter((file) => /\.(safetensors|ckpt|pt|pth|bin)$/i.test(file) || /(^|\/)(raw-mixamo|browser-state|cookies?|tokens?)(\/|$)/i.test(file));
if (forbidden.length) fail(`Forbidden tracked asset(s): ${forbidden.join(', ')}`);

console.log(JSON.stringify({
  status: manifest.status,
  selectedCandidateId: manifest.selectedCandidateId,
  selectedOutputs: manifest.selectedOutputs.length,
  fbxBytes: fbxRoundTrip.bytes,
  geometry: geometry.geometry,
  hunyuanDecision: proof.decision,
  mixamo: manifest.mixamo.status,
}, null, 2));
