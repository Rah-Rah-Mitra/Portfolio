import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import type Matter from 'matter-js';
import { loadMatter, peekMatter } from '../lib/physicsRuntime';
import { useSmashInteraction } from '../hooks/useSmashInteraction';
import { useGravityWellInteraction } from '../hooks/useGravityWellInteraction';
import { track } from '../lib/analytics';
import type { QualityTier } from '../types';
import { readSoundPreference, SOUND_PREFERENCE_KEY } from '../lib/audioPolicy';

type BodyRef = {
  body: Matter.Body | null;
  element: HTMLElement;
  initial: {
    x: number;
    y: number;
    angle: number;
  };
  size: { width: number; height: number };
};

export type TextEffectMode = 'decode' | 'scan' | 'pulse';
export type FluidQuality = 'balanced' | 'high';

export type EffectSettings = {
  smash: {
    enabled: boolean;
    intensity: number;
    radius: number;
  };
  gravity: {
    enabled: boolean;
    strength: number;
    radius: number;
  };
  fluid: {
    enabled: boolean;
    speed: number;
    intensity: number;
    opacity: number;
    splatRadius: number;
    curl: number;
    quality: FluidQuality;
  };
  pretext: {
    enabled: boolean;
    intensity: number;
    mode: TextEffectMode;
  };
};

export type VisualDensity = 'minimal' | 'balanced' | 'dense';
export type EnhancementSettings = {
  motionPaused: boolean;
  visualDensity: VisualDensity;
  mediaEnabled: boolean;
  soundEnabled: boolean;
  soundUnlocked: boolean;
  quality: QualityTier;
};

export type EffectId = keyof EffectSettings;
export type NumericEffectId = 'smash' | 'gravity' | 'fluid' | 'pretext';

interface EffectsContextType {
  settings: EffectSettings;
  isInteractionActive: boolean;
  setEffectEnabled: (id: EffectId, enabled: boolean) => void;
  toggleEffect: (id: EffectId) => void;
  setEffectParam: (id: NumericEffectId, param: string, value: number) => void;
  setPretextMode: (mode: TextEffectMode) => void;
  setFluidQuality: (quality: FluidQuality) => void;
  restoreAll: () => void;
  pauseAll: () => void;
  enhancements: EnhancementSettings;
  setMotionPaused: (paused: boolean) => void;
  setVisualDensity: (density: VisualDensity) => void;
  setMediaEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setQuality: (quality: QualityTier) => void;
  registerWords: (elements: HTMLElement[]) => () => void;
}

const defaultSettings: EffectSettings = {
  smash: { enabled: false, intensity: 60, radius: 42 },
  gravity: { enabled: false, strength: 45, radius: 48 },
  fluid: { enabled: false, speed: 0.7, intensity: 38, opacity: 28, splatRadius: 28, curl: 18, quality: 'balanced' },
  pretext: { enabled: false, intensity: 42, mode: 'decode' },
};

const PARAM_LIMITS: Record<NumericEffectId, Record<string, [number, number]>> = {
  smash: {
    intensity: [0, 100],
    radius: [20, 70],
  },
  gravity: {
    strength: [0, 100],
    radius: [20, 75],
  },
  fluid: {
    speed: [0.2, 2.4],
    intensity: [0, 100],
    opacity: [0, 80],
    splatRadius: [10, 85],
    curl: [0, 90],
  },
  pretext: {
    intensity: [0, 100],
  },
};

export const EffectsContext = createContext<EffectsContextType | undefined>(undefined);

export const useEffects = () => {
  const context = useContext(EffectsContext);
  if (!context) {
    throw new Error('useEffects must be used within an EffectsProvider');
  }
  return context;
};

