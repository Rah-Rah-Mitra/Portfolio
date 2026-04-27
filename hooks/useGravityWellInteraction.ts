import { useEffect, useMemo, type RefObject } from 'react';
import Matter from 'matter-js';
import { PhysicsInputState } from './usePhysicsInputController';

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
  engineRef: RefObject<Matter.Engine>,
  bodiesRef: RefObject<Map<string, BodyRef>>,
  inputState: PhysicsInputState,
  isActive: boolean
) => {
  const gravityWellPosition = useMemo(() => {
    if (!inputState.isPressed) {
      return null;
    }
    return inputState.position;
  }, [inputState.isPressed, inputState.position]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive) {
      return;
    }

    engine.gravity.y = 0;
    document.body.classList.add('gravity-cursor');

    return () => {
      engine.gravity.y = 0.4;
      document.body.classList.remove('gravity-cursor');
    };
  }, [isActive, engineRef]);

  useEffect(() => {
    if (!isActive || !gravityWellPosition) {
      return;
    }

    const gravityRadius = Math.min(window.innerWidth, window.innerHeight) * 0.4;

    bodiesRef.current?.forEach(({ body }) => {
      if (Vector.magnitude(Vector.sub(gravityWellPosition, body.position)) < gravityRadius) {
        Body.setStatic(body, false);
      }
    });
  }, [isActive, gravityWellPosition, bodiesRef]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive || !gravityWellPosition) {
      return;
    }

    const applyGravityForce = () => {
      const gravityRadius = Math.min(window.innerWidth, window.innerHeight) * 0.4;
      const gravityAcceleration = 0.02;

      bodiesRef.current?.forEach(({ body }) => {
        if (body.isStatic) return;

        const distanceVector = Vector.sub(gravityWellPosition, body.position);
        const distance = Vector.magnitude(distanceVector);

        if (distance < gravityRadius) {
          const pullAcceleration = (1 - distance / gravityRadius) * gravityAcceleration;
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
