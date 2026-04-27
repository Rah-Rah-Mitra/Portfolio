import { useEffect, useRef, type RefObject } from 'react';
import Matter from 'matter-js';
import { PhysicsInputState } from './usePhysicsInputController';

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
  engineRef: RefObject<Matter.Engine>,
  bodiesRef: RefObject<Map<string, BodyRef>>,
  inputState: PhysicsInputState,
  isActive: boolean
) => {
  const wasPressedRef = useRef(false);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive) {
      wasPressedRef.current = inputState.isPressed;
      return;
    }

    engine.gravity.y = 0.4;
    document.body.classList.add('hammer-cursor');

    return () => {
      document.body.classList.remove('hammer-cursor');
    };
  }, [isActive, engineRef, inputState.isPressed]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isActive || !inputState.position) {
      wasPressedRef.current = inputState.isPressed;
      return;
    }

    const didPressThisFrame = inputState.isPressed && !wasPressedRef.current;
    wasPressedRef.current = inputState.isPressed;

    if (!didPressThisFrame) {
      return;
    }

    const pointerPosition = inputState.position;
    const boxWidth = window.innerWidth * 0.4;
    const boxHeight = window.innerHeight * 0.4;

    bodiesRef.current?.forEach(({ body }) => {
      const isInside = body.position.x > pointerPosition.x - boxWidth / 2 &&
                       body.position.x < pointerPosition.x + boxWidth / 2 &&
                       body.position.y > pointerPosition.y - boxHeight / 2 &&
                       body.position.y < pointerPosition.y + boxHeight / 2;

      if (isInside) {
        Body.setStatic(body, false);
        const forceMagnitude = 0.05 * body.mass;
        const force = Vector.mult(Vector.normalise(Vector.sub(body.position, pointerPosition)), forceMagnitude);
        Body.applyForce(body, pointerPosition, force);
      }
    });
  }, [inputState, isActive, engineRef, bodiesRef]);
};
