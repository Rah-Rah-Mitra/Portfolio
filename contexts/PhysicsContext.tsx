import React, { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import Matter from 'matter-js';
import { Theme } from './ThemeContext';
import { useSmashInteraction } from '../hooks/useSmashInteraction';
import { useGravityWellInteraction } from '../hooks/useGravityWellInteraction';
import { useFluidInteraction } from '../hooks/useFluidInteraction';

export type PhysicsAbility = 'smash' | 'gravity_well' | 'fluid';

export interface AbilityParams {
  smash: {
    radiusFactor: number;
    forceMultiplier: number;
  };
  gravity_well: {
    radiusFactor: number;
    acceleration: number;
  };
  fluid: {
    radiusFactor: number;
    flowStrength: number;
    damping: number;
  };
}

type BodyRef = {
  body: Matter.Body;
  element: HTMLElement;
  initial: {
    x: number;
    y: number;
    angle: number;
  };
};

interface PhysicsContextType {
  isInteractionActive: boolean;
  toggleInteraction: () => void;
  restoreAll: () => void;
  registerWords: (elements: HTMLElement[]) => () => void;
  activeAbility: PhysicsAbility;
  setActiveAbility: (ability: PhysicsAbility) => void;
  abilityParams: AbilityParams;
  setAbilityParam: <A extends PhysicsAbility, K extends keyof AbilityParams[A]>(
    ability: A,
    key: K,
    value: AbilityParams[A][K],
  ) => void;
}

export const defaultAbilityParams: AbilityParams = {
  smash: {
    radiusFactor: 0.35,
    forceMultiplier: 0.05,
  },
  gravity_well: {
    radiusFactor: 0.4,
    acceleration: 0.02,
  },
  fluid: {
    radiusFactor: 0.45,
    flowStrength: 0.018,
    damping: 0.02,
  },
};

const STORAGE_KEY = 'physics_controls_state_v1';

export const PhysicsContext = createContext<PhysicsContextType | undefined>(undefined);

export const usePhysics = () => {
  const context = useContext(PhysicsContext);
  if (!context) {
    throw new Error('usePhysics must be used within a PhysicsProvider');
  }
  return context;
};

const { Engine, Runner, Bodies, Composite, World, Body } = Matter;

export const PhysicsProvider: React.FC<{ children: ReactNode; theme: Theme }> = ({ children, theme }) => {
  const [isInteractionActive, setIsInteractionActive] = useState(false);
  const [activeAbility, setActiveAbility] = useState<PhysicsAbility>('smash');
  const [abilityParams, setAbilityParams] = useState<AbilityParams>(defaultAbilityParams);
  const engineRef = useRef(Engine.create());
  const runnerRef = useRef(Runner.create());
  const bodiesRef = useRef<Map<string, BodyRef>>(new Map());
  const boundariesRef = useRef<Matter.Body[]>([]);
  const restoreTimers = useRef(new Set<number>());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved) as {
        activeAbility?: PhysicsAbility;
        abilityParams?: Partial<AbilityParams>;
      };

      if (parsed.activeAbility && ['smash', 'gravity_well', 'fluid'].includes(parsed.activeAbility)) {
        setActiveAbility(parsed.activeAbility);
      }

      if (parsed.abilityParams) {
        setAbilityParams({
          smash: {
            ...defaultAbilityParams.smash,
            ...parsed.abilityParams.smash,
          },
          gravity_well: {
            ...defaultAbilityParams.gravity_well,
            ...parsed.abilityParams.gravity_well,
          },
          fluid: {
            ...defaultAbilityParams.fluid,
            ...parsed.abilityParams.fluid,
          },
        });
      }
    } catch {
      // ignore malformed saved values
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeAbility, abilityParams }));
    } catch {
      // ignore storage write failures
    }
  }, [activeAbility, abilityParams]);

  const restoreAll = useCallback(() => {
    setIsInteractionActive(false);
    engineRef.current.gravity.y = 0.4;

    restoreTimers.current.forEach(timerId => clearTimeout(timerId));
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
    const runner = runnerRef.current;

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

    const renderLoop = () => {
      bodiesRef.current.forEach((ref) => {
        if (!ref.element) return;

        const isRestoring = ref.element.classList.contains('word-restoring');

        if (!ref.body.isStatic) {
          ref.element.classList.add('physics-active');
        } else if (!isRestoring) {
          ref.element.classList.remove('physics-active');
        }

        if (isRestoring || ref.body.isStatic) {
          return;
        }

        const { x, y } = ref.body.position;
        const angle = ref.body.angle;
        ref.element.style.transform = `translate(${x - ref.initial.x}px, ${y - ref.initial.y}px) rotate(${angle}rad)`;
      });
      requestAnimationFrame(renderLoop);
    };

    Runner.run(runner, engine);
    renderLoop();

    return () => {
      Runner.stop(runner);
      World.clear(engine.world, false);
      Engine.clear(engine);
      window.removeEventListener('resize', handleResize);
      restoreTimers.current.forEach(timerId => clearTimeout(timerId));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isInteractionActive) {
      document.body.classList.add('no-select');
    } else {
      document.body.classList.remove('no-select');
    }
    return () => {
      document.body.classList.remove('no-select');
    };
  }, [isInteractionActive]);

  useSmashInteraction(engineRef, bodiesRef, isInteractionActive && activeAbility === 'smash', abilityParams.smash);
  useGravityWellInteraction(engineRef, bodiesRef, isInteractionActive && activeAbility === 'gravity_well', abilityParams.gravity_well);
  useFluidInteraction(engineRef, bodiesRef, isInteractionActive && activeAbility === 'fluid', abilityParams.fluid);

  const toggleInteraction = useCallback(() => {
    setIsInteractionActive(prev => !prev);
  }, []);

  const setAbilityParam = useCallback(<A extends PhysicsAbility, K extends keyof AbilityParams[A]>(
    ability: A,
    key: K,
    value: AbilityParams[A][K],
  ) => {
    setAbilityParams((prev) => ({
      ...prev,
      [ability]: {
        ...prev[ability],
        [key]: value,
      },
    }));
  }, []);

  useEffect(() => {
    setIsInteractionActive(false);
  }, [theme]);

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
      wordIds.forEach(id => {
        const ref = bodiesRef.current.get(id);
        if (ref) {
          Composite.remove(engineRef.current.world, ref.body);
          bodiesRef.current.delete(id);
        }
      });
    };
  }, []);

  const value = {
    isInteractionActive,
    toggleInteraction,
    registerWords,
    restoreAll,
    activeAbility,
    setActiveAbility,
    abilityParams,
    setAbilityParam,
  };

  return (
    <PhysicsContext.Provider value={value}>
      {children}
    </PhysicsContext.Provider>
  );
};
