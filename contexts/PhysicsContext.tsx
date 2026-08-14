import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import Matter from 'matter-js';
import { Theme } from './ThemeContext';
import { useSmashInteraction } from '../hooks/useSmashInteraction';
import { useGravityWellInteraction } from '../hooks/useGravityWellInteraction';
import { track, triggerSessionReplay } from '../lib/analytics';

type BodyRef = {
  body: Matter.Body;
  element: HTMLElement;
  initial: {
    x: number;
    y: number;
    angle: number;
  };
};

export type TextEffectMode = 'decode' | 'scan' | 'pulse';
export type WorldQuality = 'balanced' | 'high';
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
  world: {
    enabled: boolean;
    quality: WorldQuality;
  };
};

export type EffectId = keyof EffectSettings;
export type NumericEffectId = 'smash' | 'gravity' | 'fluid' | 'pretext';

interface EffectsContextType {
  settings: EffectSettings;
  isInteractionActive: boolean;
  worldOpen: boolean;
  setEffectEnabled: (id: EffectId, enabled: boolean) => void;
  toggleEffect: (id: EffectId) => void;
  setEffectParam: (id: NumericEffectId, param: string, value: number) => void;
  setPretextMode: (mode: TextEffectMode) => void;
  setWorldQuality: (quality: WorldQuality) => void;
  setFluidQuality: (quality: FluidQuality) => void;
  openWorld: (source?: string) => void;
  closeWorld: (reason?: string) => void;
  restoreAll: () => void;
  pauseAll: () => void;
  registerWords: (elements: HTMLElement[]) => () => void;
}

