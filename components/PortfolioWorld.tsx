import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneModel } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fieldNoteByIdOrAlias, projectHighlights } from '../portfolioData';
import { useEffects } from '../contexts/PhysicsContext';
import { captureAnalyticsException, summarizeUrlTarget, track, triggerSessionReplay } from '../lib/analytics';

type NpcDefinition = {
  id: string;
  name: string;
  projectId: string;
  eventId: string;
  modelUrl: string;
  preferredClip: string[];
  position: [number, number, number];
  color: string;
};

type RuntimeNpc = {
  definition: NpcDefinition;
  group: THREE.Group;
};

const npcDefinitions: NpcDefinition[] = [
  {
    id: 'volt-pulse-guide',
    name: 'Volt Pulse Guide',
    projectId: 'volt-pulse-sg',
    eventId: 'smu-hack-for-cities-2026',
    modelUrl: '/models/village-blacksmith-npc.glb',
    preferredClip: ['Talking_Gesture', 'Idle_Stationary'],
    position: [-5, 0, -2.5],
    color: '#34d399',
  },
  {
    id: 'waaah-comics-guide',
    name: 'Waaah Comics Guide',
    projectId: 'waaah-comics',
    eventId: 'waaah-comics',
    modelUrl: '/models/toon-blaster-runner.glb',
    preferredClip: ['Run_InPlace', 'Walk_InPlace', 'Idle_Stationary'],
    position: [-2.5, 0, -4.7],
    color: '#a78bfa',
  },
  {
    id: 'spectrum-guide',
    name: 'OnTheSpectrum Guide',
    projectId: 'on-the-spectrum',
    eventId: 'january-gauntlet-2026',
    modelUrl: '/models/on_the_spectrum-painter-chibi.glb',
    preferredClip: ['Walk_InPlace', 'Idle_Stationary'],
    position: [0, 0, -5.7],
    color: '#22d3ee',
  },
  {
    id: 'arcane-guide',
    name: 'Arcane Security Guide',
    projectId: 'arcane',
    eventId: 'certification-trail',
    modelUrl: '/models/forest-ranger-npc.glb',
    preferredClip: ['Aim_Hold', 'Idle_Stationary'],
    position: [2.7, 0, -4.5],
    color: '#f87171',
  },
  {
    id: 'utopia-guide',
    name: 'Utopia Systems Guide',
    projectId: 'project-utopia',
    eventId: 'nvidia-disaster-risk',
    modelUrl: '/models/forest-ranger-npc.glb',
    preferredClip: ['Walk_InPlace', 'Idle_Stationary'],
    position: [5.2, 0, -2.4],
    color: '#fbbf24',
  },
  {
    id: 'churp-guide',
    name: 'Churp Community Guide',
    projectId: 'churp',
    eventId: 'sparks-by-pa-churp',
    modelUrl: '/models/village-blacksmith-npc.glb',
    preferredClip: ['Talking_Gesture', 'Idle_Stationary'],
    position: [4.8, 0, 2.4],
    color: '#86efac',
  },
  {
    id: 'asyncddgs-guide',
    name: 'AsyncDDGS Guide',
    projectId: 'asyncddgs',
    eventId: 'software-achievement-6',
    modelUrl: '/models/toon-blaster-runner.glb',
    preferredClip: ['Walk_InPlace', 'Idle_Stationary'],
    position: [-4.8, 0, 3.8],
    color: '#67e8f9',
  },
  {
    id: 'geometry-guide',
    name: 'Geometry Guide',
    projectId: 'geometry',
    eventId: 'nus-education',
    modelUrl: '/models/forest-ranger-npc.glb',
    preferredClip: ['Idle_Stationary', 'Walk_InPlace'],
    position: [0, 0, 3.9],
    color: '#93c5fd',
  },
  {
    id: 'agewell-guide',
    name: 'AgeWellLah Guide',
    projectId: 'agewelllah-ai',
    eventId: 'software-achievement-2',
    modelUrl: '/models/village-blacksmith-npc.glb',
    preferredClip: ['Talking_Gesture', 'Idle_Stationary'],
    position: [2.8, 0, 4],
    color: '#86efac',
  },
];

const createLabel = (text: string, color: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    return new THREE.Sprite();
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(2, 6, 23, 0.82)';
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.roundRect(10, 18, 492, 92, 18);
  context.fill();
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = '700 36px Inter, Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 256, 64, 448);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.8, 0.7, 1);
  return sprite;
};

const selectClip = (clips: THREE.AnimationClip[], preferred: string[]) => (
  preferred.map((name) => clips.find((clip) => clip.name === name)).find(Boolean) ?? clips[0]
);

