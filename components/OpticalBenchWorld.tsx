import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { NarrativeController } from '../lib/NarrativeController';
import { WorldAnchorRegistry } from '../lib/WorldAnchorRegistry';
import type { CameraShotDefinition, PortfolioWorldEvent, ResponsiveTier } from '../types';
import { createNeutralCourierPlaceholder } from '../world/courierAsset';
import { cameraShots, worldAnchorDefinitions } from '../world/narrativeManifest';

gsap.registerPlugin(ScrollTrigger);

type DirectorComponent = React.ComponentType<{ shot: CameraShotDefinition; onChange: (shot: CameraShotDefinition) => void }>;
const worldEventName = 'portfolio:world-event';
const exploreEventName = 'portfolio:explore-control';

const OpticalBenchWorld: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [owner, setOwner] = useState<'story' | 'visitor' | 'transition'>('story');
  const [activeShot, setActiveShot] = useState<CameraShotDefinition>(cameraShots[0]);
  const activeShotRef = useRef<CameraShotDefinition>(cameraShots[0]);
  const [Director, setDirector] = useState<DirectorComponent | null>(null);

  useEffect(() => {
    let active = true;
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('director') === '1') {
      import('./CameraDirector').then((module) => { if (active) setDirector(() => module.default); });
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(activeShot.fov, 1, activeShot.near, activeShot.far);
    camera.position.fromArray(activeShot.position); camera.lookAt(...activeShot.target);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' }); }
    catch { mount.dataset.worldFailure = 'true'; return undefined; }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.domElement.tabIndex = -1;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    mount.appendChild(renderer.domElement);

    const paper = new THREE.MeshStandardMaterial({ color: 0xf5f8f7, roughness: 0.9 });
    const graphite = new THREE.MeshStandardMaterial({ color: 0x111816, roughness: 0.65, metalness: 0.08 });
    const teal = new THREE.MeshStandardMaterial({ color: 0x0b7169, roughness: 0.48, metalness: 0.12 });
    const amber = new THREE.MeshStandardMaterial({ color: 0x95590e, roughness: 0.52 });
    const violetLine = new THREE.LineBasicMaterial({ color: 0x6650a4, transparent: true, opacity: 0.7 });
    scene.add(new THREE.HemisphereLight(0xffffff, 0x53605d, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(4, 7, 6); scene.add(key);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(10, 0.12, 5), paper); platform.position.y = -0.12; scene.add(platform);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.1, 0.18), graphite); rail.position.set(0, 0.18, 0); scene.add(rail);
    [-3.5, -1.75, 0, 1.75, 3.5].forEach((x, index) => { const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 10), index === 2 ? amber : teal); marker.position.set(x, 0.36, 0); scene.add(marker); });
    const imagePlane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.58, side: THREE.DoubleSide })); imagePlane.position.set(2.6, 1.25, 0); imagePlane.rotation.y = Math.PI / 2; scene.add(imagePlane);
    const iris = new THREE.Group(); iris.position.set(-2.4, 1.25, 0); scene.add(iris);
    for (let index = 0; index < 7; index += 1) { const blade = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.16, 0.04), graphite); blade.position.x = 0.38; blade.rotation.z = index * Math.PI * 2 / 7; iris.add(blade); }
    const rays = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2.4, 1.25, 0), new THREE.Vector3(2.6, 1.95, 1.2), new THREE.Vector3(-2.4, 1.25, 0), new THREE.Vector3(2.6, 0.55, -1.2)]), violetLine); scene.add(rays);
    const frustum = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ConeGeometry(1.2, 3.2, 4, 1, true)), new THREE.LineBasicMaterial({ color: 0x0b7169 })); frustum.rotation.z = -Math.PI / 2; frustum.position.set(0.8, 1.25, 0); scene.add(frustum);
    const courier = createNeutralCourierPlaceholder(); courier.root.position.set(-0.8, 0, 1.25); scene.add(courier.root);

    const controller = new NarrativeController({ chapterId: 'home', cameraShotId: 'overview', characterPoseId: 'home-arrival-forward' });
    const render = () => renderer.render(scene, camera);
    const applyShot = (shot: CameraShotDefinition, duration = shot.transition.duration) => {
      activeShotRef.current = shot; setActiveShot(shot);
      camera.near = shot.near; camera.far = shot.far; camera.fov = shot.fov; camera.updateProjectionMatrix();
      gsap.to(camera.position, { x: shot.position[0], y: shot.position[1], z: shot.position[2], duration, ease: shot.transition.easing, overwrite: true, onUpdate: () => { camera.lookAt(...shot.target); render(); } });
    };
    const registry = new WorldAnchorRegistry({ refresh: () => ScrollTrigger.refresh() });
    worldAnchorDefinitions.forEach((definition) => registry.register(definition)); registry.start();
    const resize = () => { const { width, height } = mount.getBoundingClientRect(); if (!width || !height) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render(); };
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(mount); resize();
    const localSurface = mount.closest('.optical-world');
    const visibilityObserver = new IntersectionObserver((entries) => {
      mount.toggleAttribute('data-scene-visible', entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.15));
    }, { threshold: [0, 0.15, 0.5] });
    if (localSurface) visibilityObserver.observe(localSurface);

    const media = gsap.matchMedia();
    media.add({ desktop: '(min-width: 921px)', tablet: '(min-width: 681px) and (max-width: 920px)', mobile: '(max-width: 680px)' }, (context) => {
      const tier: ResponsiveTier = context.conditions?.mobile ? 'mobile' : context.conditions?.tablet ? 'tablet' : 'desktop';
      const triggers = cameraShots.map((shot) => ScrollTrigger.create({
        trigger: `#${shot.chapterId}`,
        start: 'clamp(top 78%)', end: 'clamp(bottom 22%)',
        preventOverlaps: 'portfolio-narrative', fastScrollEnd: 2500, invalidateOnRefresh: true,
        onUpdate: (self) => {
          const result = controller.updateScroll({ chapterId: shot.chapterId, progress: self.progress, velocityPxPerSecond: self.getVelocity(), cameraShotId: shot.id });
          courier.setPose(result.poseId); if (controller.getState().controlOwner !== 'visitor') applyShot({ ...shot, ...(tier === 'desktop' ? {} : shot.responsive?.[tier]) }, result.durationMs / 1000); render();
        },
        onEnter: () => { const resolved = registry.resolve(shot, tier).find((anchor) => anchor.chapterId === shot.chapterId); if (resolved) courier.root.position.fromArray(resolved.worldPosition); applyShot(shot); }, onEnterBack: () => { const resolved = registry.resolve(shot, tier).find((anchor) => anchor.chapterId === shot.chapterId); if (resolved) courier.root.position.fromArray(resolved.worldPosition); applyShot(shot); },
      }));
      return () => triggers.forEach((trigger) => trigger.kill());
    });

    let dragging = false; let primedPointer: number | null = null; let originX = 0; let previousX = 0;
    const pointerDown = (event: PointerEvent) => { if (controller.getState().controlOwner !== 'visitor') return; primedPointer = event.pointerId; originX = event.clientX; previousX = event.clientX; };
    const pointerMove = (event: PointerEvent) => { if (primedPointer !== event.pointerId || controller.getState().controlOwner !== 'visitor') return; if (!dragging && Math.abs(event.clientX - originX) < 8) return; if (!dragging) { dragging = true; renderer.domElement.setPointerCapture(event.pointerId); } event.preventDefault(); const delta = event.clientX - previousX; previousX = event.clientX; scene.rotation.y += delta * 0.004; render(); };
    const pointerUp = (event: PointerEvent) => { dragging = false; primedPointer = null; if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId); };
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointermove', pointerMove); renderer.domElement.addEventListener('pointerup', pointerUp); renderer.domElement.addEventListener('pointercancel', pointerUp);
    const worldEvent = (event: Event) => { const detail = (event as CustomEvent<PortfolioWorldEvent>).detail; controller.dispatch(detail); courier.setPose(controller.getState().reaction?.id ?? controller.getState().characterPoseId); render(); };
    const exploreEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ action: 'enter' | 'exit'; sceneId: 'camera-laboratory' }>).detail;
      if (detail.action === 'enter') { controller.enterExplore(detail.sceneId); setOwner('visitor'); renderer.domElement.style.pointerEvents = 'auto'; }
      else { const transition = controller.exitExplore('exit'); setOwner('transition'); renderer.domElement.style.pointerEvents = 'none'; applyShot(activeShotRef.current, transition.durationMs / 1000); if (transitionTimer !== null) window.clearTimeout(transitionTimer); transitionTimer = window.setTimeout(() => { controller.completeTransition(); setOwner('story'); transitionTimer = null; }, transition.durationMs); }
    };
    let transitionTimer: number | null = null;
    window.addEventListener(worldEventName, worldEvent); window.addEventListener(exploreEventName, exploreEvent);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && controller.getState().controlOwner === 'visitor') window.dispatchEvent(new CustomEvent(exploreEventName, { detail: { action: 'exit', sceneId: 'camera-laboratory' } })); };
    window.addEventListener('keydown', escape); render();
    const leaveOnScroll = () => {
      if (controller.getState().controlOwner !== 'visitor') return;
      const bounds = mount.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > window.innerHeight) window.dispatchEvent(new CustomEvent(exploreEventName, { detail: { action: 'exit', sceneId: 'camera-laboratory' } }));
    };
    window.addEventListener('scroll', leaveOnScroll, { passive: true });

    return () => {
      window.removeEventListener(worldEventName, worldEvent); window.removeEventListener(exploreEventName, exploreEvent); window.removeEventListener('keydown', escape); window.removeEventListener('scroll', leaveOnScroll);
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('pointercancel', pointerUp);
      if (transitionTimer !== null) window.clearTimeout(transitionTimer);
      media.revert(); registry.destroy(); controller.destroy(); resizeObserver.disconnect(); visibilityObserver.disconnect(); gsap.killTweensOf(camera.position); courier.dispose();
      scene.traverse((object) => { if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments)) return; object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => material.dispose()); });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  const explore = owner === 'visitor';
  return <div className="optical-world" data-control-owner={owner}>
    <div ref={mountRef} className="optical-world-canvas" aria-hidden="true" />
    <div className="world-local-controls" aria-label="Explore optical test bench"><p><strong>Shared optical test bench</strong> Guided camera framing is active. Explore only changes this scene; native page scrolling remains available.</p><button type="button" aria-pressed={explore} onClick={() => window.dispatchEvent(new CustomEvent(exploreEventName, { detail: { action: explore ? 'exit' : 'enter', sceneId: 'camera-laboratory' } }))}>{explore ? 'Exit Explore' : 'Enter Explore'}</button><button type="button" onClick={() => window.dispatchEvent(new CustomEvent(worldEventName, { detail: { type: 'LAB_RESET', sceneId: 'camera-laboratory' } satisfies PortfolioWorldEvent }))}>Reset world</button><span role="status">Control owner: {owner}</span></div>
    {Director && <Director shot={activeShot} onChange={setActiveShot} />}
  </div>;
};

export default OpticalBenchWorld;
