import { useEffect, useState } from 'react';
import type Matter from 'matter-js';
import { peekMatter } from '../lib/physicsRuntime';

type BodyRef = {
  body: Matter.Body | null;
  element: HTMLElement;
  initial: {
    x: number;
    y: number;
    angle: number;
  };
};

export const useGravityWellInteraction = (
  engineRef: React.RefObject<Matter.Engine | null>,
  bodiesRef: React.RefObject<Map<string, BodyRef>>,
  isActive: boolean,
  options: { strength: number; radius: number }
) => {
  const [gravityWellPosition, setGravityWellPosition] = useState<Matter.Vector | null>(null);

  // Effect to handle mouse input and world gravity toggle
  useEffect(() => {
    const engine = engineRef.current;
    const matter = peekMatter();
    if (!engine || !isActive || !matter) {
      setGravityWellPosition(null);
      return;
    }
    const { Body, Vector } = matter;

    const handleMouseDown = (e: MouseEvent) => {
      const mousePosition = Vector.create(e.pageX, e.pageY);
      const gravityRadius = Math.min(window.innerWidth, window.innerHeight) * (options.radius / 100);

      bodiesRef.current?.forEach(({ body }) => {
        if (!body) return;
        if (Vector.magnitude(Vector.sub(mousePosition, body.position)) < gravityRadius) {
          Body.setStatic(body, false);
        }
      });
      setGravityWellPosition(mousePosition);
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Only update position if the well is active (i.e., mouse is down)
      setGravityWellPosition(currentPos => currentPos ? Vector.create(e.pageX, e.pageY) : null);
    };

    const handleMouseUp = () => {
      setGravityWellPosition(null);
    };

    document.body.classList.add('gravity-cursor');
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      // Restore default gravity when this interaction is deactivated
      document.body.classList.remove('gravity-cursor');
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isActive, engineRef, bodiesRef, options.radius]);

  // Effect to apply continuous gravity well force based on position
  useEffect(() => {
    const engine = engineRef.current;
    const matter = peekMatter();
    if (!engine || !isActive || !gravityWellPosition || !matter) {
      return;
    }
    const { Body, Vector, Events } = matter;

    const applyGravityForce = () => {
      const gravityRadius = Math.min(window.innerWidth, window.innerHeight) * (options.radius / 100);
      const acceleration = 0.004 + (options.strength / 100) * 0.04;

      bodiesRef.current?.forEach(({ body }) => {
        if (!body || body.isStatic) return;

        const distanceVector = Vector.sub(gravityWellPosition, body.position);
        const distance = Vector.magnitude(distanceVector);

        if (distance < gravityRadius) {
          const pullAcceleration = (1 - distance / gravityRadius) * acceleration;
          const force = Vector.mult(Vector.normalise(distanceVector), pullAcceleration * body.mass);
          Body.applyForce(body, body.position, force);
        }
      });
    };

    Events.on(engine, 'beforeUpdate', applyGravityForce);
    
    return () => {
      Events.off(engine, 'beforeUpdate', applyGravityForce);
    };
  }, [isActive, gravityWellPosition, engineRef, bodiesRef, options.radius, options.strength]);
};
