import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { InteractionArbitrator } from '../lib/InteractionArbitrator';
import { NarrativeController, type NarrativeState } from '../lib/NarrativeController';
import { WorldAnchorRegistry } from '../lib/WorldAnchorRegistry';
import { WORLD_POLICY_CHANGE_EVENT, resolveWorldPolicyHandoff, type WorldPolicyChangeDetail } from '../lib/worldPolicyHandoff';
import type { CameraLabSnapshot, CameraShotDefinition, PortfolioWorldEvent, ResponsiveTier } from '../types';
import { createNeutralCourierPlaceholder } from '../world/courierAsset';
import { COURIER_ASSET_CONTRACT } from '../world/courierAssetContract';
import { loadProductionCourier } from '../world/productionCourierLoader';
import { ActiveResponsiveShot, applyCameraShotToAdapter, applyCharacterFraming, applyOpticalGeometryToAdapter, constrainOrbitState, resolveResponsiveCameraShot, resolveSafePlacement, type OrbitState } from '../world/opticalWorldState';
import { cameraShots, worldAnchorDefinitions } from '../world/narrativeManifest';

gsap.registerPlugin(ScrollTrigger);
type DirectorComponent = React.ComponentType<{ shot: CameraShotDefinition; onChange: (shot: CameraShotDefinition) => void }>;
const worldEventName = 'portfolio:world-event';
const exploreEventName = 'portfolio:explore-control';

