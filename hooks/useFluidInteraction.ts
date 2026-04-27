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

interface FluidConfig {
  radiusFactor: number;
  flowStrength: number;
  damping: number;
}

export const useFluidInteraction = (
  engineRef: React.RefObject<Matter.Engine>,
  bodiesRef: React.RefObject<Map<string, BodyRef>>,
  isActive: boolean,
  config: FluidConfig,
) => {
  const [fluidCenter, setFluidCenter] = useState<Matter.Vector | null>(null);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive) {
      setFluidCenter(null);
      return;
    }

    engine.gravity.y = 0;

    const handleMouseDown = (e: MouseEvent) => {
      const position = Vector.create(e.pageX, e.pageY);
      setFluidCenter(position);

      const radius = Math.min(window.innerWidth, window.innerHeight) * config.radiusFactor;
      bodiesRef.current?.forEach(({ body }) => {
        if (Vector.magnitude(Vector.sub(position, body.position)) <= radius) {
          Body.setStatic(body, false);
        }
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      setFluidCenter((current) => (current ? Vector.create(e.pageX, e.pageY) : null));
    };

    const handleMouseUp = () => {
      setFluidCenter(null);
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
  }, [isActive, engineRef, bodiesRef, config.radiusFactor]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive || !fluidCenter) {
      return;
    }

    const applyFluidForces = () => {
      const radius = Math.min(window.innerWidth, window.innerHeight) * config.radiusFactor;

      bodiesRef.current?.forEach(({ body }) => {
        if (body.isStatic) {
          return;
        }

        const offset = Vector.sub(fluidCenter, body.position);
        const distance = Vector.magnitude(offset);
        if (distance === 0 || distance > radius) {
          return;
        }

        const normalized = Vector.normalise(offset);
        const tangential = Vector.create(-normalized.y, normalized.x);
        const pullStrength = (1 - distance / radius) * config.flowStrength * body.mass;
        const pullForce = Vector.mult(normalized, pullStrength);
        const swirlForce = Vector.mult(tangential, pullStrength * 0.6);

        Body.applyForce(body, body.position, pullForce);
        Body.applyForce(body, body.position, swirlForce);
        Body.setVelocity(body, Vector.mult(body.velocity, 1 - config.damping));
      });
    };

    Events.on(engine, 'beforeUpdate', applyFluidForces);

    return () => {
      Events.off(engine, 'beforeUpdate', applyFluidForces);
    };
  }, [isActive, fluidCenter, engineRef, bodiesRef, config.damping, config.flowStrength, config.radiusFactor]);
};
