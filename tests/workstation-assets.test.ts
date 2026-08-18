// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type AssetManifest = {
  version: number;
  generator: string;
  icons: Array<{ appId: string; src: string; sha256: string }>;
  mechanisms: Array<{ id: string; src: string; sha256: string }>;
  posters: Array<{ id: string; src: string; sha256: string }>;
};

const publicRoot = path.resolve(process.cwd(), 'public');
const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

describe('real workstation asset package', () => {
  it('ships ten hashed raster renders rather than SVG application artwork', async () => {
    const manifest = JSON.parse(await readFile(path.join(publicRoot, 'workstation', 'assets.json'), 'utf8')) as AssetManifest;
    expect(manifest.version).toBe(1);
    expect(manifest.generator).toBe('Blender 5.x / scripted geometry');
    expect(manifest.icons).toHaveLength(10);
    expect(new Set(manifest.icons.map((icon) => icon.appId)).size).toBe(10);

    let bytes = 0;
    for (const icon of manifest.icons) {
      expect(icon.src.endsWith('.webp')).toBe(true);
      expect(icon.src.endsWith('.svg')).toBe(false);
      const buffer = await readFile(path.join(publicRoot, icon.src.replace(/^\//, '')));
      bytes += buffer.byteLength;
      expect(buffer.byteLength).toBeGreaterThan(1_500);
      expect(sha256(buffer)).toBe(icon.sha256);
    }
    expect(bytes).toBeLessThanOrEqual(600_000);
  });

  it('ships hashed real GLB mechanisms and a raster optical fallback poster', async () => {
    const manifest = JSON.parse(await readFile(path.join(publicRoot, 'workstation', 'assets.json'), 'utf8')) as AssetManifest;
    expect(manifest.mechanisms.map((asset) => asset.id)).toEqual(['optical-rail', 'flow-shop-machine', 'spatial-allocation-table']);
    let mechanismBytes = 0;
    for (const asset of manifest.mechanisms) {
      expect(asset.src.endsWith('.glb')).toBe(true);
      const buffer = await readFile(path.join(publicRoot, asset.src.replace(/^\//, '')));
      mechanismBytes += buffer.byteLength;
      expect(buffer.subarray(0, 4).toString('utf8')).toBe('glTF');
      expect(sha256(buffer)).toBe(asset.sha256);
    }
    expect(mechanismBytes).toBeLessThanOrEqual(3_000_000);

    expect(manifest.posters.map((asset) => asset.id)).toEqual(['optical-bench', 'flow-shop-machine', 'spatial-allocation-table']);
    for (const poster of manifest.posters) {
      expect(poster.src.endsWith('.webp')).toBe(true);
      const posterPath = path.join(publicRoot, poster.src.replace(/^\//, ''));
      expect((await stat(posterPath)).size).toBeLessThanOrEqual(200_000);
      expect(sha256(await readFile(posterPath))).toBe(poster.sha256);
    }
  });
});