const uniqueTags = (tags: string[]) => {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const PortfolioWorld: React.FC = () => {
  const { worldOpen, closeWorld, settings } = useEffects();
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeNpcs = useRef<RuntimeNpc[]>([]);
  const activeNpcIdRef = useRef<string | null>(null);
  const pointerLockedRef = useRef(false);
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const npcCopy = useMemo(() => {
    const projects = new Map(projectHighlights.map((project) => [project.id, project]));

    return new Map(npcDefinitions.map((npc) => {
      const project = projects.get(npc.projectId);
      const event = fieldNoteByIdOrAlias.get(npc.eventId);
      return [npc.id, {
        title: project?.title ?? npc.name,
        role: project?.npcRole ?? 'project guide',
        description: project?.description ?? '',
        eventTitle: event?.title ?? '',
        dialogue: event?.npcDialogue ?? event?.summary ?? project?.description ?? '',
        url: project?.repoUrl ?? project?.liveUrl ?? event?.links?.[0]?.url,
        tags: uniqueTags([...(event?.tags ?? []), ...(project?.tags ?? [])]),
      }];
    }));
  }, []);

  const selectedNpc = selectedNpcId ? npcCopy.get(selectedNpcId) : null;
  const activeNpc = activeNpcId ? npcCopy.get(activeNpcId) : null;

  const openNpcDialogue = useCallback((npcId: string, method: string) => {
    const npc = npcCopy.get(npcId);
    setSelectedNpcId(npcId);
    track('npc_dialogue_opened', {
      npc_id: npcId,
      title: npc?.title ?? npcId,
      method,
    });
    triggerSessionReplay('npc_dialogue_opened', { source: npcId });
  }, [npcCopy]);

  useEffect(() => {
    const handleNpcDialogue = (event: Event) => {
      const detail = (event as CustomEvent<{ npcId: string }>).detail;
      if (detail?.npcId) {
        openNpcDialogue(detail.npcId, 'assistant');
      }
    };

    window.addEventListener('portfolio:npcDialogue', handleNpcDialogue);
    return () => window.removeEventListener('portfolio:npcDialogue', handleNpcDialogue);
  }, [openNpcDialogue]);

  useEffect(() => {
    if (!worldOpen || !mountRef.current) return;

    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    scene.fog = new THREE.Fog(0x020617, 10, 28);

    const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 2.3, 7.5);
    camera.rotation.order = 'YXZ';

    const renderer = new THREE.WebGLRenderer({ antialias: settings.world.quality === 'high', alpha: false });
    renderer.setPixelRatio(settings.world.quality === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0x9bdcff, 0x15111f, 1.8);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(4, 8, 4);
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18, 48, 48),
      new THREE.MeshStandardMaterial({
        color: 0x050816,
        metalness: 0.25,
        roughness: 0.65,
        emissive: 0x061b24,
        emissiveIntensity: 0.55,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const grid = new THREE.GridHelper(18, 18, 0x22d3ee, 0x1e293b);
    grid.position.y = 0.01;
    scene.add(grid);

    const portalRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.08, 16, 96),
      new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.5 }),
    );
    portalRing.position.set(0, 1.9, -7.2);
    scene.add(portalRing);

    const loader = new GLTFLoader();
    const mixers: THREE.AnimationMixer[] = [];
    const disposables: THREE.Object3D[] = [floor, grid, portalRing];
    const raycaster = new THREE.Raycaster();
    const centerPointer = new THREE.Vector2(0, 0);
    const pointer = new THREE.Vector2();
    runtimeNpcs.current = [];

    const loadModel = async (definition: NpcDefinition) => {
      try {
        const gltf = await loader.loadAsync(definition.modelUrl);
        const model = cloneModel(gltf.scene);
        const group = new THREE.Group();
        group.position.set(...definition.position);
        group.scale.setScalar(definition.modelUrl.includes('chibi') ? 1.2 : 0.9);
        group.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.position.y -= box.min.y - center.y;
        group.lookAt(0, 0, 1);

        const label = createLabel(definition.name, definition.color);
        label.position.set(0, 2.7, 0);
        group.add(label);

        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.85, 1.05, 0.08, 48),
          new THREE.MeshStandardMaterial({ color: new THREE.Color(definition.color), emissive: new THREE.Color(definition.color), emissiveIntensity: 0.75 }),
        );
        base.position.y = 0.04;
        group.add(base);

        scene.add(group);
        disposables.push(group);
        runtimeNpcs.current.push({ definition, group });

        if (gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(model);
          const clip = selectClip(gltf.animations, definition.preferredClip);
          if (clip) {
            mixer.clipAction(clip).play();
            mixers.push(mixer);
          }
        }
      } catch (error) {
        captureAnalyticsException(error, {
          area: 'portfolio_world_npc_model',
          npc_id: definition.id,
        });
      }
    };

    const loadStaticAsset = async (url: string, position: THREE.Vector3, scale: number, rotationY = 0) => {
      try {
        const gltf = await loader.loadAsync(url);
        const model = gltf.scene;
        model.position.copy(position);
        model.scale.setScalar(scale);
        model.rotation.y = rotationY;
        scene.add(model);
        disposables.push(model);
      } catch (error) {
        captureAnalyticsException(error, {
          area: 'portfolio_world_static_asset',
          asset_path: url,
        });
        // Decorative assets are non-critical; the core hub remains usable without them.
      }
    };

    void Promise.all(npcDefinitions.map(loadModel));
    void loadStaticAsset('/models/blacksmith-forge-workbench.glb', new THREE.Vector3(-6.4, 0, 2.7), 0.75, Math.PI / 5);
    void loadStaticAsset('/models/tree.glb', new THREE.Vector3(-6.5, 0, -6.2), 1.25);
    void loadStaticAsset('/models/compact-clockwork-reading-chair.glb', new THREE.Vector3(6.5, 0, 5), 1.1, -Math.PI / 4);
    void loadStaticAsset('/models/violet-rift-portal.glb', new THREE.Vector3(0, 0, -7.4), 1.3);

    const keys = new Set<string>();
    let lastFrameTime = performance.now();
    let yaw = 0;
    let pitch = -0.08;
    let isPointerDown = false;
    let lastX = 0;
    let lastY = 0;
    let animationId = 0;
    const up = new THREE.Vector3(0, 1, 0);

    const setCameraRotation = () => {
      pitch = Math.max(-0.85, Math.min(0.55, pitch));
      camera.rotation.set(pitch, yaw, 0);
    };

    const findTargetedNpc = (targetPointer: THREE.Vector2) => {
      raycaster.setFromCamera(targetPointer, camera);
      const intersections = raycaster.intersectObjects(runtimeNpcs.current.map((npc) => npc.group), true);
      for (const intersection of intersections) {
        const targetedNpc = runtimeNpcs.current.find((npc) => {
          let current: THREE.Object3D | null = intersection.object;
          while (current) {
            if (current === npc.group) return true;
            current = current.parent;
          }
          return false;
        });
        if (targetedNpc) return targetedNpc;
      }
      return null;
    };

    const updateActiveNpc = () => {
      const nextActiveNpcId = findTargetedNpc(centerPointer)?.definition.id ?? null;
      if (activeNpcIdRef.current !== nextActiveNpcId) {
        activeNpcIdRef.current = nextActiveNpcId;
        setActiveNpcId(nextActiveNpcId);
      }
    };

    const animate = () => {
      const now = performance.now();
      const delta = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;
      mixers.forEach((mixer) => mixer.update(delta));
      portalRing.rotation.z += delta * 0.45;

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, up).normalize();
      const movement = new THREE.Vector3();
      if (keys.has('KeyW') || keys.has('ArrowUp')) movement.add(forward);
      if (keys.has('KeyS') || keys.has('ArrowDown')) movement.sub(forward);
      if (keys.has('KeyD') || keys.has('ArrowRight')) movement.add(right);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) movement.sub(right);
      if (movement.lengthSq() > 0) {
        movement.normalize().multiplyScalar(delta * 4.2);
        camera.position.add(movement);
        camera.position.x = Math.max(-8, Math.min(8, camera.position.x));
        camera.position.z = Math.max(-8, Math.min(8, camera.position.z));
      }
      updateActiveNpc();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE'].includes(event.code)) {
        event.preventDefault();
      }
      if (event.code === 'KeyE' && activeNpcIdRef.current) {
        openNpcDialogue(activeNpcIdRef.current, 'keyboard');
      }
      keys.add(event.code);
    };
    const handleKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const findClickedNpc = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      return findTargetedNpc(pointer);
    };
    const handlePointerDown = (event: PointerEvent) => {
      isPointerDown = true;
      lastX = event.clientX;
      lastY = event.clientY;
      const clickedNpc = findClickedNpc(event);
      if (clickedNpc) {
        openNpcDialogue(clickedNpc.definition.id, 'click');
      }
      const pointerLockRequest = renderer.domElement.requestPointerLock?.();
      if (pointerLockRequest) {
        void pointerLockRequest.catch(() => undefined);
      }
    };
    const handlePointerUp = () => {
      isPointerDown = false;
    };
    const handlePointerMove = (event: PointerEvent) => {
      const pointerLocked = document.pointerLockElement === renderer.domElement;
      if (!pointerLocked && !isPointerDown) return;
      const dx = pointerLocked ? event.movementX : event.clientX - lastX;
      const dy = pointerLocked ? event.movementY : event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      yaw -= dx * 0.0026;
      pitch -= dy * 0.0022;
      setCameraRotation();
    };
    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement === renderer.domElement;
      if (pointerLockedRef.current !== locked) {
        pointerLockedRef.current = locked;
        track('pointer_lock_changed', { locked });
      }
      setIsPointerLocked(locked);
      isPointerDown = locked;
    };

    setCameraRotation();
    animate();
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerlockchange', handlePointerLockChange);

    return () => {
      cancelAnimationFrame(animationId);
      runtimeNpcs.current = [];
      activeNpcIdRef.current = null;
      pointerLockedRef.current = false;
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock?.();
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      mixers.forEach((mixer) => mixer.stopAllAction());
      disposables.forEach((object) => {
        object.traverse((child: THREE.Object3D) => {
          const mesh = child as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material?.dispose?.();
        });
        scene.remove(object);
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [openNpcDialogue, settings.world.quality, worldOpen]);

  if (!worldOpen) return null;

  return (
    <div className="portfolio-world fixed inset-0 z-[90] bg-black text-white">
      <div ref={mountRef} className="h-full w-full" aria-label="Playable 3D portfolio world" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-[1] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <div
          aria-hidden="true"
          className={`absolute h-2 w-2 rounded-full border transition-colors ${
            activeNpc ? 'border-cyan-200 bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.8)]' : 'border-white/70 bg-white/30'
          }`}
        />
        <div aria-hidden="true" className={`absolute h-px w-12 transition-colors ${activeNpc ? 'bg-cyan-200' : 'bg-white/70'}`} />
        <div aria-hidden="true" className={`absolute h-12 w-px transition-colors ${activeNpc ? 'bg-cyan-200' : 'bg-white/70'}`} />
        <span className="sr-only">{activeNpc ? `Aiming at ${activeNpc.title}` : 'Center crosshair'}</span>
      </div>
      <div className="absolute left-4 right-32 top-4 max-w-sm rounded-lg border border-cyan-400/30 bg-gray-950/85 p-4 shadow-2xl backdrop-blur sm:right-auto">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Portfolio World</p>
        <h2 className="text-xl font-bold">Explore Rahul's Build Map</h2>
        <p className="mt-2 text-sm text-gray-300">
          Click the world to lock mouse look. WASD follows the camera. Aim at a guide and press E, or click a guide to talk.
        </p>
        <p className="mt-2 text-xs font-semibold text-cyan-200">
          {isPointerLocked ? 'Mouse look active. Press Esc to release.' : 'Mouse look ready.'}
        </p>
        {activeNpc && (
          <button
            type="button"
            onClick={() => activeNpcId && openNpcDialogue(activeNpcId, 'cta')}
            data-analytics-id="world-talk-active-npc"
            className="mt-3 rounded-md bg-cyan-400 px-3 py-2 text-sm font-bold text-black hover:bg-cyan-300"
          >
            Talk to {activeNpc.title}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => closeWorld('exit_button')}
        data-analytics-id="world-close"
        className="absolute right-4 top-4 rounded-md border border-white/15 bg-gray-950/85 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:border-cyan-300 hover:text-cyan-200"
      >
        Exit world
      </button>
      {selectedNpc && (
        <div className="absolute bottom-5 left-1/2 w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-cyan-400/30 bg-gray-950/92 p-5 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">{selectedNpc.role}</p>
              <h3 className="text-2xl font-bold text-white">{selectedNpc.title}</h3>
            </div>
            <button type="button" onClick={() => setSelectedNpcId(null)} className="rounded border border-white/10 px-2 py-1 text-sm text-gray-300 hover:text-white">
              Close
            </button>
          </div>
          <p className="mb-3 text-sm leading-relaxed text-gray-300">{selectedNpc.dialogue}</p>
          {selectedNpc.eventTitle && <p className="mb-3 text-xs font-semibold text-cyan-200">Linked event: {selectedNpc.eventTitle}</p>}
          <div className="mb-4 flex flex-wrap gap-2">
            {selectedNpc.tags.slice(0, 5).map((tag) => (
              <span key={tag} className="rounded bg-white/5 px-2.5 py-1 text-xs text-gray-300">{tag}</span>
            ))}
          </div>
          {selectedNpc.url && (
            <a
              href={selectedNpc.url}
              target="_blank"
              rel="noopener noreferrer"
              data-analytics-id="world-open-linked-work"
              onClick={() => track('world_link_clicked', {
                npc_id: selectedNpcId ?? 'unknown',
                title: selectedNpc.title,
                destination_host: summarizeUrlTarget(selectedNpc.url ?? '').target_host,
              })}
              className="inline-flex rounded-md border border-cyan-300/40 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/10"
            >
              Open linked work
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default PortfolioWorld;
