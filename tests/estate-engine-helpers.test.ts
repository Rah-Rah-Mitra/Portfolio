import { gzipSync } from 'node:zlib';
import { BufferAttribute, BufferGeometry, InstancedMesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { estateToThree, threeToEstate, type Vec3 } from '../lib/estate/frames';
import { ESTATE_SITE_IDS } from '../lib/estate/ids';
import { LOD_DETAIL, LOD_FACADE, LOD_MASSING, RESIDENT_DETAIL, RESIDENT_FACADE, RESIDENT_MASSING } from '../lib/estate/lod';
import type { PackBuilding } from '../lib/estate/schema';
import { ESTATE_TIER_TABLE } from '../lib/estate/tiers';
import { applyClip, fogRange } from '../components/workbench/estate/engine/clip';
import { packBase } from '../components/workbench/estate/engine/core';
import { LevelWiring, levelCosts } from '../components/workbench/estate/engine/levels';
import { gunzip, PackFetchError, readPayload, sniff } from '../components/workbench/estate/engine/loaders';
import { gpuBytes } from '../components/workbench/estate/engine/parts';
import {
  chooseStart, missingCapability, readRendererString, shouldDropMsaa,
} from '../components/workbench/estate/engine/renderer';
import {
  READOUT_ATTRIBUTES, ReadoutThrottle, readoutValues, writeReadouts, type FrameStats,
} from '../components/workbench/estate/engine/stats';
import { createTreePartition, gatherMatrices, partitionTrees } from '../components/workbench/estate/engine/trees';
import {
  aerialPose, fallbackAerialPose, posterFov, posterPose, resumePose, rotateByQuat, toEstate,
} from '../components/workbench/estate/engine/views';

// The engine's pure helpers (plan §7): poses, trees, sniffing, costs, the
// start choice, readouts and clip/fog. The rendering itself is proved by the
// harness screenshots and the e2e; these pin the decisions it rests on.

const close = (a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-6) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i += 1) expect(Math.abs(a[i] - b[i])).toBeLessThan(eps);
};

describe('views', () => {
  it('rotates by a quaternion', () => {
    close(rotateByQuat([0, 0, 0, 1], [1, 2, 3]), [1, 2, 3]);
    // 90° about +Z: x → y.
    const s = Math.SQRT1_2;
    close(rotateByQuat([0, 0, s, s], [1, 0, 0]), [0, 1, 0]);
  });

  it('narrows the FOV only for a stage wider than the poster', () => {
    expect(posterFov(40, 4 / 3, 1)).toBe(40);
    expect(posterFov(40, 4 / 3, 4 / 3)).toBe(40);
    const wide = posterFov(40, 4 / 3, 16 / 9);
    expect(wide).toBeLessThan(40);
    expect(Math.tan((wide * Math.PI) / 360) * (16 / 9)).toBeCloseTo(Math.tan((40 * Math.PI) / 360) * (4 / 3), 9);
  });

  it('aims the poster camera at the ground point on its view ray', () => {
    // A camera at (300, 300, 200) looking straight down (local −Z is estate −Z).
    const pose = aerialPose({ eye: [300, 300, 200], quat: [0, 0, 0, 1], vfovDeg: 40, shift: [0, 0], aspect: 4 / 3 }, 4 / 3);
    close(pose.position, estateToThree([300, 300, 200]));
    close(pose.target, estateToThree([300, 300, 0]));
    expect(pose.fovDeg).toBe(40);
    // Pitched up past the horizon: the target stops 400 m out.
    const up = aerialPose({ eye: [0, 0, 10], quat: [Math.SQRT1_2, 0, 0, Math.SQRT1_2], vfovDeg: 40, shift: [0, 0], aspect: 1 }, 1);
    expect(Math.hypot(up.target[0] - up.position[0], up.target[1] - up.position[1], up.target[2] - up.position[2])).toBeCloseTo(400, 6);
  });

  it('falls back to a north-east aerial over the estate centre', () => {
    const pose = fallbackAerialPose();
    const eye = threeToEstate(pose.position);
    const target = threeToEstate(pose.target);
    expect(eye[0]).toBeGreaterThan(400);
    expect(eye[1]).toBeGreaterThan(400);
    expect(eye[2]).toBeGreaterThan(200);
    close(target, [200, 200, 8]);
    expect(posterPose(undefined, 1.5)).toEqual(pose);
  });

  it('round-trips a resume pose through the three world', () => {
    const position: Vec3 = [105, 22, 9];
    const target: Vec3 = [100, 55, 14];
    const pose = resumePose(position, target, 60);
    close(toEstate(pose.position), position);
    close(toEstate(pose.target), target);
    expect(pose.fovDeg).toBe(60);
  });
});

