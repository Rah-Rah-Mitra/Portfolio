import { useEffect, useState } from 'react';
import Matter from 'matter-js';
import { GravityWellParams } from '../physics/abilityConfig';

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
  isActive: boolean,
  gravityWellParams: GravityWellParams
) => {
  const [gravityWellPosition, setGravityWellPosition] = useState<Matter.Vector | null>(null);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive) {
      setGravityWellPosition(null);
      return;
    }

    engine.gravity.y = 0;

    const handleMouseDown = (e: MouseEvent) => {
      const mousePosition = Vector.create(e.pageX, e.pageY);
      const gravityRadius = Math.min(window.innerWidth, window.innerHeight) * gravityWellParams.radiusRatio;

      bodiesRef.current?.forEach(({ body }) => {
        if (Vector.magnitude(Vector.sub(mousePosition, body.position)) < gravityRadius) {
          Body.setStatic(body, false);
        }
      });
      setGravityWellPosition(mousePosition);
    };

    const handleMouseMove = (e: MouseEvent) => {
      setGravityWellPosition((currentPos) => (currentPos ? Vector.create(e.pageX, e.pageY) : null));
    };

    const handleMouseUp = () => {
      setGravityWellPosition(null);
    };

    document.body.classList.add('gravity-cursor');
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (engine) {
        engine.gravity.y = 0.4;
      }
      document.body.classList.remove('gravity-cursor');
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isActive, engineRef, bodiesRef, gravityWellParams]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive || !gravityWellPosition) {
      return;
    }

    const applyGravityForce = () => {
      const gravityRadius = Math.min(window.innerWidth, window.innerHeight) * gravityWellParams.radiusRatio;

      bodiesRef.current?.forEach(({ body }) => {
        if (body.isStatic) return;

        const distanceVector = Vector.sub(gravityWellPosition, body.position);
        const distance = Vector.magnitude(distanceVector);

        if (distance < gravityRadius) {
          const normalizedDistance = Math.max(0, Math.min(1, distance / gravityRadius));
          const pullCurve = Math.pow(1 - normalizedDistance, gravityWellParams.falloff);
          const pullAcceleration = pullCurve * gravityWellParams.acceleration;
          const force = Vector.mult(Vector.normalise(distanceVector), pullAcceleration * body.mass);
          Body.applyForce(body, body.position, force);
        }
      });
    };

    Events.on(engine, 'beforeUpdate', applyGravityForce);

    return () => {
      Events.off(engine, 'beforeUpdate', applyGravityForce);
    };
  }, [isActive, gravityWellPosition, engineRef, bodiesRef, gravityWellParams]);
};