const defaultSettings: EffectSettings = {
  smash: { enabled: false, intensity: 60, radius: 42 },
  gravity: { enabled: false, strength: 45, radius: 48 },
  fluid: { enabled: false, speed: 0.7, intensity: 38, opacity: 28, splatRadius: 28, curl: 18, quality: 'balanced' },
  pretext: { enabled: false, intensity: 42, mode: 'decode' },
  world: { enabled: true, quality: 'balanced' },
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

const { Engine, Runner, Bodies, Composite, World, Body } = Matter;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const EffectsProvider: React.FC<{ children: ReactNode; theme: Theme }> = ({ children, theme }) => {
  const [settings, setSettings] = useState<EffectSettings>(defaultSettings);
  const [worldOpen, setWorldOpen] = useState(false);
  const engineRef = useRef(Engine.create());
  const runnerRef = useRef(Runner.create());
  const bodiesRef = useRef<Map<string, BodyRef>>(new Map());
  const boundariesRef = useRef<Matter.Body[]>([]);
  const restoreTimers = useRef(new Set<number>());
  const worldOpenedAtRef = useRef<number | null>(null);

  const restoreAll = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      smash: { ...prev.smash, enabled: false },
      gravity: { ...prev.gravity, enabled: false },
    }));

    engineRef.current.gravity.y = 0.4;

    restoreTimers.current.forEach((timerId) => clearTimeout(timerId));
    restoreTimers.current.clear();

    bodiesRef.current.forEach((ref) => {
      const { element, body, initial } = ref;

      if (body.isStatic) {
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

        Body.setStatic(body, true);
        Body.setPosition(body, { x: initial.x, y: initial.y });
        Body.setAngle(body, 0);
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
      };

      element.addEventListener('transitionend', snapToFinalPosition, { once: true });
      fallbackTimeoutId = window.setTimeout(snapToFinalPosition, 600);
      restoreTimers.current.add(fallbackTimeoutId);

      element.classList.add('word-restoring');
      element.style.transform = 'translate(0px, 0px) rotate(0rad)';
      Body.setStatic(body, true);
    });
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    engine.gravity.y = 0.4;

    const setupBoundaries = () => {
      if (boundariesRef.current.length > 0) {
        Composite.remove(engine.world, boundariesRef.current);
      }

      const { scrollWidth, scrollHeight } = document.documentElement;

      boundariesRef.current = [
        Bodies.rectangle(scrollWidth / 2, -30, scrollWidth, 60, { isStatic: true }),
        Bodies.rectangle(scrollWidth / 2, scrollHeight + 30, scrollWidth, 60, { isStatic: true }),
        Bodies.rectangle(-30, scrollHeight / 2, 60, scrollHeight, { isStatic: true }),
        Bodies.rectangle(scrollWidth + 30, scrollHeight / 2, 60, scrollHeight, { isStatic: true }),
      ];
      Composite.add(engine.world, boundariesRef.current);
    };

    setupBoundaries();

    const handleResize = () => {
      setupBoundaries();
      restoreAll();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      Runner.stop(runnerRef.current);
      World.clear(engine.world, false);
      Engine.clear(engine);
      window.removeEventListener('resize', handleResize);
      restoreTimers.current.forEach((timerId) => clearTimeout(timerId));
    };
  }, [restoreAll]);

  const physicsActive = settings.smash.enabled || settings.gravity.enabled;

  useEffect(() => {
    if (!physicsActive) return undefined;
    const runner = runnerRef.current;
    const engine = engineRef.current;
    let animationId = 0;
    let running = false;

    const renderLoop = () => {
      bodiesRef.current.forEach((ref) => {
        if (!ref.element) return;
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
      Runner.run(runner, engine);
      renderLoop();
    };
    const stop = () => {
      if (!running) return;
      running = false;
      Runner.stop(runner);
      cancelAnimationFrame(animationId);
    };
    const handleVisibility = () => { if (document.hidden) stop(); else start(); };

    start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [physicsActive]);

  useEffect(() => {
    engineRef.current.gravity.y = settings.gravity.enabled ? 0 : 0.4;
  }, [settings.gravity.enabled]);

  useEffect(() => {
    const isPhysicsActive = settings.smash.enabled || settings.gravity.enabled;
    document.body.classList.toggle('no-select', isPhysicsActive);
    return () => {
      document.body.classList.remove('no-select');
    };
  }, [settings.smash.enabled, settings.gravity.enabled]);

  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      smash: { ...prev.smash, enabled: false },
      gravity: { ...prev.gravity, enabled: false },
    }));
  }, [theme]);

  useSmashInteraction(engineRef, bodiesRef, settings.smash.enabled, {
    intensity: settings.smash.intensity,
    radius: settings.smash.radius,
  });
  useGravityWellInteraction(engineRef, bodiesRef, settings.gravity.enabled, {
    strength: settings.gravity.strength,
    radius: settings.gravity.radius,
  });

  const openWorld = useCallback((source = 'unknown') => {
    setSettings((prev) => ({
      ...prev,
      world: { ...prev.world, enabled: true },
    }));
    setWorldOpen((current) => {
      if (!current) {
        worldOpenedAtRef.current = performance.now();
        track('world_opened', { source });
        triggerSessionReplay('world_opened', { source });
      }
      return true;
    });
  }, []);

  const closeWorld = useCallback((reason = 'unknown') => {
    setWorldOpen((current) => {
      if (current) {
        const duration = worldOpenedAtRef.current ? Math.round(performance.now() - worldOpenedAtRef.current) : 0;
        track('world_closed', { reason, duration_ms: duration });
        worldOpenedAtRef.current = null;
      }
      return false;
    });
  }, []);

  const pauseAll = useCallback(() => {
    restoreAll();
    setSettings((prev) => ({
      ...prev,
      smash: { ...prev.smash, enabled: false },
      gravity: { ...prev.gravity, enabled: false },
      fluid: { ...prev.fluid, enabled: false },
      pretext: { ...prev.pretext, enabled: false },
    }));
    closeWorld('pause_all');
    track('effect_control_changed', { effect: 'all', control: 'enabled', value: 'false' });
  }, [closeWorld, restoreAll]);

  const setEffectEnabled = useCallback((id: EffectId, enabled: boolean) => {
    setSettings((prev) => ({ ...prev, [id]: { ...prev[id], enabled } } as EffectSettings));
    if (id === 'world' && !enabled) {
      closeWorld('effect_disabled');
    }
  }, [closeWorld]);

  const toggleEffect = useCallback((id: EffectId) => {
    const enabled = !settings[id].enabled;
    setSettings((prev) => ({ ...prev, [id]: { ...prev[id], enabled } } as EffectSettings));
    if (id === 'world' && !enabled) {
      closeWorld('effect_disabled');
    }
  }, [closeWorld, settings]);

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

  const setWorldQuality = useCallback((quality: WorldQuality) => {
    setSettings((prev) => ({
      ...prev,
      world: { ...prev.world, quality },
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
    elements.forEach((element, i) => {
      const id = `${Date.now()}-${Math.random()}-${i}`;
      element.dataset.physicsId = id;
      wordIds.push(id);

      const rect = element.getBoundingClientRect();
      const initialX = rect.left + window.scrollX + rect.width / 2;
      const initialY = rect.top + window.scrollY + rect.height / 2;

      const body = Bodies.rectangle(initialX, initialY, rect.width, rect.height, {
        isStatic: true,
        restitution: 0.3,
        friction: 0.2,
      });

      bodiesRef.current.set(id, {
        body,
        element,
        initial: { x: initialX, y: initialY, angle: 0 },
      });
      Composite.add(engineRef.current.world, body);
    });

    return () => {
      wordIds.forEach((id) => {
        const ref = bodiesRef.current.get(id);
        if (ref) {
          Composite.remove(engineRef.current.world, ref.body);
          bodiesRef.current.delete(id);
        }
      });
    };
  }, []);

  const value: EffectsContextType = {
    settings,
    isInteractionActive: settings.smash.enabled || settings.gravity.enabled,
    worldOpen,
    setEffectEnabled,
    toggleEffect,
    setEffectParam,
    setPretextMode,
    setWorldQuality,
    setFluidQuality,
    openWorld,
    closeWorld,
    registerWords,
    restoreAll,
    pauseAll,
  };

  return (
    <EffectsContext.Provider value={value}>
      {children}
    </EffectsContext.Provider>
  );
};

export const PhysicsProvider = EffectsProvider;
