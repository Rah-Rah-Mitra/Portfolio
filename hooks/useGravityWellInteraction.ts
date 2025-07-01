import { useEffect, useState } from 'react';
import Matter from 'matter-js';

const { Body, Vector, Events } = Matter;

type BodyRef = {
  body: Matter.Body;
  element: HTMLElement;
  initial: {
    x: number;
    y: number;
    angle: number;
  };
};

export const useGravityWellInteraction = (
  engineRef: React.RefObject<Matter.Engine>,
  bodiesRef: React.RefObject<Map<string, BodyRef>>,
  isActive: boolean
) => {
  const [gravityWellPosition, setGravityWellPosition] = useState<Matter.Vector | null>(null);

  // Effect to handle mouse input and world gravity toggle
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive) {
      setGravityWellPosition(null);
      return;
    }

    // Gravity well mode requires zero world gravity
    engine.gravity.y = 0;

    const handleMouseDown = (e: MouseEvent) => {
      const mousePosition = Vector.create(e.pageX, e.pageY);
      const gravityRadius = Math.min(window.innerWidth, window.innerHeight) * 0.4;

      bodiesRef.current?.forEach(({ body }) => {
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
      if (engine) {
        engine.gravity.y = 0.4;
      }
      document.body.classList.remove('gravity-cursor');
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isActive, engineRef, bodiesRef]);

  // Effect to apply continuous gravity well force based on position
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive || !gravityWellPosition) {
      return;
    }

    const applyGravityForce = () => {
      const GRAVITY_RADIUS = Math.min(window.innerWidth, window.innerHeight) * 0.4;
      const GRAVITY_ACCELERATION = 0.02;

      bodiesRef.current?.forEach(({ body }) => {
        if (body.isStatic) return;

        const distanceVector = Vector.sub(gravityWellPosition, body.position);
        const distance = Vector.magnitude(distanceVector);

        if (distance < GRAVITY_RADIUS) {
          const pullAcceleration = (1 - distance / GRAVITY_RADIUS) * GRAVITY_ACCELERATION;
          const force = Vector.mult(Vector.normalise(distanceVector), pullAcceleration * body.mass);
          Body.applyForce(body, body.position, force);
        }
      });
    };

    Events.on(engine, 'beforeUpdate', applyGravityForce);
    
    return () => {
      Events.off(engine, 'beforeUpdate', applyGravityForce);
    };
  }, [isActive, gravityWellPosition, engineRef, bodiesRef]);
};