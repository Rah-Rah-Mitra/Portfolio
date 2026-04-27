import { useEffect, useState } from 'react';
import Matter from 'matter-js';

const { Vector } = Matter;

export type PhysicsInputState = {
  position: Matter.Vector | null;
  isPressed: boolean;
  velocity: Matter.Vector;
  pointerType: string | null;
};

const INITIAL_STATE: PhysicsInputState = {
  position: null,
  isPressed: false,
  velocity: Vector.create(0, 0),
  pointerType: null,
};

export const usePhysicsInputController = () => {
  const [inputState, setInputState] = useState<PhysicsInputState>(INITIAL_STATE);

  useEffect(() => {
    let lastTimestamp = 0;
    let lastPosition: Matter.Vector | null = null;

    const buildVelocity = (position: Matter.Vector, timestamp: number) => {
      if (!lastPosition || !lastTimestamp || timestamp <= lastTimestamp) {
        return Vector.create(0, 0);
      }

      const dt = timestamp - lastTimestamp;
      const delta = Vector.sub(position, lastPosition);
      return Vector.mult(delta, 1 / dt);
    };

    const updateFromEvent = (event: PointerEvent, nextPressed: boolean) => {
      const position = Vector.create(event.pageX, event.pageY);
      const velocity = buildVelocity(position, event.timeStamp);

      lastPosition = position;
      lastTimestamp = event.timeStamp;

      setInputState({
        position,
        isPressed: nextPressed,
        velocity,
        pointerType: event.pointerType,
      });
    };

    const cancelInteraction = () => {
      lastPosition = null;
      lastTimestamp = 0;
      setInputState((prev) => ({
        ...prev,
        isPressed: false,
        velocity: Vector.create(0, 0),
      }));
    };

    const handlePointerDown = (event: PointerEvent) => updateFromEvent(event, true);
    const handlePointerMove = (event: PointerEvent) => {
      setInputState((prev) => {
        if (!prev.isPressed) {
          return prev;
        }

        const position = Vector.create(event.pageX, event.pageY);
        const velocity = buildVelocity(position, event.timeStamp);
        lastPosition = position;
        lastTimestamp = event.timeStamp;

        return {
          position,
          isPressed: true,
          velocity,
          pointerType: event.pointerType,
        };
      });
    };
    const handlePointerUp = (event: PointerEvent) => updateFromEvent(event, false);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelInteraction();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', cancelInteraction);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', cancelInteraction);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', cancelInteraction);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', cancelInteraction);
    };
  }, []);

  return inputState;
};
