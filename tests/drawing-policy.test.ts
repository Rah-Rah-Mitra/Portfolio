import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  resolveDrawingActivity, type DrawingActivity, type DrawingActivityInput, type DrawingState,
} from '../lib/drawings/policy';
import { resolveBackdropActivity } from '../lib/desktopBackgroundPolicy';
import { modeFromSearch, resolveExperiencePolicy, type ExperiencePolicy } from '../lib/experienceMode';

// The desk drawing set's activity policy (lib/drawings/policy.ts,
// docs/portfolio/desk-drawing-set.md, plan §5 "Policy"). The drawing is the
// desk's default background, so unlike N-body and smoke it mounts on the light
// policies — as a finished cover still — and only ?mode=scan keeps the plain
// grid. Mounted, the film runs only while nothing holds it: hidden page, halted
// motion, the Estate's GPU claim, or a running FX field, in that order. The
// policies here come from resolveExperiencePolicy, the same function the
// provider runs, so a change there that would move the drawing shows up here.
// Pinned beside it: resolveBackdropActivity still never mounts N-body or smoke
// on those same light policies.

const NONE = { saveData: false, reducedMotion: false };
const DEFAULT = resolveExperiencePolicy(NONE);
const SAVE_DATA = resolveExperiencePolicy({ saveData: true, reducedMotion: false });
const REDUCED = resolveExperiencePolicy({ saveData: false, reducedMotion: true });
const SAVE_DATA_AND_REDUCED = resolveExperiencePolicy({ saveData: true, reducedMotion: true });
const SCAN = resolveExperiencePolicy(NONE, modeFromSearch('?mode=scan'));
const GUIDED = resolveExperiencePolicy(NONE, modeFromSearch('?mode=guided'));

// ExperienceModeContext's staticPolicy (not exported): what the prerender and the
// hydrating render carry until the effect resolves the real one. Restated here
// and checked against the source below; its mode is 'scan' but its reason is not
// 'query', so it must never read as ?mode=scan.
const STATIC: Pick<ExperiencePolicy, 'mode' | 'reason'> = { mode: 'scan', reason: 'default' };

const POLICIES: Array<[string, Pick<ExperiencePolicy, 'mode' | 'reason'>]> = [
  ['default', DEFAULT], ['save-data', SAVE_DATA], ['reduced-motion', REDUCED],
  ['save-data + reduced-motion', SAVE_DATA_AND_REDUCED], ['?mode=scan', SCAN], ['?mode=guided', GUIDED],
  ['static (unresolved)', STATIC],
];

const input = (over: Partial<DrawingActivityInput> = {}): DrawingActivityInput => ({
  enabled: true, resolved: true, policy: DEFAULT,
  motionHalted: false, documentHidden: false, yielded: false, fx: false,
  ...over,
});

const OFF: DrawingActivity = { mount: false, scope: null, running: false, state: null };
const PENDING: DrawingActivity = { mount: false, scope: null, running: false, state: 'pending' };
const cover = (state: DrawingState): DrawingActivity => ({ mount: true, scope: 'cover', running: false, state });
const film = (state: DrawingState): DrawingActivity => ({ mount: true, scope: 'film', running: state === 'running', state });

/** Every combination of the four film holds. */
const HOLDS = Array.from({ length: 16 }, (_, bits) => ({
  documentHidden: (bits & 1) !== 0,
  motionHalted: (bits & 2) !== 0,
  yielded: (bits & 4) !== 0,
  fx: (bits & 8) !== 0,
}));

describe('the policies this file builds', () => {
  it('are the experience policy’s own: reason and mode as the provider would resolve them', () => {
    expect(DEFAULT).toMatchObject({ reason: 'default', mode: 'guided', allowHeavyAssets: true });
    expect(SAVE_DATA).toMatchObject({ reason: 'save-data', mode: 'scan', allowHeavyAssets: false });
    expect(REDUCED).toMatchObject({ reason: 'reduced-motion', mode: 'guided', allowHeavyAssets: false });
    expect(SAVE_DATA_AND_REDUCED).toMatchObject({ reason: 'save-data' });
    expect(SCAN).toMatchObject({ reason: 'query', mode: 'scan', allowHeavyAssets: false });
    expect(GUIDED).toMatchObject({ reason: 'query', mode: 'guided', allowHeavyAssets: true });
  });

  it('restates ExperienceModeContext’s static policy as it is in the source (mode scan, reason default)', () => {
    const source = readFileSync(new URL('../contexts/ExperienceModeContext.tsx', import.meta.url), 'utf8');
    const block = /const staticPolicy: ExperiencePolicy = \{([\s\S]*?)\};/.exec(source)?.[1];
    expect(block).toBeDefined();
    expect(block).toMatch(/mode: 'scan'/);
    expect(block).toMatch(/reason: 'default'/);
  });
});

