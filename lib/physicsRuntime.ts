import type Matter from 'matter-js';

export type MatterModule = typeof Matter;

let loadedMatter: MatterModule | null = null;
let matterPromise: Promise<MatterModule> | null = null;

/** matter-js stays out of the main bundle: the effects are off by default, so
 * the engine loads only when smash or gravity is first enabled. */
export const loadMatter = (): Promise<MatterModule> => {
  if (!matterPromise) {
    matterPromise = import('matter-js').then((module) => {
      loadedMatter = (module as { default?: MatterModule }).default ?? (module as unknown as MatterModule);
      return loadedMatter;
    });
  }
  return matterPromise;
};

export const peekMatter = (): MatterModule | null => loadedMatter;