describe('trees', () => {
  const centres = new Float32Array([0, 0, 10, 0, 100, 0, 0, 50]);

  it('splits by plan distance and reports membership changes only', () => {
    const p = createTreePartition(4);
    expect(partitionTrees(centres, 4, 0, 0, 20, p)).toBe(true);
    expect([...p.near.subarray(0, p.nearCount)]).toEqual([0, 1]);
    expect([...p.far.subarray(0, p.farCount)]).toEqual([2, 3]);
    expect(partitionTrees(centres, 4, 1, 0, 20, p)).toBe(false);
    expect(partitionTrees(centres, 4, 0, 0, 60, p)).toBe(true);
    expect(p.nearCount).toBe(3);
  });

  it('puts every tree in the far set at radius 0', () => {
    const p = createTreePartition(4);
    partitionTrees(centres, 4, 0, 0, 0, p);
    expect(p.nearCount).toBe(0);
    expect(p.farCount).toBe(4);
  });

  it('gathers instance matrices in index order', () => {
    const source = new Float32Array(48).map((_, i) => i);
    const target = new Float32Array(48);
    expect(gatherMatrices(source, new Uint32Array([2, 0]), 2, target)).toBe(2);
    expect([...target.subarray(0, 16)]).toEqual([...source.subarray(32, 48)]);
    expect([...target.subarray(16, 32)]).toEqual([...source.subarray(0, 16)]);
  });
});

describe('loaders', () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it('sniffs gzip, GLB, walk, ground and JSON by their first bytes', () => {
    expect(sniff(new Uint8Array([0x1f, 0x8b, 8, 0]))).toBe('gzip');
    expect(sniff(bytes('glTF\u0002\u0000'))).toBe('gltf');
    expect(sniff(bytes('SN5W....'))).toBe('sn5w');
    expect(sniff(bytes('SN5G....'))).toBe('sn5g');
    expect(sniff(bytes('  \n{"a":1}'))).toBe('json');
    expect(sniff(bytes('[1]'))).toBe('json');
    expect(sniff(bytes('<html>'))).toBe('unknown');
    expect(sniff(new Uint8Array(0))).toBe('unknown');
  });

  it('inflates gzip with DecompressionStream and sniffs again', async () => {
    const raw = bytes('glTF and then some');
    expect(new TextDecoder().decode(await gunzip(new Uint8Array(gzipSync(raw))))).toBe('glTF and then some');
    const payload = await readPayload(new Uint8Array(gzipSync(raw)));
    expect(payload.kind).toBe('gltf');
    expect(payload.bytes).toEqual(raw);
    // Already inflated (Content-Encoding: gzip): used as is.
    expect((await readPayload(raw)).kind).toBe('gltf');
  });

  it('refuses a payload it does not know', async () => {
    await expect(readPayload(bytes('<!doctype html>'), 'x')).rejects.toBeInstanceOf(PackFetchError);
    await expect(readPayload(new Uint8Array(gzipSync(gzipSync(bytes('glTF')))), 'x')).rejects.toThrow(/gzip inside gzip/);
  });

  it('takes the pack folder from pack.json\'s URL', () => {
    expect(packBase('/estate/v1.2/pack.2fa7069b.json')).toBe('/estate/v1.2/');
  });
});

