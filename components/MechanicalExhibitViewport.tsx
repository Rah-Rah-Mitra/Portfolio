import React, { useEffect, useRef, useState } from 'react';
import type { PortfolioWorldEvent } from '../types';
import { PORTFOLIO_WORLD_EVENT } from '../lib/worldEvents';

export type MechanismAssetId = 'optical-rail' | 'flow-shop-machine' | 'spatial-allocation-table';

type MechanismAssetDefinition = {
  model: string;
  poster: string;
  alt: string;
  description: string;
};

export const mechanismAssets: Record<MechanismAssetId, MechanismAssetDefinition> = {
  'optical-rail': {
    model: '/workstation/models/optical-rail.glb',
    poster: '/workstation/posters/optical-bench.webp',
    alt: 'Rendered optical rail with camera, aperture, and calibration plane',
    description: 'Camera controls update real optical-rail geometry while the tested projection model remains authoritative.',
  },
  'flow-shop-machine': {
    model: '/workstation/models/flow-shop-machine.glb',
    poster: '/workstation/posters/flow-shop-machine.webp',
    alt: 'Rendered two-machine flow-shop mechanism',
    description: 'The deterministic TypeScript schedule drives the positions of the three jobs in this real GLB mechanism.',
  },
  'spatial-allocation-table': {
    model: '/workstation/models/spatial-allocation-table.glb',
    poster: '/workstation/posters/spatial-allocation-table.webp',
    alt: 'Rendered spatial allocation table with plots and movable marker',
    description: 'The tested distance and eligibility model drives the marker on this real GLB allocation table.',
  },
};

type MechanicalExhibitViewportProps = {
  assetId: MechanismAssetId;
  enhanced: boolean;
};

