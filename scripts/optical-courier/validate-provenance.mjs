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
const visualReview = await readJson('assets/optical-courier/review-v2/validation-report.json');

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
if (manifest.preMixamo?.visualStatus !== 'rejected-for-upload') fail('Rejected pre-Mixamo history must remain explicit');
const candidate = manifest.visualFidelityCandidate;
if (candidate?.status !== 'visual-review-required' || candidate.uploadApproved !== false || candidate.mixamoUploadAsset !== null) {
  fail('Visual-fidelity candidate must remain review-only');
}
if (await hashFile(candidate.sourceBlend) !== candidate.sourceBlendSha256) fail('Visual-fidelity source hash mismatch');
if (await hashFile(candidate.comparisonSheet) !== candidate.comparisonSheetSha256) fail('Visual comparison hash mismatch');
if (visualReview.geometry.primaryConnectedComponents !== 1 || visualReview.geometry.nonManifoldEdges !== 0) fail('Visual-fidelity candidate is not connected and manifold');
if (visualReview.materialBoundaryMode !== 'continuous-position-masks' || visualReview.signalSurfaceGapMeters > 0.02) fail('Visual material/signal contract failed');

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
  visualCandidate: {
    status: candidate.status,
    triangles: visualReview.geometry.triangles,
    materialBoundaryMode: visualReview.materialBoundaryMode,
    signalSurfaceGapMeters: visualReview.signalSurfaceGapMeters,
  },
  mixamo: manifest.mixamo.status,
}, null, 2));
