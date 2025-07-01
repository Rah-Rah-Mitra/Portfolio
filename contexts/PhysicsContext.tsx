
import React, { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import Matter from 'matter-js';

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
  isHammerMode: boolean;
  toggleHammerMode: () => void;
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

const { Engine, Runner, Bodies, Composite, World, Body, Vector } = Matter;

export const PhysicsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isHammerMode, setIsHammerMode] = useState(false);
  const engineRef = useRef(Engine.create());
  const runnerRef = useRef(Runner.create());
  const bodiesRef = useRef<Map<string, BodyRef>>(new Map());
  const boundariesRef = useRef<Matter.Body[]>([]);

  useEffect(() => {
    const engine = engineRef.current;
    engine.gravity.y = 0.4;
    const runner = runnerRef.current;

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
  }, []);

  const toggleHammerMode = useCallback(() => {
    setIsHammerMode(prev => !prev);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!isHammerMode) return;
      const mousePosition = Vector.create(e.pageX, e.pageY);
      bodiesRef.current.forEach(({ body }) => {
        const distance = Vector.magnitude(Vector.sub(mousePosition, body.position));
        if (distance < 100) { // Interaction radius
            Body.setStatic(body, false);
            const forceMagnitude = 0.05 * body.mass;
            const force = Vector.mult(Vector.normalise(Vector.sub(body.position, mousePosition)), forceMagnitude);
            Body.applyForce(body, mousePosition, force);
        }
      });
    };
    if (isHammerMode) {
      document.body.classList.add('hammer-cursor');
      document.addEventListener('mousedown', handleClick);
    }
    return () => {
      document.body.classList.remove('hammer-cursor');
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isHammerMode]);

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

  const restoreAll = useCallback(() => {
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

  const value = {
    isHammerMode,
    toggleHammerMode,
    registerWords,
    restoreAll,
  };

  return (
    <PhysicsContext.Provider value={value}>
        {children}
    </PhysicsContext.Provider>
  );
};
