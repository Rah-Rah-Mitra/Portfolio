import { useEffect } from 'react';
import Matter from 'matter-js';
import { SmashParams } from '../physics/abilityConfig';

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
  smashParams: SmashParams
) => {
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive) {
      return;
    }

    engine.gravity.y = 0.4;

    const handleMouseDown = (e: MouseEvent) => {
      const mousePosition = Vector.create(e.pageX, e.pageY);
      const boxWidth = window.innerWidth * smashParams.areaWidthRatio;
      const boxHeight = window.innerHeight * smashParams.areaHeightRatio;

      bodiesRef.current?.forEach(({ body }) => {
        const isInside =
          body.position.x > mousePosition.x - boxWidth / 2 &&
          body.position.x < mousePosition.x + boxWidth / 2 &&
          body.position.y > mousePosition.y - boxHeight / 2 &&
          body.position.y < mousePosition.y + boxHeight / 2;

        if (isInside) {
          Body.setStatic(body, false);
          const forceMagnitude = smashParams.force * body.mass;
          const direction = Vector.normalise(Vector.sub(body.position, mousePosition));
          const force = Vector.mult(direction, forceMagnitude);
          Body.applyForce(body, mousePosition, force);

          if (smashParams.restitutionInfluence > 0) {
            const restitution = Math.min(
              1,
              Math.max(0, body.restitution + smashParams.restitutionInfluence)
            );
            Body.set(body, { restitution });
          }
        }
      });
    };

    document.body.classList.add('hammer-cursor');
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.body.classList.remove('hammer-cursor');
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isActive, engineRef, bodiesRef, smashParams]);
};