const MechanicalExhibitViewport: React.FC<MechanicalExhibitViewportProps> = ({ assetId, enhanced }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<{ rotate: (delta: number) => void; reset: () => void }>({ rotate: () => undefined, reset: () => undefined });
  const [status, setStatus] = useState<'static' | 'loading' | 'ready' | 'failed'>('static');
  const asset = mechanismAssets[assetId];

  useEffect(() => {
    const mount = mountRef.current;
    if (!enhanced || !mount) { setStatus('static'); return undefined; }
    let cancelled = false;
    let dispose = () => undefined;
    setStatus('loading');

    Promise.all([import('three'), import('three/examples/jsm/loaders/GLTFLoader.js')]).then(async ([THREE, { GLTFLoader }]) => {
      if (cancelled) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      } catch {
        if (!cancelled) setStatus('failed');
        return;
      }

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.domElement.tabIndex = -1;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, .01, 100);
      camera.position.set(5.4, 4.2, 6.4);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5653, 2.4));
      const key = new THREE.DirectionalLight(0xffffff, 4.2);
      key.position.set(4, 7, 5);
      scene.add(key);
      const stage = new THREE.Group();
      scene.add(stage);

      let root: InstanceType<typeof THREE.Group> | null = null;
      let rotation = -.55;
      let dragging = false;
      let pointerId: number | null = null;
      let startX = 0;
      let previousX = 0;
      const render = () => renderer.render(scene, camera);
      const reset = () => { rotation = -.55; if (root) root.rotation.y = rotation; render(); };
      const rotate = (delta: number) => { rotation += delta; if (root) root.rotation.y = rotation; render(); };
      controlsRef.current = { rotate, reset };

      const resize = () => {
        const bounds = mount.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        renderer.setSize(bounds.width, bounds.height, false);
        camera.aspect = bounds.width / bounds.height;
        camera.updateProjectionMatrix();
        render();
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);

      const pointerDown = (event: PointerEvent) => { pointerId = event.pointerId; startX = event.clientX; previousX = event.clientX; dragging = false; };
      const pointerMove = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        if (!dragging && Math.abs(event.clientX - startX) < 8) return;
        dragging = true;
        if (!mount.hasPointerCapture(event.pointerId)) mount.setPointerCapture(event.pointerId);
        event.preventDefault();
        rotate((event.clientX - previousX) * .008);
        previousX = event.clientX;
      };
      const pointerUp = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        if (mount.hasPointerCapture(event.pointerId)) mount.releasePointerCapture(event.pointerId);
        pointerId = null;
        dragging = false;
      };
      mount.addEventListener('pointerdown', pointerDown);
      mount.addEventListener('pointermove', pointerMove);
      mount.addEventListener('pointerup', pointerUp);
      mount.addEventListener('pointercancel', pointerUp);

      const worldEvent = (event: Event) => {
        if (!root) return;
        const detail = (event as CustomEvent<PortfolioWorldEvent>).detail;
        if (detail.type === 'JOB_REORDERED' && assetId === 'flow-shop-machine') {
          detail.order.forEach((jobId, index) => {
            const job = root?.getObjectByName(`Job ${jobId.replace(/\D/g, '')}`);
            if (job) job.position.x = -1.7 + index * 1.7;
          });
        }
        if (detail.type === 'MAP_MARKER_MOVED' && assetId === 'spatial-allocation-table') {
          const marker = root.getObjectByName('Allocation marker');
          const head = root.getObjectByName('Marker head');
          const x = Math.max(-2.1, Math.min(2.1, detail.coordinates[0] * .42));
          const y = Math.max(-1.45, Math.min(1.45, detail.coordinates[1] * .29));
          if (marker) { marker.position.x = x; marker.position.z = -y; }
          if (head) { head.position.x = x; head.position.z = -y; }
        }
        if (detail.type === 'CAMERA_LAB_UPDATED' && assetId === 'optical-rail') {
          const focusRing = root.getObjectByName('Focus ring');
          const imagePlane = root.getObjectByName('Image plane');
          if (focusRing) focusRing.rotation.x = detail.snapshot.optics.focusDistanceMm / 800;
          if (imagePlane) imagePlane.position.x = Math.max(1.25, Math.min(2.65, detail.snapshot.intrinsics.focalLengthMm / 24));
        }
        if (detail.type === 'LAB_RESET') reset();
        render();
      };
      addEventListener(PORTFOLIO_WORLD_EVENT, worldEvent);

      try {
        const gltf = await new GLTFLoader().loadAsync(asset.model);
        if (cancelled) return;
        root = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(root);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const scale = 4.8 / Math.max(size.x, size.y, size.z, .001);
        root.position.sub(center);
        root.scale.setScalar(scale);
        root.rotation.y = rotation;
        stage.add(root);
        camera.lookAt(0, .15, 0);
        resize();
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('failed');
      }

      dispose = () => {
        removeEventListener(PORTFOLIO_WORLD_EVENT, worldEvent);
        resizeObserver.disconnect();
        mount.removeEventListener('pointerdown', pointerDown);
        mount.removeEventListener('pointermove', pointerMove);
        mount.removeEventListener('pointerup', pointerUp);
        mount.removeEventListener('pointercancel', pointerUp);
        root?.traverse((object) => {
          if (!('isMesh' in object) || !object.isMesh) return;
          const mesh = object as InstanceType<typeof THREE.Mesh>;
          mesh.geometry.dispose();
          (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    }).catch(() => { if (!cancelled) setStatus('failed'); });

    return () => { cancelled = true; controlsRef.current = { rotate: () => undefined, reset: () => undefined }; dispose(); };
  }, [asset.model, assetId, enhanced]);

  const rotateByKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>, direction: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    controlsRef.current.rotate((event.key === 'ArrowRight' ? 1 : -1) * direction * (event.shiftKey ? .5 : .15));
  };

  return (
    <figure className="mechanical-exhibit" data-mechanism={assetId} data-render-state={status}>
      <div className="mechanical-exhibit-viewport" ref={mountRef} aria-hidden="true" />
      <img src={asset.poster} width="768" height="512" alt={asset.alt} decoding="async" />
      <figcaption>
        <p>{asset.description}</p>
        <div className="mechanical-exhibit-controls" aria-label="Mechanism view controls">
          <button type="button" disabled={!enhanced} aria-label="Rotate mechanism left" onClick={() => controlsRef.current.rotate(-.18)} onKeyDown={(event) => rotateByKeyboard(event, 1)}>−15°</button>
          <button type="button" disabled={!enhanced} aria-label="Reset mechanism view" onClick={() => controlsRef.current.reset()}>Reset view</button>
          <button type="button" disabled={!enhanced} aria-label="Rotate mechanism right" onClick={() => controlsRef.current.rotate(.18)} onKeyDown={(event) => rotateByKeyboard(event, 1)}>+15°</button>
          <span role="status">{status === 'ready' ? 'Interactive GLB ready' : status === 'loading' ? 'Loading real geometry…' : status === 'failed' ? 'Rendered fallback active' : 'Static rendered fallback'}</span>
        </div>
      </figcaption>
    </figure>
  );
};

export default MechanicalExhibitViewport;
