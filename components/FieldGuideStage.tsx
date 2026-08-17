import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { GuideChapter } from '../types';
import { calibrationMedia } from '../fieldTestData';
import { track } from '../lib/analytics';

gsap.registerPlugin(ScrollTrigger);

interface FieldGuideStageProps {
  chapters: GuideChapter[];
  allowPreferenceOverride?: boolean;
}

type GuideMode = 'webgl' | 'static';

const isConstrainedDevice = (allowPreferenceOverride: boolean) => {
  const navigatorWithHints = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (window.matchMedia('(max-width: 860px)').matches) return true;
  if (allowPreferenceOverride) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || navigatorWithHints.connection?.saveData === true
    || (navigatorWithHints.deviceMemory !== undefined && navigatorWithHints.deviceMemory < 4);
};

const buildFallbackGuide = () => {
  const guide = new THREE.Group();
  const graphite = new THREE.MeshStandardMaterial({ color: 0x273331, roughness: 0.82 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x167a72, roughness: 0.58 });
  const joint = new THREE.MeshStandardMaterial({ color: 0x78817f, roughness: 0.75 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.05, 0.4), graphite);
  torso.position.y = 1.45;
  guide.add(torso);

  const signal = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.04), teal);
  signal.position.set(0.19, 1.58, 0.225);
  guide.add(signal);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14), joint);
  head.position.y = 2.18;
  guide.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), graphite);
  helmet.position.y = 2.26;
  guide.add(helmet);

  const limbs: THREE.Group[] = [];
  const makeLimb = (x: number, y: number, height: number, arm = false) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(arm ? 0.1 : 0.12, height, 4, 10), graphite);
    mesh.position.y = -height * 0.46;
    pivot.add(mesh);
    guide.add(pivot);
    limbs.push(pivot);
  };
  makeLimb(-0.48, 1.78, 0.72, true);
  makeLimb(0.48, 1.78, 0.72, true);
  makeLimb(-0.23, 0.92, 0.88);
  makeLimb(0.23, 0.92, 0.88);

  const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.22), graphite);
  sensor.position.set(0, 1.55, -0.31);
  guide.add(sensor);
  const sensorLens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 18), teal);
  sensorLens.rotation.x = Math.PI / 2;
  sensorLens.position.set(-0.18, 1.72, -0.45);
  guide.add(sensorLens);

  guide.userData.limbs = limbs;
  guide.scale.setScalar(0.72);
  return guide;
};