describe('levels', () => {
  const site = (i: number): PackBuilding => ({
    id: ESTATE_SITE_IDS[i],
    kind: 'block',
    name: ESTATE_SITE_IDS[i],
    typology: 'SL',
    at: [i * 30, 0],
    bounds: [[i * 30 - 10, -5, 0], [i * 30 + 10, 5, 40]],
    radius: 30,
    footprint: [[-10, -5], [10, -5], [10, 5]],
    roofTop: 40,
    storeys: [],
    spawns: [],
    massing: { mesh: `${ESTATE_SITE_IDS[i]}_massing`, tris: 200, error: 2.4 },
    facade: { path: `f/x${i}.00000000.glb.gz`, bytes: 1, rawBytes: 1, sha256: '0'.repeat(64), gzSha256: '0'.repeat(64), tris: 50000, verts: 1, prims: 2, draws: 2, maxPrimVerts: 1, error: 0.06, edges: 4000, exactMatched: 1 },
    detail: { path: `d/x${i}.00000000.glb.gz`, bytes: 1, rawBytes: 1, sha256: '0'.repeat(64), gzSha256: '0'.repeat(64), tris: 100000, verts: 1, prims: 20, draws: 20, maxPrimVerts: 1, instances: 900 },
  });
  const sites = ESTATE_SITE_IDS.map((_, i) => site(i));

  it('costs massing, F (its line draw only on edge tiers) and D over F', () => {
    const on = levelCosts(sites[0], true);
    expect([...on.tris]).toEqual([200, 50000, 150000]);
    expect([...on.draws]).toEqual([1, 2, 22]);
    const off = levelCosts(sites[0], false);
    expect([...off.draws]).toEqual([1, 1, 21]);
  });

  it('feeds residency and ceilings from the scheduler and derives its views', () => {
    const wiring = new LevelWiring(sites);
    const resident = new Map<string, number>(ESTATE_SITE_IDS.map((id) => [id, RESIDENT_MASSING]));
    resident.set('BLK_501', RESIDENT_MASSING | RESIDENT_FACADE | RESIDENT_DETAIL);
    resident.set('BLK_502', RESIDENT_MASSING | RESIDENT_FACADE | RESIDENT_DETAIL);
    const scheduler = {
      residentMask: (id: string) => resident.get(id) ?? 0,
      levelCap: (id: string) => (id === 'BLK_502' ? LOD_FACADE : LOD_DETAIL),
    } as never;
    const visible = ESTATE_SITE_IDS.map(() => true);
    const selector = wiring.update({
      now: 0, k: 606, tier: ESTATE_TIER_TABLE.high, lean: false, focus: -1,
      eye: [15, -8, 2], visible, reserveTris: 0, reserveDraws: 0,
    }, scheduler);
    expect(selector.level[0]).toBe(LOD_DETAIL); // 5.8 m from BLK_501: D wanted and resident
    expect(wiring.selector.want[1]).toBe(LOD_DETAIL); // BLK_502 is as close and wants D…
    expect(selector.level[1]).toBe(LOD_FACADE); // …but its D failed for good: capped at F
    expect(selector.level[5]).toBe(LOD_MASSING); // only massing resident
    expect(wiring.views).toHaveLength(14);
    expect(wiring.views[0]).toMatchObject({ visible: true, wantDetail: true });
    expect(wiring.views[0].boxDistance).toBeCloseTo(Math.hypot(5, 3), 6);
  });
});

describe('renderer decisions', () => {
  it('needs WebGL2 and DecompressionStream', () => {
    expect(missingCapability({})).toBe('no-webgl2');
    expect(missingCapability({ WebGL2RenderingContext: class {} })).toBe('no-decompression-stream');
    expect(missingCapability({ WebGL2RenderingContext: class {}, DecompressionStream: class {} })).toBeNull();
  });

  it('reads gl.RENDERER unless masked, then the debug extension', () => {
    const gl = (renderer: string, unmasked: string | null) => ({
      RENDERER: 1,
      getParameter: (p: number) => (p === 1 ? renderer : unmasked),
      getExtension: () => (unmasked === null ? null : { UNMASKED_RENDERER_WEBGL: 2 }),
    });
    expect(readRendererString(gl('Mesa Intel(R) Xe Graphics', 'x') as never)).toBe('Mesa Intel(R) Xe Graphics');
    expect(readRendererString(gl('WebKit WebGL', 'ANGLE (NVIDIA GeForce RTX 3060)') as never)).toBe('ANGLE (NVIDIA GeForce RTX 3060)');
    expect(readRendererString(gl('WebKit WebGL', null) as never)).toBe('WebKit WebGL');
  });

  it('chooses tier, pixel ratio and MSAA by §7.7 and §7.9', () => {
    const base = { deviceMemory: 8, cssWidth: 1040, cssHeight: 600, devicePixelRatio: 2, msaaOff: false };
    const nvidia = chooseStart({ ...base, identity: { renderer: 'ANGLE (NVIDIA GeForce RTX 3060)', caveat: false } });
    expect(nvidia.tier).toBe('high');
    // 2.0 Mpx cap: 1040×600 at 1.75 is 1.91 Mpx.
    expect(nvidia.pixelRatio).toBe(1.75);
    expect(nvidia.msaa).toBe(true);
    expect(chooseStart({ ...base, identity: { renderer: 'Google SwiftShader', caveat: false } }).tier).toBe('min');
    expect(chooseStart({ ...base, identity: { renderer: 'ANGLE (NVIDIA)', caveat: true } }).tier).toBe('min');
    expect(chooseStart({ ...base, identity: { renderer: 'Google SwiftShader', caveat: true }, override: 'high' }).tier).toBe('high');
    expect(chooseStart({ ...base, identity: { renderer: 'ANGLE (NVIDIA)', caveat: false }, msaaOff: true }).msaa).toBe(false);
    const low = chooseStart({ ...base, identity: { renderer: 'Intel(R) UHD Graphics 620', caveat: false } });
    expect(low.tier).toBe('low');
    expect(low.msaa).toBe(false);
    expect(chooseStart({ ...base, identity: { renderer: null, caveat: false } }).tier).toBe('mid');
    expect(shouldDropMsaa(true, 'low')).toBe(true);
    expect(shouldDropMsaa(true, 'mid')).toBe(false);
    expect(shouldDropMsaa(false, 'min')).toBe(false);
  });
});

