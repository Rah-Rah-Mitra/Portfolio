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

interface SmashConfig {
  radiusFactor: number;
  forceMultiplier: number;
}

export const useSmashInteraction = (
  engineRef: React.RefObject<Matter.Engine>,
  bodiesRef: React.RefObject<Map<string, BodyRef>>,
  isActive: boolean,
  config: SmashConfig,
) => {
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive) {
      return;
    }

    engine.gravity.y = 0.4;

    const handleMouseDown = (e: MouseEvent) => {
      const mousePosition = Vector.create(e.pageX, e.pageY);
      const radius = Math.min(window.innerWidth, window.innerHeight) * config.radiusFactor;

      bodiesRef.current?.forEach(({ body }) => {
        if (Vector.magnitude(Vector.sub(body.position, mousePosition)) > radius) {
          return;
        }

        Body.setStatic(body, false);
        const forceMagnitude = config.forceMultiplier * body.mass;
        const force = Vector.mult(Vector.normalise(Vector.sub(body.position, mousePosition)), forceMagnitude);
        Body.applyForce(body, mousePosition, force);
      });
    };

    document.body.classList.add('hammer-cursor');
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.body.classList.remove('hammer-cursor');
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isActive, engineRef, bodiesRef, config.forceMultiplier, config.radiusFactor]);
};