const OpticalBenchWorld: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<NarrativeController | null>(null);
  if (!controllerRef.current) controllerRef.current = new NarrativeController({ chapterId: 'home', cameraShotId: 'overview', characterPoseId: 'home-arrival-forward' });
  const controller = controllerRef.current;
  const [narrative, setNarrative] = useState<Readonly<NarrativeState>>(controller.getState());
  const [activeShot, setActiveShot] = useState<CameraShotDefinition>(cameraShots[0]);
  const activeShotRef = useRef(cameraShots[0]);
  const liveShotRef = useRef<(shot: CameraShotDefinition) => void>(() => undefined);
  const controllerDestroyTimerRef = useRef<number | null>(null);
  const [Director, setDirector] = useState<DirectorComponent | null>(null);

  useEffect(() => controller.subscribe(setNarrative), [controller]);
  useEffect(() => {
    if (controllerDestroyTimerRef.current !== null) {
      clearTimeout(controllerDestroyTimerRef.current);
      controllerDestroyTimerRef.current = null;
    }
    return () => {
      // React Strict Mode probes effects with setup -> cleanup -> setup. Delay the
      // terminal controller disposal one task so the second setup can retain the
      // single authoritative instance, while a real unmount still destroys it.
      controllerDestroyTimerRef.current = window.setTimeout(() => controller.destroy(), 0);
    };
  }, [controller]);
  useEffect(() => { let active = true; if (import.meta.env.DEV && new URLSearchParams(location.search).get('director') === '1') import('./CameraDirector').then((module) => { if (active) setDirector(() => module.default); }); return () => { active = false; }; }, []);

  useEffect(() => {
    const mount = mountRef.current; const localSurface = mount?.closest<HTMLElement>('.optical-world');
    if (!mount || !localSurface) return undefined;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(activeShotRef.current.fov, 1, activeShotRef.current.near, activeShotRef.current.far);
    const activeResponsiveShot = new ActiveResponsiveShot(activeShotRef.current);
    let activeTier: ResponsiveTier = 'desktop';
    let orbitState: OrbitState = { azimuth: 0, polar: Math.PI / 2, distance: 8 };
    let cameraTarget = new THREE.Vector3(...activeShotRef.current.target);
    let refreshFraming: (shot: CameraShotDefinition) => void = () => undefined;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' }); } catch { mount.dataset.worldFailure = 'true'; return undefined; }
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.domElement.tabIndex = -1; renderer.domElement.setAttribute('aria-hidden', 'true'); renderer.domElement.style.pointerEvents = 'none'; mount.appendChild(renderer.domElement);
    const paper = new THREE.MeshStandardMaterial({ color: 0xf5f8f7, roughness: .9 }); const graphite = new THREE.MeshStandardMaterial({ color: 0x111816, roughness: .65 }); const teal = new THREE.MeshStandardMaterial({ color: 0x0b7169, roughness: .48 }); const amber = new THREE.MeshStandardMaterial({ color: 0x95590e, roughness: .52 });
    const fill = new THREE.HemisphereLight(0xffffff, 0x53605d, 2.1); const key = new THREE.DirectionalLight(0xffffff, 3); const ambient = new THREE.AmbientLight(0xffffff, 1); key.position.set(4, 7, 6); scene.add(fill, key, ambient);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(10, .12, 5), paper); platform.position.y = -.12; scene.add(platform);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(8.4, .1, .18), graphite); rail.position.set(0, .18, 0); scene.add(rail);
    [-3.5, -1.75, 0, 1.75, 3.5].forEach((x, index) => { const marker = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .35, 10), index === 2 ? amber : teal); marker.position.set(x, .36, 0); scene.add(marker); });
    const imagePlane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .58, side: THREE.DoubleSide })); imagePlane.position.set(2.6, 1.25, 0); imagePlane.rotation.y = Math.PI / 2; scene.add(imagePlane);
    const focusPlane = imagePlane.clone(); focusPlane.position.x = 1.8; (focusPlane.material as THREE.MeshStandardMaterial) = new THREE.MeshStandardMaterial({ color: 0x95590e, transparent: true, opacity: .18, side: THREE.DoubleSide }); scene.add(focusPlane);
    const iris = new THREE.Group(); iris.position.set(-2.4, 1.25, 0); const irisBlades: THREE.Mesh[] = []; for (let index = 0; index < 7; index += 1) { const blade = new THREE.Mesh(new THREE.BoxGeometry(.78, .16, .04), graphite); blade.position.x = .38; blade.rotation.z = index * Math.PI * 2 / 7; iris.add(blade); irisBlades.push(blade); } scene.add(iris);
    const rays = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x6650a4, transparent: true, opacity: .7 })); scene.add(rays);
    const frustum = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ConeGeometry(1.2, 3.2, 4, 1, true)), new THREE.LineBasicMaterial({ color: 0x0b7169 })); frustum.rotation.z = -Math.PI / 2; frustum.position.set(.8, 1.25, 0); scene.add(frustum);
    const labCamera = new THREE.Mesh(new THREE.BoxGeometry(.35, .25, .22), graphite); const objectMarker = new THREE.Mesh(new THREE.SphereGeometry(.12), amber); const stereoPair = new THREE.Group(); const leftStereo = labCamera.clone(); const rightStereo = labCamera.clone(); stereoPair.add(leftStereo, rightStereo); scene.add(labCamera, objectMarker, stereoPair);
    const occluderFrames = new THREE.Group(); scene.add(occluderFrames);
    const courier = createNeutralCourierPlaceholder(); scene.add(courier.root);
    void loadProductionCourier(COURIER_ASSET_CONTRACT, async (path) => {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      return new Promise((resolve, reject) => new GLTFLoader().load(path, resolve, undefined, reject));
    });
    const render = () => { const started = performance.now(); renderer.render(scene, camera); const frameTimeMs = Math.max(0, performance.now() - started); window.dispatchEvent(new CustomEvent('portfolio:world-frame', { detail: { frameTimeMs } })); };
    const cameraAdapterFor = (shot: CameraShotDefinition) => {
      const adapter = { position: camera.position.toArray() as [number, number, number], target: cameraTarget.toArray() as [number, number, number], fov: camera.fov, near: camera.near, far: camera.far, roll: camera.rotation.z, exposure: renderer.toneMappingExposure, focusDistance: camera.userData.focusDistance ?? 6, lighting: { key: key.intensity, fill: fill.intensity, environment: ambient.intensity, keyColor: `#${key.color.getHexString()}`, fillColor: `#${fill.color.getHexString()}` }, renderCount: 0 };
      applyCameraShotToAdapter(shot, adapter);
      return adapter;
    };
    const syncOrbitFromCamera = (shot: CameraShotDefinition) => {
      const offset = camera.position.clone().sub(cameraTarget);
      const distance = Math.max(.001, offset.length());
      const limits = shot.orbitLimits ?? { azimuth: [-Math.PI, Math.PI] as [number, number], polar: [.08, Math.PI - .08] as [number, number], distance: [.5, 24] as [number, number] };
      orbitState = constrainOrbitState({ azimuth: Math.atan2(offset.x, offset.z), polar: Math.acos(THREE.MathUtils.clamp(offset.y / distance, -1, 1)), distance }, limits);
    };
    const positionCameraFromOrbit = (roll = activeShotRef.current.roll ?? 0) => { const sinPolar = Math.sin(orbitState.polar); camera.position.set(cameraTarget.x + orbitState.distance * sinPolar * Math.sin(orbitState.azimuth), cameraTarget.y + orbitState.distance * Math.cos(orbitState.polar), cameraTarget.z + orbitState.distance * sinPolar * Math.cos(orbitState.azimuth)); camera.lookAt(cameraTarget); camera.rotation.z = roll; };
    const applyImmediateShot = (shot: CameraShotDefinition) => {
      activeResponsiveShot.set(shot); activeShotRef.current = shot; setActiveShot(shot); controller.authorCameraShot(shot.id);
      const adapter = cameraAdapterFor(shot);
      camera.position.fromArray(adapter.position); cameraTarget = new THREE.Vector3(...adapter.target); camera.fov = adapter.fov; camera.near = adapter.near; camera.far = adapter.far; camera.updateProjectionMatrix(); camera.lookAt(cameraTarget); camera.rotation.z = adapter.roll; renderer.toneMappingExposure = adapter.exposure; camera.userData.focusDistance = adapter.focusDistance; key.intensity = adapter.lighting.key; fill.intensity = adapter.lighting.fill; ambient.intensity = adapter.lighting.environment; key.color.set(adapter.lighting.keyColor ?? '#ffffff'); fill.color.set(adapter.lighting.fillColor ?? '#ffffff'); syncOrbitFromCamera(shot); if (shot.orbitLimits) positionCameraFromOrbit(adapter.roll); refreshFraming(shot); render();
    };
    liveShotRef.current = applyImmediateShot;
    const applyShot = (shot: CameraShotDefinition, duration = shot.transition.duration) => { activeShotRef.current = shot; setActiveShot(shot); controller.authorCameraShot(shot.id); const adapter = cameraAdapterFor(shot); camera.fov = adapter.fov; camera.near = adapter.near; camera.far = adapter.far; camera.updateProjectionMatrix(); cameraTarget = new THREE.Vector3(...adapter.target); renderer.toneMappingExposure = adapter.exposure; camera.userData.focusDistance = adapter.focusDistance; key.intensity = adapter.lighting.key; fill.intensity = adapter.lighting.fill; ambient.intensity = adapter.lighting.environment; key.color.set(adapter.lighting.keyColor ?? '#ffffff'); fill.color.set(adapter.lighting.fillColor ?? '#ffffff'); gsap.to(camera.position, { x: adapter.position[0], y: adapter.position[1], z: adapter.position[2], duration, ease: shot.transition.easing, overwrite: true, onUpdate: () => { camera.lookAt(cameraTarget); camera.rotation.z = adapter.roll; render(); }, onComplete: () => { syncOrbitFromCamera(shot); if (shot.orbitLimits) positionCameraFromOrbit(adapter.roll); refreshFraming(shot); render(); } }); };
    applyImmediateShot(activeShotRef.current);

    const registry = new WorldAnchorRegistry({ refresh: () => { ScrollTrigger.refresh(); refreshFraming(activeResponsiveShot.current); } }); worldAnchorDefinitions.forEach((definition) => registry.register(definition)); registry.start();
    const placeCourier = (shot: CameraShotDefinition, tier: ResponsiveTier) => { const resolved = registry.resolve(shot, tier).find((anchor) => anchor.chapterId === shot.chapterId); if (!resolved) return; const center = { x: resolved.screenRect.left + resolved.screenRect.width / 2, y: resolved.screenRect.top + resolved.screenRect.height / 2 }; const safe = resolveSafePlacement(center, resolved.safeTextRects, { width: innerWidth, height: innerHeight }); const framed = applyCharacterFraming([resolved.worldPosition[0] + (safe.x - center.x) / 120, resolved.worldPosition[1] - (safe.y - center.y) / 120, resolved.worldPosition[2]], shot.characterFraming); courier.root.visible = safe.visible; courier.root.position.fromArray(framed.position); courier.root.scale.setScalar(framed.scale); while (occluderFrames.children.length) { const child = occluderFrames.children[0]; occluderFrames.remove(child); if (child instanceof THREE.Mesh) { child.geometry.dispose(); (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => material.dispose()); } } resolved.safeTextRects.forEach((rect) => { const frame = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(.1, rect.width / 180), Math.max(.1, rect.height / 180)), paper.clone()); frame.position.set((rect.left + rect.width / 2 - innerWidth / 2) / 180, -(rect.top + rect.height / 2 - innerHeight / 2) / 180, .2); occluderFrames.add(frame); }); };
    refreshFraming = (shot) => placeCourier(shot, activeTier);
    const resize = () => { const { width, height } = mount.getBoundingClientRect(); if (!width || !height) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render(); }; const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(mount); resize();
    const visibilityObserver = new IntersectionObserver((entries) => mount.toggleAttribute('data-scene-visible', entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= .15)), { threshold: [0, .15, .5] }); visibilityObserver.observe(localSurface);
    const media = gsap.matchMedia(); media.add({ desktop: '(min-width: 921px)', tablet: '(min-width: 681px) and (max-width: 920px)', mobile: '(max-width: 680px)' }, (context) => { const tier: ResponsiveTier = context.conditions?.mobile ? 'mobile' : context.conditions?.tablet ? 'tablet' : 'desktop'; activeTier = tier; const responsiveShot = (shot: CameraShotDefinition) => resolveResponsiveCameraShot(shot, tier); const authoredActive = cameraShots.find((shot) => shot.id === activeShotRef.current.id) ?? cameraShots[0]; activeResponsiveShot.update(authoredActive, tier); if (controller.getState().controlOwner === 'story') applyImmediateShot(activeResponsiveShot.current); const activateShot = (shot: CameraShotDefinition) => activeResponsiveShot.update(shot, tier); const triggers = cameraShots.map((shot) => ScrollTrigger.create({ trigger: `#${shot.chapterId}`, start: () => `clamp(${ScrollTrigger.maxScroll(window) * responsiveShot(shot).scrollRange[0]})`, end: () => `clamp(${ScrollTrigger.maxScroll(window) * responsiveShot(shot).scrollRange[1]})`, preventOverlaps: 'portfolio-narrative', fastScrollEnd: 2500, invalidateOnRefresh: true, onUpdate: (self) => { const target = activateShot(shot); const result = controller.updateScroll({ chapterId: shot.chapterId, progress: self.progress, velocityPxPerSecond: self.getVelocity(), cameraShotId: target.id }); courier.setPose(result.poseId); if (controller.getState().controlOwner === 'story') applyShot(target, result.durationMs / 1000); }, onEnter: () => { const target = activateShot(shot); placeCourier(target, tier); if (controller.getState().controlOwner === 'story') applyShot(target); }, onEnterBack: () => { const target = activateShot(shot); placeCourier(target, tier); if (controller.getState().controlOwner === 'story') applyShot(target); } })); return () => triggers.forEach((trigger) => trigger.kill()); });

    let transitionTimer: number | null = null;
    const cancelTransition = () => { if (transitionTimer !== null) clearTimeout(transitionTimer); transitionTimer = null; gsap.killTweensOf(camera.position); };
    const finishReturn = () => { cancelTransition(); applyShot(activeResponsiveShot.current, .42); transitionTimer = window.setTimeout(() => { controller.completeTransition(); transitionTimer = null; }, 420); };
    const arbitrator = new InteractionArbitrator(); let previousX = 0; let previousY = 0; let activePointerId: number | null = null;
    const releasePointerCapture = () => { if (activePointerId !== null && localSurface.hasPointerCapture(activePointerId)) localSurface.releasePointerCapture(activePointerId); activePointerId = null; };
    const pointerDown = (event: PointerEvent) => { if (controller.getState().controlOwner !== 'visitor' || (event.target as Element).closest('button,input,a')) return; previousX = event.clientX; previousY = event.clientY; activePointerId = event.pointerId; arbitrator.pointerDown({ pointerId: event.pointerId, x: event.clientX, y: event.clientY }, 'camera-laboratory'); };
    localSurface.dataset.worldRotation = '0';
    const pointerMove = (event: PointerEvent) => { if (controller.getState().controlOwner !== 'visitor') return; const intent = arbitrator.pointerMove({ pointerId: event.pointerId, x: event.clientX, y: event.clientY }); if (!intent.preventDefault) return; event.preventDefault(); if (intent.capturePointer && !localSurface.hasPointerCapture(event.pointerId)) localSurface.setPointerCapture(event.pointerId); const limits = activeShotRef.current.orbitLimits ?? { azimuth: [-Math.PI, Math.PI] as [number, number], polar: [.08, Math.PI - .08] as [number, number], distance: [.5, 24] as [number, number] }; orbitState = constrainOrbitState({ ...orbitState, azimuth: orbitState.azimuth - (event.clientX - previousX) * .004, polar: orbitState.polar + (event.clientY - previousY) * .004 }, limits); positionCameraFromOrbit(); localSurface.dataset.worldRotation = orbitState.azimuth.toFixed(4); previousX = event.clientX; previousY = event.clientY; render(); };
    const pointerUp = (event: PointerEvent) => { arbitrator.pointerUp(event.pointerId); if (localSurface.hasPointerCapture(event.pointerId)) localSurface.releasePointerCapture(event.pointerId); if (activePointerId === event.pointerId) activePointerId = null; };
    localSurface.addEventListener('pointerdown', pointerDown); localSurface.addEventListener('pointermove', pointerMove); localSurface.addEventListener('pointerup', pointerUp); localSurface.addEventListener('pointercancel', pointerUp);
    addEventListener('pointerup', pointerUp); addEventListener('pointercancel', pointerUp);
    const applyLab = (snapshot: CameraLabSnapshot) => { const adapter = { frustumScale: frustum.scale.y, imagePlaneAspect: imagePlane.scale.y, distortion: (imagePlane.userData.distortion ?? [0, 0]) as [number, number], irisAperture: 0, focusPlane: focusPlane.position.x * 1000, cameraPose: [...labCamera.position.toArray(), THREE.MathUtils.radToDeg(labCamera.rotation.y), THREE.MathUtils.radToDeg(labCamera.rotation.x), THREE.MathUtils.radToDeg(labCamera.rotation.z)] as [number, number, number, number, number, number], objectPose: objectMarker.position.toArray() as [number, number, number], stereoLeftX: leftStereo.position.x, stereoRightX: rightStereo.position.x, triangulatedDepth: stereoPair.userData.triangulatedDepth ?? null, renderCount: 0 }; applyOpticalGeometryToAdapter(snapshot, adapter); frustum.scale.set(1, adapter.frustumScale, adapter.frustumScale); imagePlane.scale.set(1, adapter.imagePlaneAspect, 1); imagePlane.userData.distortion = adapter.distortion; irisBlades.forEach((blade) => { blade.position.x = THREE.MathUtils.clamp(adapter.irisAperture / 45, .12, .7); }); focusPlane.position.x = THREE.MathUtils.clamp(adapter.focusPlane / 1000, .4, 5); labCamera.position.fromArray(adapter.cameraPose.slice(0, 3) as [number, number, number]); labCamera.rotation.set(THREE.MathUtils.degToRad(adapter.cameraPose[4]), THREE.MathUtils.degToRad(adapter.cameraPose[3]), THREE.MathUtils.degToRad(adapter.cameraPose[5])); objectMarker.position.fromArray(adapter.objectPose); leftStereo.position.x = adapter.stereoLeftX; rightStereo.position.x = adapter.stereoRightX; stereoPair.userData.triangulatedDepth = adapter.triangulatedDepth; rays.geometry.dispose(); rays.geometry = new THREE.BufferGeometry().setFromPoints([labCamera.position, objectMarker.position, leftStereo.position, objectMarker.position, rightStereo.position, objectMarker.position]); render(); };
    const worldEvent = (event: Event) => { const detail = (event as CustomEvent<PortfolioWorldEvent>).detail; controller.dispatch(detail); if (detail.type === 'CAMERA_LAB_UPDATED') applyLab(detail.snapshot); courier.setPose(controller.getState().reaction?.id ?? controller.getState().characterPoseId); if (detail.type === 'QUALITY_CHANGED' && controller.getState().controlOwner === 'transition') { releasePointerCapture(); arbitrator.reset(); finishReturn(); } else render(); };
    const exploreEvent = (event: Event) => { const detail = (event as CustomEvent<{ action: 'enter' | 'exit'; sceneId: 'camera-laboratory' }>).detail; if (detail.action === 'enter') controller.enterExplore(detail.sceneId); else { releasePointerCapture(); arbitrator.reset(); controller.exitExplore('exit'); finishReturn(); } };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && controller.getState().controlOwner === 'visitor') { releasePointerCapture(); arbitrator.escape(); controller.exitExplore('escape'); finishReturn(); } };
    const leaveOnScroll = () => { if (controller.getState().controlOwner !== 'visitor') return; const bounds = localSurface.getBoundingClientRect(); if (bounds.bottom <= 0 || bounds.top >= innerHeight) { releasePointerCapture(); arbitrator.scrollOut(); controller.exitExplore('scroll'); finishReturn(); } };
    const policyChange = (event: Event) => resolveWorldPolicyHandoff({ controller, arbitrator, detail: (event as CustomEvent<WorldPolicyChangeDetail>).detail, releasePointerCapture, cancelTransition, restoreStoryShot: () => applyImmediateShot(activeResponsiveShot.current) });
    addEventListener(worldEventName, worldEvent); addEventListener(exploreEventName, exploreEvent); addEventListener(WORLD_POLICY_CHANGE_EVENT, policyChange); addEventListener('keydown', escape); addEventListener('scroll', leaveOnScroll, { passive: true });
    return () => { liveShotRef.current = () => undefined; removeEventListener(worldEventName, worldEvent); removeEventListener(exploreEventName, exploreEvent); removeEventListener(WORLD_POLICY_CHANGE_EVENT, policyChange); removeEventListener('keydown', escape); removeEventListener('scroll', leaveOnScroll); removeEventListener('pointerup', pointerUp); removeEventListener('pointercancel', pointerUp); localSurface.removeEventListener('pointerdown', pointerDown); localSurface.removeEventListener('pointermove', pointerMove); localSurface.removeEventListener('pointerup', pointerUp); localSurface.removeEventListener('pointercancel', pointerUp); releasePointerCapture(); arbitrator.reset(); cancelTransition(); media.revert(); registry.destroy(); resizeObserver.disconnect(); visibilityObserver.disconnect(); courier.dispose(); scene.traverse((object) => { if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return; object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose()); }); renderer.dispose(); renderer.domElement.remove(); };
  }, [controller]);

  const explore = narrative.controlOwner === 'visitor';
  const changeDirectorShot = (shot: CameraShotDefinition) => { activeShotRef.current = shot; setActiveShot(shot); liveShotRef.current(shot); };
  return <div className="optical-world" data-control-owner={narrative.controlOwner} data-camera-shot={narrative.cameraShotId} data-reaction={narrative.reaction?.id ?? 'none'} data-interaction-surface="camera-laboratory"><div ref={mountRef} className="optical-world-canvas" aria-hidden="true" /><div className="world-local-controls" aria-label="Explore optical test bench"><p><strong>Shared optical test bench</strong> Drag only inside this registered surface after entering Explore. Native scrolling remains active elsewhere.</p><button type="button" aria-pressed={explore} disabled={narrative.controlOwner === 'transition'} onClick={() => dispatchEvent(new CustomEvent(exploreEventName, { detail: { action: explore ? 'exit' : 'enter', sceneId: 'camera-laboratory' } }))}>{explore ? 'Exit Explore' : narrative.controlOwner === 'transition' ? 'Restoring story…' : 'Enter Explore'}</button><button type="button" onClick={() => dispatchEvent(new CustomEvent(worldEventName, { detail: { type: 'LAB_RESET', sceneId: 'camera-laboratory' } satisfies PortfolioWorldEvent }))}>Reset world</button><span role="status">Control owner: {narrative.controlOwner} · Shot: {narrative.cameraShotId}</span></div>{Director && <Director shot={activeShot} onChange={changeDirectorShot} />}</div>;
};

export default OpticalBenchWorld;
