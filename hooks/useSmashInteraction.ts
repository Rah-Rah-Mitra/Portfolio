
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
  isActive: boolean
) => {
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive) {
      return;
    }
    
    // Smash mode requires default downward gravity
    engine.gravity.y = 0.4;

    const handleMouseDown = (e: MouseEvent) => {
      const mousePosition = Vector.create(e.pageX, e.pageY);

      bodiesRef.current?.forEach(({ body }) => {
        const distance = Vector.magnitude(Vector.sub(mousePosition, body.position));
        if (distance < 100) {
            Body.setStatic(body, false);
            const forceMagnitude = 0.05 * body.mass;
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
  }, [isActive, engineRef, bodiesRef]);
};