// Backwards-compatible name for older components.
export const usePhysics = useEffects;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const EffectsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<EffectSettings>(defaultSettings);
  const [enhancements, setEnhancements] = useState<EnhancementSettings>({
    motionPaused: false, visualDensity: 'balanced', mediaEnabled: true, soundEnabled: false, soundUnlocked: false, quality: 'balanced',
  });
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const bodiesRef = useRef<Map<string, BodyRef>>(new Map());
  const boundariesRef = useRef<Matter.Body[]>([]);
  const restoreTimers = useRef(new Set<number>());
  const [physicsReady, setPhysicsReady] = useState(false);

  const restoreAll = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      smash: { ...prev.smash, enabled: false },
      gravity: { ...prev.gravity, enabled: false },
    }));

    if (engineRef.current) engineRef.current.gravity.y = 0.4;

    restoreTimers.current.forEach((timerId) => clearTimeout(timerId));
    restoreTimers.current.clear();

    const matter = peekMatter();
    bodiesRef.current.forEach((ref) => {
      const { element, body, initial } = ref;

      if (!matter || !body || body.isStatic) {
        return;
      }

      let fallbackTimeoutId: number | undefined;

      const snapToFinalPosition = () => {
        element.removeEventListener('transitionend', snapToFinalPosition);
        if (fallbackTimeoutId) {
          restoreTimers.current.delete(fallbackTimeoutId);
          clearTimeout(fallbackTimeoutId);
        }

        element.classList.remove('word-restoring', 'physics-active');
        element.style.transform = '';

        matter.Body.setStatic(body, true);
        matter.Body.setPosition(body, { x: initial.x, y: initial.y });
        matter.Body.setAngle(body, 0);
        matter.Body.setVelocity(body, { x: 0, y: 0 });
        matter.Body.setAngularVelocity(body, 0);
      };

      element.addEventListener('transitionend', snapToFinalPosition, { once: true });
      fallbackTimeoutId = window.setTimeout(snapToFinalPosition, 600);
      restoreTimers.current.add(fallbackTimeoutId);

      element.classList.add('word-restoring');
      element.style.transform = 'translate(0px, 0px) rotate(0rad)';
      matter.Body.setStatic(body, true);
    });
  }, []);

  const physicsActive = settings.smash.enabled || settings.gravity.enabled;

  // Load the physics engine on first activation and give queued word
  // registrations their bodies once it arrives.
  useEffect(() => {
    if (!physicsActive || physicsReady) return undefined;
    let cancelled = false;
    loadMatter().then((matter) => {
      if (cancelled) return;
      if (!engineRef.current) engineRef.current = matter.Engine.create();
      if (!runnerRef.current) runnerRef.current = matter.Runner.create();
      const engine = engineRef.current;
      bodiesRef.current.forEach((ref) => {
        if (ref.body) return;
        ref.body = matter.Bodies.rectangle(ref.initial.x, ref.initial.y, ref.size.width, ref.size.height, {
          isStatic: true,
          restitution: 0.3,
          friction: 0.2,
        });
        matter.Composite.add(engine.world, ref.body);
      });
      setPhysicsReady(true);
    });
    return () => { cancelled = true; };
  }, [physicsActive, physicsReady]);

  useEffect(() => {
    if (!physicsReady) return undefined;
    const matter = peekMatter();
    const engine = engineRef.current;
    if (!matter || !engine) return undefined;
    engine.gravity.y = 0.4;

    const setupBoundaries = () => {
      if (boundariesRef.current.length > 0) {
        matter.Composite.remove(engine.world, boundariesRef.current);
      }

      const { scrollWidth, scrollHeight } = document.documentElement;

      boundariesRef.current = [
        matter.Bodies.rectangle(scrollWidth / 2, -30, scrollWidth, 60, { isStatic: true }),
        matter.Bodies.rectangle(scrollWidth / 2, scrollHeight + 30, scrollWidth, 60, { isStatic: true }),
        matter.Bodies.rectangle(-30, scrollHeight / 2, 60, scrollHeight, { isStatic: true }),
        matter.Bodies.rectangle(scrollWidth + 30, scrollHeight / 2, 60, scrollHeight, { isStatic: true }),
      ];
      matter.Composite.add(engine.world, boundariesRef.current);
    };

    setupBoundaries();

    const handleResize = () => {
      setupBoundaries();
      restoreAll();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      if (runnerRef.current) matter.Runner.stop(runnerRef.current);
      matter.World.clear(engine.world, false);
      matter.Engine.clear(engine);
      window.removeEventListener('resize', handleResize);
      restoreTimers.current.forEach((timerId) => clearTimeout(timerId));
    };
  }, [physicsReady, restoreAll]);

  useEffect(() => {
    if (!physicsActive || !physicsReady) return undefined;
    const matter = peekMatter();
    const runner = runnerRef.current;
    const engine = engineRef.current;
    if (!matter || !runner || !engine) return undefined;
    let animationId = 0;
    let running = false;

    const renderLoop = () => {
      bodiesRef.current.forEach((ref) => {
        if (!ref.element || !ref.body) return;
        const restoring = ref.element.classList.contains('word-restoring');
        ref.element.classList.toggle('physics-active', !ref.body.isStatic && !restoring);
        if (restoring || ref.body.isStatic) return;
        const { x, y } = ref.body.position;
        ref.element.style.transform = `translate(${x - ref.initial.x}px, ${y - ref.initial.y}px) rotate(${ref.body.angle}rad)`;
      });
      animationId = requestAnimationFrame(renderLoop);
    };

    const start = () => {
      if (running || document.hidden) return;
      running = true;
      matter.Runner.run(runner, engine);
      renderLoop();
    };
    const stop = () => {
      if (!running) return;
      running = false;
      matter.Runner.stop(runner);
      cancelAnimationFrame(animationId);
    };
    const handleVisibility = () => { if (document.hidden) stop(); else start(); };

    start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [physicsActive, physicsReady]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.gravity.y = settings.gravity.enabled ? 0 : 0.4;
  }, [physicsReady, settings.gravity.enabled]);

  useEffect(() => {
    const isPhysicsActive = settings.smash.enabled || settings.gravity.enabled;
    document.body.classList.toggle('no-select', isPhysicsActive);
    return () => {
      document.body.classList.remove('no-select');
    };
  }, [settings.smash.enabled, settings.gravity.enabled]);

  useSmashInteraction(engineRef, bodiesRef, settings.smash.enabled && physicsReady, {
    intensity: settings.smash.intensity,
    radius: settings.smash.radius,
  });
  useGravityWellInteraction(engineRef, bodiesRef, settings.gravity.enabled && physicsReady, {
    strength: settings.gravity.strength,
    radius: settings.gravity.radius,
  });

  const pauseAll = useCallback(() => {
    restoreAll();
    setSettings((prev) => ({
      ...prev,
      smash: { ...prev.smash, enabled: false },
      gravity: { ...prev.gravity, enabled: false },
      fluid: { ...prev.fluid, enabled: false },
      pretext: { ...prev.pretext, enabled: false },
    }));
    track('effect_control_changed', { effect: 'all', control: 'enabled', value: 'false' });
    setEnhancements((current) => ({ ...current, motionPaused: true, mediaEnabled: false }));
  }, [restoreAll]);

  useEffect(() => {
    setEnhancements((current) => ({ ...current, soundEnabled: readSoundPreference(localStorage.getItem(SOUND_PREFERENCE_KEY)) }));
    const unlock = () => setEnhancements((current) => ({ ...current, soundUnlocked: true }));
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motionPaused = String(enhancements.motionPaused);
    document.documentElement.dataset.visualDensity = enhancements.visualDensity;
    window.dispatchEvent(new CustomEvent('portfolio:enhancement-policy', { detail: enhancements }));
  }, [enhancements]);

  const setMotionPaused = useCallback((paused: boolean) => setEnhancements((current) => ({ ...current, motionPaused: paused })), []);
  const setVisualDensity = useCallback((visualDensity: VisualDensity) => setEnhancements((current) => ({ ...current, visualDensity })), []);
  const setMediaEnabled = useCallback((mediaEnabled: boolean) => setEnhancements((current) => ({ ...current, mediaEnabled })), []);
  const setSoundEnabled = useCallback((soundEnabled: boolean) => {
    localStorage.setItem(SOUND_PREFERENCE_KEY, String(soundEnabled));
    setEnhancements((current) => ({ ...current, soundEnabled }));
  }, []);
  const setQuality = useCallback((quality: QualityTier) => {
    setEnhancements((current) => ({ ...current, quality }));
    window.dispatchEvent(new CustomEvent('portfolio:world-event', { detail: { type: 'QUALITY_CHANGED', tier: quality } }));
  }, []);

  const setEffectEnabled = useCallback((id: EffectId, enabled: boolean) => {
    setSettings((prev) => ({ ...prev, [id]: { ...prev[id], enabled } } as EffectSettings));
  }, []);

  const toggleEffect = useCallback((id: EffectId) => {
    const enabled = !settings[id].enabled;
    setSettings((prev) => ({ ...prev, [id]: { ...prev[id], enabled } } as EffectSettings));
  }, [settings]);

  const setEffectParam = useCallback((id: NumericEffectId, param: string, value: number) => {
    const limits = PARAM_LIMITS[id][param];
    if (!limits) return;
    const [min, max] = limits;
    setSettings((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [param]: clamp(value, min, max),
      },
    } as EffectSettings));
  }, []);

  const setPretextMode = useCallback((mode: TextEffectMode) => {
    setSettings((prev) => ({
      ...prev,
      pretext: { ...prev.pretext, mode },
    }));
  }, []);

  const setFluidQuality = useCallback((quality: FluidQuality) => {
    setSettings((prev) => ({
      ...prev,
      fluid: { ...prev.fluid, quality },
    }));
  }, []);

  const registerWords = useCallback((elements: HTMLElement[]) => {
    const wordIds: string[] = [];
    const matter = peekMatter();
    elements.forEach((element, i) => {
      const id = `${Date.now()}-${Math.random()}-${i}`;
      element.dataset.physicsId = id;
      wordIds.push(id);

      const rect = element.getBoundingClientRect();
      const initialX = rect.left + window.scrollX + rect.width / 2;
      const initialY = rect.top + window.scrollY + rect.height / 2;

      // Bodies materialize immediately when the engine is loaded; otherwise
      // the registration is queued and picked up by the activation effect.
      let body: Matter.Body | null = null;
      if (matter && engineRef.current) {
        body = matter.Bodies.rectangle(initialX, initialY, rect.width, rect.height, {
          isStatic: true,
          restitution: 0.3,
          friction: 0.2,
        });
        matter.Composite.add(engineRef.current.world, body);
      }

      bodiesRef.current.set(id, {
        body,
        element,
        initial: { x: initialX, y: initialY, angle: 0 },
        size: { width: rect.width, height: rect.height },
      });
    });

    return () => {
      const matterNow = peekMatter();
      wordIds.forEach((id) => {
        const ref = bodiesRef.current.get(id);
        if (ref) {
          if (matterNow && engineRef.current && ref.body) matterNow.Composite.remove(engineRef.current.world, ref.body);
          bodiesRef.current.delete(id);
        }
      });
    };
  }, []);

  const value: EffectsContextType = {
    settings,
    isInteractionActive: settings.smash.enabled || settings.gravity.enabled,
    setEffectEnabled,
    toggleEffect,
    setEffectParam,
    setPretextMode,
    setFluidQuality,
    registerWords,
    restoreAll,
    pauseAll,
    enhancements,
    setMotionPaused,
    setVisualDensity,
    setMediaEnabled,
    setSoundEnabled,
    setQuality,
  };

  return (
    <EffectsContext.Provider value={value}>
      {children}
    </EffectsContext.Provider>
  );
};

export const PhysicsProvider = EffectsProvider;