describe('resolveDrawingActivity', () => {
  // The plan's table, row by row, on the policies the provider really produces.
  it.each<[string, DrawingActivityInput, boolean, DrawingActivity]>([
    ['1 toggle off', input({ enabled: false }), false, OFF],
    ['2 not resolved, not leased', input({ resolved: false, policy: STATIC }), false, PENDING],
    ['3 ?mode=scan', input({ policy: SCAN }), false, OFF],
    ['3′ ?mode=guided', input({ policy: GUIDED }), false, film('running')],
    ['4 Save-Data', input({ policy: SAVE_DATA }), false, cover('save-data')],
    ['5 reduced motion', input({ policy: REDUCED }), false, cover('reduced-motion')],
    ['6 page hidden', input({ documentHidden: true }), false, film('hidden')],
    ['7 motion halted', input({ motionHalted: true }), false, film('motion-halted')],
    ['8 Estate holds the GPU', input({ yielded: true }), false, film('yielded')],
    ['9 an FX field running', input({ fx: true }), false, film('fx')],
    ['10 otherwise', input(), false, film('running')],
  ])('row %s', (_row, given, leased, want) => {
    expect(resolveDrawingActivity(given, leased)).toEqual(want);
  });

  it('is off with the toggle off, whatever the policy, the lease or the holds', () => {
    for (const [, policy] of POLICIES) {
      for (const holds of HOLDS) {
        for (const resolved of [false, true]) {
          for (const leased of [false, true]) {
            expect(resolveDrawingActivity(input({ enabled: false, policy, resolved, ...holds }), leased)).toEqual(OFF);
          }
        }
      }
    }
  });

  it('waits (pending, nothing mounted) until the experience policy resolves, whatever that policy reads', () => {
    for (const [, policy] of POLICIES) {
      for (const holds of HOLDS) {
        expect(resolveDrawingActivity(input({ resolved: false, policy, ...holds }), false)).toEqual(PENDING);
      }
    }
  });

  it('never drops a leased drawing back to pending, and never reads the static policy’s mode as ?mode=scan', () => {
    expect(resolveDrawingActivity(input({ resolved: false, policy: STATIC }), true)).toEqual(film('running'));
    expect(resolveDrawingActivity(input({ resolved: false, policy: STATIC, documentHidden: true }), true)).toEqual(film('hidden'));
    expect(resolveDrawingActivity(input({ resolved: false, policy: SAVE_DATA }), true)).toEqual(cover('save-data'));
  });

  it('mounts nothing under ?mode=scan, which outranks Save-Data and reduced motion', () => {
    const scanOverLight = resolveExperiencePolicy({ saveData: true, reducedMotion: true }, 'scan');
    expect(scanOverLight).toMatchObject({ reason: 'query', mode: 'scan' });
    for (const policy of [SCAN, scanOverLight]) {
      for (const holds of HOLDS) {
        expect(resolveDrawingActivity(input({ policy, ...holds }), false)).toEqual(OFF);
      }
    }
  });

  it('keys ?mode=scan on reason "query": Save-Data’s policy is also mode "scan" and still gets the cover', () => {
    expect(SAVE_DATA.mode).toBe('scan');
    expect(resolveDrawingActivity(input({ policy: SAVE_DATA }), false)).toEqual(cover('save-data'));
    expect(resolveDrawingActivity(input({ policy: { mode: 'guided', reason: 'query' } }), false)).toEqual(film('running'));
  });

  it('runs the film under ?mode=guided, which outranks Save-Data and reduced motion as it does for heavy assets', () => {
    const guidedOverLight = resolveExperiencePolicy({ saveData: true, reducedMotion: true }, 'guided');
    expect(guidedOverLight).toMatchObject({ reason: 'query', mode: 'guided', allowHeavyAssets: true });
    expect(resolveDrawingActivity(input({ policy: GUIDED }), false)).toEqual(film('running'));
    expect(resolveDrawingActivity(input({ policy: guidedOverLight }), false)).toEqual(film('running'));
    expect(resolveDrawingActivity(input({ policy: GUIDED, yielded: true }), false)).toEqual(film('yielded'));
  });

  it('gives Save-Data the cover sheet, still, whatever holds the film', () => {
    for (const policy of [SAVE_DATA, SAVE_DATA_AND_REDUCED]) {
      for (const holds of HOLDS) {
        expect(resolveDrawingActivity(input({ policy, ...holds }), false)).toEqual(cover('save-data'));
      }
    }
  });

  it('gives reduced motion the cover sheet, still, whatever holds the film', () => {
    for (const holds of HOLDS) {
      expect(resolveDrawingActivity(input({ policy: REDUCED, ...holds }), false)).toEqual(cover('reduced-motion'));
    }
  });

  it('holds the film in the order hidden › motion halted › yielded › fx, and runs it only when none holds', () => {
    const order = ['documentHidden', 'motionHalted', 'yielded', 'fx'] as const;
    const stateOf = { documentHidden: 'hidden', motionHalted: 'motion-halted', yielded: 'yielded', fx: 'fx' } as const;
    for (const policy of [DEFAULT, GUIDED]) {
      for (const holds of HOLDS) {
        const first = order.find((key) => holds[key]);
        const want = film(first ? stateOf[first] : 'running');
        expect(resolveDrawingActivity(input({ policy, ...holds }), false)).toEqual(want);
      }
    }
  });

  it('keeps one shape everywhere: unmounted means no scope; running means the film and state "running"; cover means a light policy', () => {
    for (const [, policy] of POLICIES) {
      for (const holds of HOLDS) {
        for (const enabled of [false, true]) {
          for (const resolved of [false, true]) {
            for (const leased of [false, true]) {
              const got = resolveDrawingActivity(input({ enabled, resolved, policy, ...holds }), leased);
              if (!got.mount) {
                expect(got.scope).toBeNull();
                expect(got.running).toBe(false);
                expect([null, 'pending']).toContain(got.state);
              } else {
                expect(got.scope).not.toBeNull();
                expect(got.state).not.toBeNull();
              }
              expect(got.running).toBe(got.state === 'running');
              if (got.running) expect(got.scope).toBe('film');
              expect(got.scope === 'cover').toBe(got.state === 'save-data' || got.state === 'reduced-motion');
            }
          }
        }
      }
    }
  });

  it('uses the lease only to skip pending: once resolved, the answer is the same leased or not', () => {
    for (const [, policy] of POLICIES) {
      for (const holds of HOLDS) {
        const given = input({ policy, ...holds });
        expect(resolveDrawingActivity(given, true)).toEqual(resolveDrawingActivity(given, false));
      }
    }
  });

  it('is pure: it does not touch its input, and the same input gives the same answer', () => {
    const given = input({ policy: { ...SAVE_DATA }, yielded: true });
    const snapshot = structuredClone(given);
    const a = resolveDrawingActivity(given, false);
    const b = resolveDrawingActivity(given, false);
    expect(given).toEqual(snapshot);
    expect(a).toEqual(b);
  });
});

