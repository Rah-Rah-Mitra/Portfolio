
import React, { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import Matter from 'matter-js';
import { Theme } from './ThemeContext';
import { useSmashInteraction } from '../hooks/useSmashInteraction';
import { useGravityWellInteraction } from '../hooks/useGravityWellInteraction';

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
}

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
  const engineRef = useRef(Engine.create());
  const runnerRef = useRef(Runner.create());
  const bodiesRef = useRef<Map<string, BodyRef>>(new Map());
  const boundariesRef = useRef<Matter.Body[]>([]);

  const restoreAll = useCallback(() => {
    // Ensure default gravity is restored when resetting all bodies
    engineRef.current.gravity.y = 0.4;
    
    bodiesRef.current.forEach((ref) => {
      ref.element.classList.add('word-restoring');
      ref.element.style.transform = 'translate(0px, 0px) rotate(0rad)';

      Body.setStatic(ref.body, true);
      Body.setPosition(ref.body, { x: ref.initial.x, y: ref.initial.y });
      Body.setVelocity(ref.body, { x: 0, y: 0 });
      Body.setAngle(ref.body, 0);
      Body.setAngularVelocity(ref.body, 0);
      
      setTimeout(() => {
        ref.element.classList.remove('word-restoring');
      }, 500);
    });
  }, []);

  // Initialize engine, runner, and world
  useEffect(() => {
    const engine = engineRef.current;
    const runner = runnerRef.current;
    
    // Set default gravity
    engine.gravity.y = 0.4;

    const setupBoundaries = () => {
        if (boundariesRef.current.length > 0) {
            Composite.remove(engine.world, boundariesRef.current);
        }
        
        const { scrollWidth, scrollHeight } = document.documentElement;

        boundariesRef.current = [
            Bodies.rectangle(scrollWidth / 2, -30, scrollWidth, 60, { isStatic: true }), // top
            Bodies.rectangle(scrollWidth / 2, scrollHeight + 30, scrollWidth, 60, { isStatic: true }), // bottom
            Bodies.rectangle(-30, scrollHeight / 2, 60, scrollHeight, { isStatic: true }), // left
            Bodies.rectangle(scrollWidth + 30, scrollHeight / 2, 60, scrollHeight, { isStatic: true }), // right
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
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // Conditionally activate the appropriate interaction hook based on theme and state
  useSmashInteraction(engineRef, bodiesRef, isInteractionActive && theme === 'light');
  useGravityWellInteraction(engineRef, bodiesRef, isInteractionActive && theme === 'dark');

  const toggleInteraction = useCallback(() => {
    setIsInteractionActive(prev => !prev);
  }, []);

  // Deactivate interaction when theme changes
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
      
      const body = Bodies.rectangle(initialX, initialY, rect.width, rect.height, { isStatic: true });
      
      bodiesRef.current.set(id, {
        body,
        element,
        initial: { x: initialX, y: initialY, angle: 0 }
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
  };

  return (
    <PhysicsContext.Provider value={value}>
        {children}
    </PhysicsContext.Provider>
  );
};