const FieldGuideStage: React.FC<FieldGuideStageProps> = ({ chapters, allowPreferenceOverride = false }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<GuideMode>('webgl');

  useEffect(() => {
    if (isConstrainedDevice(allowPreferenceOverride)) {
      setMode('static');
      track('guide_capability_detected', { mode: 'static', chapter: chapters[0]?.sectionId ?? 'home' });
      return undefined;
    }

    const mount = mountRef.current;
    if (!mount) return undefined;

    let disposed = false;
    let animationFrame = 0;
    let targetProgress = chapters[0]?.pathProgress ?? 0;
    let currentProgress = targetProgress;
    let mixer: THREE.AnimationMixer | undefined;
    let guide = buildFallbackGuide();
    const clock = new THREE.Clock();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 3.2, 8.2);
    camera.lookAt(0, 1.1, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setMode('static');
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xf8fbfa, 0x66706e, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(3, 7, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8.2, 5.4),
      new THREE.MeshStandardMaterial({ color: 0xf3f6f5, roughness: 0.96 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const course = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.7, 0.02, 1.15),
      new THREE.Vector3(-1.5, 0.02, -0.7),
      new THREE.Vector3(-0.2, 0.02, 0.2),
      new THREE.Vector3(1.1, 0.02, -0.85),
      new THREE.Vector3(2.7, 0.02, 0.6),
    ]);
    const courseGeometry = new THREE.BufferGeometry().setFromPoints(course.getPoints(120));
    const courseLine = new THREE.Line(courseGeometry, new THREE.LineBasicMaterial({ color: 0x167a72 }));
    scene.add(courseLine);

    const stationMaterial = new THREE.MeshStandardMaterial({ color: 0x263432, roughness: 0.72 });
    const stationSignal = new THREE.MeshStandardMaterial({ color: 0x9a611a, roughness: 0.62 });
    [0.13, 0.36, 0.62, 0.86].forEach((progress, index) => {
      const point = course.getPoint(progress);
      const post = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 10), stationMaterial);
      stem.position.y = 0.625;
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.18), index % 2 ? stationSignal : stationMaterial);
      lens.position.y = 1.22;
      post.add(stem, lens);
      post.position.copy(point);
      scene.add(post);
    });

    guide.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    scene.add(guide);

    const loader = new GLTFLoader();
    loader.load('/models/toon-blaster-runner.glb', (gltf) => {
      if (disposed) return;
      const loadedGuide = gltf.scene;
      loadedGuide.scale.setScalar(0.78);
      loadedGuide.rotation.y = Math.PI;
      let meshIndex = 0;
      loadedGuide.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = new THREE.MeshStandardMaterial({
          color: meshIndex++ % 7 === 0 ? 0x167a72 : 0x2a3432,
          roughness: 0.76,
          metalness: 0.03,
        });
      });
      scene.remove(guide);
      guide = loadedGuide;
      scene.add(guide);
      mixer = new THREE.AnimationMixer(guide);
      const preferred = gltf.animations.find((clip) => /walk/i.test(clip.name)) ?? gltf.animations[0];
      if (preferred) mixer.clipAction(preferred).play();
    });

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const triggers = chapters.map((chapter, index) => ScrollTrigger.create({
      trigger: `#${chapter.sectionId}`,
      start: 'top 58%',
      end: 'bottom 42%',
      onEnter: () => {
        targetProgress = chapter.pathProgress;
        setActiveIndex(index);
      },
      onEnterBack: () => {
        targetProgress = chapter.pathProgress;
        setActiveIndex(index);
      },
    }));

    const render = () => {
      const delta = Math.min(clock.getDelta(), 0.05);
      currentProgress += (targetProgress - currentProgress) * Math.min(1, delta * 3.8);
      const point = course.getPoint(THREE.MathUtils.clamp(currentProgress, 0, 1));
      const tangent = course.getTangent(THREE.MathUtils.clamp(currentProgress, 0, 1));
      guide.position.copy(point);
      guide.rotation.y = Math.atan2(tangent.x, tangent.z);
      mixer?.update(delta);

      const limbs = guide.userData.limbs as THREE.Group[] | undefined;
      if (limbs) {
        const gait = Math.sin(clock.elapsedTime * 4.2) * 0.34;
        limbs[0].rotation.x = gait;
        limbs[1].rotation.x = -gait;
        limbs[2].rotation.x = -gait;
        limbs[3].rotation.x = gait;
      }

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    render();
    track('guide_capability_detected', { mode: 'webgl', chapter: chapters[0]?.sectionId ?? 'home' });

    return () => {
      disposed = true;
      triggers.forEach((trigger) => trigger.kill());
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrame);
      mixer?.stopAllAction();
      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [allowPreferenceOverride, chapters]);

  const activeChapter = chapters[activeIndex] ?? chapters[0];

  return (
    <div className="field-guide-stage" data-mode={mode} aria-label="Scroll-linked field engineer guide">
      <div className="field-guide-media" aria-hidden="true">
        {mode === 'webgl' ? (
          <video autoPlay muted loop playsInline preload="metadata" poster={calibrationMedia.posterSrc}>
            {calibrationMedia.webmSrc && <source src={calibrationMedia.webmSrc} type="video/webm" />}
            {calibrationMedia.mp4Src && <source src={calibrationMedia.mp4Src} type="video/mp4" />}
          </video>
        ) : <img src={calibrationMedia.posterSrc} alt="" width={calibrationMedia.width} height={calibrationMedia.height} />}
      </div>
      <p className="sr-only">Motion description: {calibrationMedia.transcript}</p>
      <div className="field-guide-readout" aria-live="polite">
        <span>{activeChapter?.label}</span>
        <strong>{activeChapter?.annotation}</strong>
      </div>
      <div ref={mountRef} className="field-guide-canvas" aria-hidden="true" />
      {mode === 'static' && (
        <img
          className="field-guide-poster"
          src="/images/field-engineer-guide.webp"
          alt={activeChapter?.reducedMotionLabel ?? 'Abstract field engineer guide'}
          width="768"
          height="1024"
        />
      )}
      <div className="field-guide-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${activeChapter?.pathProgress ?? 0})` }} />
      </div>
    </div>
  );
};

export default FieldGuideStage;