describe('resolveBackdropActivity beside it (N-body and smoke, unchanged)', () => {
  const backdrop = (policy: ExperiencePolicy, leased = false, over: Partial<Parameters<typeof resolveBackdropActivity>[0]> = {}) =>
    resolveBackdropActivity({
      enabled: true, allowHeavyAssets: policy.allowHeavyAssets, motionHalted: false, documentHidden: false, ...over,
    }, leased);

  it('never mounts N-body or smoke on the light policies the drawing still mounts on', () => {
    for (const policy of [SAVE_DATA, REDUCED, SAVE_DATA_AND_REDUCED, SCAN]) {
      expect(backdrop(policy)).toEqual({ mount: false, running: false, reason: 'capability' });
      for (const holds of HOLDS) {
        expect(backdrop(policy, false, holds)).toEqual({ mount: false, running: false, reason: 'capability' });
      }
    }
    // …while the drawing mounts its cover on Save-Data and reduced motion.
    expect(resolveDrawingActivity(input({ policy: SAVE_DATA }), false).mount).toBe(true);
    expect(resolveDrawingActivity(input({ policy: REDUCED }), false).mount).toBe(true);
  });

  it('still mounts and runs them on the default and ?mode=guided policies', () => {
    for (const policy of [DEFAULT, GUIDED]) {
      expect(backdrop(policy)).toEqual({ mount: true, running: true, reason: 'running' });
    }
  });

  it('still keeps a leased engine mounted but frozen when heavy assets are withdrawn', () => {
    expect(backdrop(REDUCED, true)).toEqual({ mount: true, running: false, reason: 'capability' });
  });
});