describe('readouts', () => {
  afterEach(() => vi.useRealTimers());
  const stats = (draws: number): FrameStats => ({
    draws, tris: 1000, programs: 6, frameMs: 1.234, tier: 'high', pixelRatio: 1, band: null, gpuBytes: 0,
  });

  it('maps stats onto the data-estate-* attributes, removing a null band', () => {
    expect(readoutValues(stats(38))).toEqual({
      [READOUT_ATTRIBUTES.draws]: '38',
      [READOUT_ATTRIBUTES.tris]: '1000',
      [READOUT_ATTRIBUTES.ms]: '1.23',
      [READOUT_ATTRIBUTES.programs]: '6',
      [READOUT_ATTRIBUTES.band]: null,
    });
    const attrs = new Map<string, string>([['data-estate-band', 'L3–L7']]);
    const writes: string[] = [];
    const host = {
      getAttribute: (n: string) => attrs.get(n) ?? null,
      hasAttribute: (n: string) => attrs.has(n),
      setAttribute: (n: string, v: string) => { writes.push(n); attrs.set(n, v); },
      removeAttribute: (n: string) => { writes.push(`-${n}`); attrs.delete(n); },
    } as unknown as Element;
    writeReadouts(host, readoutValues(stats(38)));
    writeReadouts(host, readoutValues(stats(38)));
    expect(writes).toEqual(['data-estate-draws', 'data-estate-tris', 'data-estate-ms', 'data-estate-programs', '-data-estate-band']);
  });

  it('writes at most twice a second, then flushes the last value', () => {
    vi.useFakeTimers();
    let t = 0;
    const written: number[] = [];
    const throttle = new ReadoutThrottle<number>((v) => written.push(v), () => t);
    throttle.offer(1);
    t = 100; throttle.offer(2);
    t = 200; throttle.offer(3);
    expect(written).toEqual([1]);
    t = 500; vi.advanceTimersByTime(500);
    expect(written).toEqual([1, 3]);
    t = 1200; throttle.offer(4);
    expect(written).toEqual([1, 3, 4]);
    t = 1300; throttle.offer(5);
    throttle.stop();
    vi.advanceTimersByTime(1000);
    expect(written).toEqual([1, 3, 4]);
  });
});

describe('clip planes and fog', () => {
  it('fades Overview from target + 150 to + 800 m and Walk from 120 to 600 m', () => {
    expect(fogRange('overview', 400)).toEqual({ near: 550, far: 1200 });
    expect(fogRange('fly', Number.NaN)).toEqual({ near: 150, far: 800 });
    expect(fogRange('walk', 400)).toEqual({ near: 120, far: 600 });
  });

  it('touches the projection only when a plane moves', () => {
    const camera = new PerspectiveCamera(45, 1, 1, 2000);
    const spy = vi.spyOn(camera, 'updateProjectionMatrix');
    const pose = { nearestBoxDistance: 400, heightAboveFloor: 300, orbitDistance: 600, reversedDepth: false };
    expect(applyClip(camera, 'overview', pose)).toBe(true);
    expect(camera.near).toBe(20);
    expect(camera.far).toBe(1400);
    expect(applyClip(camera, 'overview', pose)).toBe(false);
    expect(applyClip(camera, 'walk', pose)).toBe(true);
    expect(camera.near).toBe(0.08);
    expect(camera.far).toBe(600);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('GPU bytes', () => {
  it('counts vertex, index and instance buffers, shared arrays once', () => {
    const geometry = new BufferGeometry();
    const position = new BufferAttribute(new Int16Array(30), 3, true);
    geometry.setAttribute('position', position);
    geometry.setAttribute('_meta', new BufferAttribute(new Uint8Array(40), 4));
    geometry.setIndex(new BufferAttribute(new Uint16Array(12), 1));
    const mesh = new InstancedMesh(geometry, new MeshBasicMaterial(), 5);
    expect(gpuBytes(mesh)).toBe(60 + 40 + 24 + 5 * 64);
    const shared = new BufferGeometry();
    shared.setAttribute('position', position);
    shared.setAttribute('copy', position);
    expect(gpuBytes({ geometry: shared })).toBe(60);
  });
});
