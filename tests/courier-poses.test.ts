import { describe, expect, it } from 'vitest';
import { createNeutralCourierPlaceholder } from '../world/courierAsset';

describe('procedural Courier reactions', () => {
  it.each([
    ['look', 'courier-head'], ['inspect', 'courier-head'], ['point', 'courier-right-arm'],
    ['success', 'courier-left-arm'], ['puzzled', 'courier-head'], ['stepAside', 'courier-rig'],
  ])('%s visibly changes a named body transform', (pose, objectName) => {
    const courier = createNeutralCourierPlaceholder();
    const object = courier.root.getObjectByName(objectName);
    expect(object).toBeDefined();
    if (!object) return;
    const before = [...object.position.toArray(), ...object.rotation.toArray().slice(0, 3)];
    courier.setPose(pose);
    const after = [...object.position.toArray(), ...object.rotation.toArray().slice(0, 3)];
    expect(after).not.toEqual(before);
    courier.setPose('idle');
    expect([...object.position.toArray(), ...object.rotation.toArray().slice(0, 3)]).toEqual(before);
    courier.dispose();
  });
});
