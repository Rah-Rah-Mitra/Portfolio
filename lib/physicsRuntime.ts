import type Matter from 'matter-js';

export type MatterModule = typeof Matter;

let loadedMatter: MatterModule | null = null;
let matterPromise: Promise<MatterModule> | null = null;

/** matter-js stays out of the main bundle: the only thing that uses it is the
 * Systems Lab drop test (FIG. 05e), which asks for it when the rig scrolls into
 * view or is first struck. One shared promise, so a second caller waits on the
 * same download. A failed download is not cached: the next call imports again,
 * so a flaky connection costs one action, not the figure for the session. */
export const loadMatter = (): Promise<MatterModule> => {
  if (!matterPromise) {
    matterPromise = import('matter-js')
      .then((module) => {
        loadedMatter = (module as { default?: MatterModule }).default ?? (module as unknown as MatterModule);
        return loadedMatter;
      })
      .catch((error: unknown) => {
        matterPromise = null;
        throw error;
      });
  }
  return matterPromise;
};

export const peekMatter = (): MatterModule | null => loadedMatter;
