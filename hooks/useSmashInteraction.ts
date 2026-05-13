import { useEffect } from 'react';
import Matter from 'matter-js';

const { Body, Vector } = Matter;

type BodyRef = {
  body: Matter.Body;
  element: HTMLElement;
  initial: {
    x: number;
    y: number;
    angle: number;
  };
};

export const useSmashInteraction = (
  engineRef: React.RefObject<Matter.Engine>,
  bodiesRef: React.RefObject<Map<string, BodyRef>>,
  isActive: boolean,
  options: { intensity: number; radius: number }
) => {
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive) {
      return;
    }

    const handleMouseDown = (e: MouseEvent) => {
      const mousePosition = Vector.create(e.pageX, e.pageY);
      const radius = Math.min(window.innerWidth, window.innerHeight) * (options.radius / 100);
      const forceMagnitudeBase = 0.015 + (options.intensity / 100) * 0.075;

      bodiesRef.current?.forEach(({ body }) => {
        const distance = Vector.magnitude(Vector.sub(body.position, mousePosition));
        const isInside = distance < radius;

        if (isInside) {
          Body.setStatic(body, false);
          const falloff = 1 - distance / radius;
          const forceMagnitude = forceMagnitudeBase * Math.max(0.25, falloff) * body.mass;
          const force = Vector.mult(Vector.normalise(Vector.sub(body.position, mousePosition)), forceMagnitude);
          Body.applyForce(body, mousePosition, force);
        }
      });
    };
    
    document.body.classList.add('hammer-cursor');
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      // Cleanup when this interaction is deactivated
      document.body.classList.remove('hammer-cursor');
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isActive, engineRef, bodiesRef, options.intensity, options.radius]);
};
