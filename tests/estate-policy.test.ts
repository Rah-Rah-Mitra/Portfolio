import { describe, expect, it } from 'vitest';
import budgets from '../lib/estate/packBudgets.json';
import {
  AUTO_LOAD_IDLE_TIMEOUT_MS, ENGINE_GZIP_CAP, ESTATE_ENGINE_STATES, ESTATE_PHASES, ESTATE_REASONS, MAX_LIVE_RESETS,
  RELEASE_AFTER_MS, RESET_WINDOW_MS, RESTORE_TIMEOUT_MS, consentBytes, consentLabel, describeEstateHold,
  enterBytes, enterLabel, formatMegabytes, fullDetailLabel, liveResetCount, noteContextLoss, resolveEstatePhase,
  type EstateHoldReason, type EstatePhase, type EstatePhaseResult, type EstatePolicyInput,
} from '../lib/estate/policy';
import { describeBackdropHold } from '../lib/desktopBackgroundPolicy';
import { resolveExperiencePolicy, type ExperienceMode, type ExperiencePolicy } from '../lib/experienceMode';

// The Estate window's load policy, plan §9.3, with the lifecycle rows of §7.10
// and the generated consent label of §6.5. Three layers: named rows (one per
// sentence of the plan), every combination of the fifteen spec'd inputs checked
// against the plan's invariants, and short sequences the shell walks through.

/** Loaded, open, visible and focused on a capable page that has resolved. */
const BASE: EstatePolicyInput = {
  open: true, focused: true, onscreen: true, hidden: false, halted: false,
  allowHeavyAssets: true, policyResolved: true, saveData: false, userRequested: false,
  engine: 'ready', contextLost: false, lostWhileFrozen: false, closedMs: 0, mounted: true, docReady: true,
};
const at = (over: Partial<EstatePolicyInput>) => resolveEstatePhase({ ...BASE, ...over });

/** A full result, so a row pins every field (an absent reason or action included). */
const want = (phase: EstatePhase, extra: Partial<EstatePhaseResult> = {}): EstatePhaseResult => ({
  phase, lean: false, autoLoad: false, startEngine: false, claimGpu: false, ...extra,
});
const FRESH = { engine: 'none' } as const;
const SAVE_DATA_HELD = { allowHeavyAssets: false, saveData: true, policyReason: 'save-data' } as const;

describe('estate load policy: the §9.3 table, row by row', () => {
  it.each<[string, Partial<EstatePolicyInput>, EstatePhaseResult]>([
    // poster
    ['prerender: static policy, closed, nothing loaded', { ...FRESH, open: false, policyResolved: false, allowHeavyAssets: false, docReady: false }, want('poster')],
    ['never opened, on a capable page', { ...FRESH, open: false }, want('poster')],
    ['deep link before the policy resolves', { ...FRESH, policyResolved: false, allowHeavyAssets: false, policyReason: 'default' }, want('poster')],
    ['deep link before resolve on a Data Saver device: poster, never consent', { ...FRESH, policyResolved: false, allowHeavyAssets: false, saveData: true }, want('poster', { lean: true })],
    ['allowed, but readyState is not complete yet', { ...FRESH, docReady: false }, want('poster')],
    ['asked, then closed before anything started', { ...FRESH, open: false, userRequested: true }, want('poster')],
    // consent
    ['Save-Data: the lean label and the Data Saver line', { ...FRESH, ...SAVE_DATA_HELD }, want('consent', { lean: true, reason: 'held: Data Saver is on', action: 'load' })],
    ['reduced motion: the full label', { ...FRESH, allowHeavyAssets: false, policyReason: 'reduced-motion' }, want('consent', { reason: 'held: your system asks for reduced motion', action: 'load' })],
    ['?mode=scan: the full label', { ...FRESH, allowHeavyAssets: false, policyReason: 'query' }, want('consent', { reason: 'held: this page was opened with ?mode=scan', action: 'load' })],
    ['?mode=scan on a Data Saver device: the scan line and the full label (§9.3)', { ...FRESH, allowHeavyAssets: false, saveData: true, policyReason: 'query' }, want('consent', { reason: 'held: this page was opened with ?mode=scan', action: 'load' })],
    ['Save-Data named by the policy: lean', { ...FRESH, allowHeavyAssets: false, saveData: true, policyReason: 'save-data' }, want('consent', { lean: true, reason: 'held: Data Saver is on', action: 'load' })],
    ['Save-Data with no policy reason passed still names Data Saver', { ...FRESH, allowHeavyAssets: false, saveData: true }, want('consent', { lean: true, reason: 'held: Data Saver is on', action: 'load' })],
    ['a hold it cannot name gets no line, not a guess', { ...FRESH, allowHeavyAssets: false }, want('consent', { action: 'load' })],
    ['consent does not wait for the document', { ...FRESH, ...SAVE_DATA_HELD, docReady: false }, want('consent', { lean: true, reason: 'held: Data Saver is on', action: 'load' })],
    ['consent shows hidden or off screen too', { ...FRESH, ...SAVE_DATA_HELD, hidden: true, onscreen: false }, want('consent', { lean: true, reason: 'held: Data Saver is on', action: 'load' })],
    // loading
    ['allowed and the document complete: automatic, after idle', FRESH, want('loading', { autoLoad: true, startEngine: true })],
    ['asked from consent: starts now, no idle wait', { ...FRESH, allowHeavyAssets: false, policyReason: 'reduced-motion', userRequested: true }, want('loading', { startEngine: true })],
    ['asked under Save-Data: lean', { ...FRESH, ...SAVE_DATA_HELD, userRequested: true }, want('loading', { lean: true, startEngine: true })],
    ['asked before the document is complete', { ...FRESH, allowHeavyAssets: false, userRequested: true, docReady: false }, want('loading', { startEngine: true })],
    ['an explicit request needs no resolved policy', { ...FRESH, policyResolved: false, allowHeavyAssets: false, userRequested: true }, want('loading', { startEngine: true })],
    ['in flight, open', { engine: 'loading' }, want('loading', { startEngine: true })],
    ['closed during loading: downloads finish, no renderer', { engine: 'loading', open: false, closedMs: 1_000 }, want('loading')],
    ['closed during loading, past the release delay: still finishing', { engine: 'loading', open: false, closedMs: 120_000 }, want('loading')],
    ['DESK during loading: downloads finish, no renderer', { engine: 'loading', open: false, closedByDesk: true }, want('loading')],
    ['hidden during loading still starts the renderer', { engine: 'loading', hidden: true, onscreen: false }, want('loading', { startEngine: true })],
    ['a policy flip mid-load stops nothing', { engine: 'loading', allowHeavyAssets: false, policyResolved: false }, want('loading', { startEngine: true })],
    // live
    ['loaded, open, on screen, visible and focused: live, claiming the GPU', {}, want('live', { claimGpu: true })],
    ['unfocused: live without the claim', { focused: false }, want('live')],
    ['motion halted: still live; the visitor drives every frame', { halted: true }, want('live', { claimGpu: true })],
    ['consent came from Save-Data: lean', { ...SAVE_DATA_HELD, userRequested: true }, want('live', { lean: true, claimGpu: true })],
    ['"Load full detail" ends lean', { ...SAVE_DATA_HELD, userRequested: true, fullDetail: true }, want('live', { claimGpu: true })],
    ['?mode=guided overrides Data Saver: full', { saveData: true, policyReason: 'query' }, want('live', { claimGpu: true })],
    ['heavy assets withdrawn after loading: keeps running', { allowHeavyAssets: false, policyReason: 'reduced-motion' }, want('live', { claimGpu: true })],
    ['lost while frozen, reopened: live; the engine re-creates unseen', { contextLost: true, lostWhileFrozen: true, lostMs: 600_000 }, want('live', { claimGpu: true })],
    ['one live reset, restored', { liveResets: 1 }, want('live', { claimGpu: true })],
    // frozen
    ['closed 10 s', { open: false, closedMs: 10_000 }, want('frozen')],
    ['closed a millisecond short of the release', { open: false, closedMs: RELEASE_AFTER_MS - 1 }, want('frozen')],
    ['closed, NaN clock: counts as just closed', { open: false, closedMs: Number.NaN }, want('frozen')],
    ['document hidden', { hidden: true }, want('frozen')],
    ['off screen', { onscreen: false }, want('frozen')],
    ['lost while frozen, still closed', { open: false, closedMs: 5_000, contextLost: true, lostWhileFrozen: true }, want('frozen')],
    ['a frozen loss never times out', { hidden: true, contextLost: true, lostWhileFrozen: true, lostMs: 600_000 }, want('frozen')],
    ['live loss, then hidden: frozen until seen again', { hidden: true, contextLost: true, lostMs: 1_000 }, want('frozen')],
    // released
    ['closed 30 s', { open: false, closedMs: RELEASE_AFTER_MS }, want('released')],
    ['closed for ever', { open: false, closedMs: Number.POSITIVE_INFINITY }, want('released')],
    ['DESK: at once', { open: false, closedByDesk: true }, want('released')],
    ['lost while frozen, then closed 30 s', { open: false, closedMs: RELEASE_AFTER_MS, contextLost: true, lostWhileFrozen: true }, want('released')],
    ['unmounted while loaded (phone layout included)', { mounted: false }, want('released')],
    ['unmounted during loading: the module is discarded, never started', { engine: 'loading', mounted: false }, want('released')],
    ['unmounted with nothing loaded', { ...FRESH, mounted: false }, want('poster')],
    ['unmounted after a 404', { engine: 'stale', mounted: false }, want('released')],
    // lost
    ['live context loss', { contextLost: true, lostMs: 0 }, want('lost', { reason: ESTATE_REASONS.lost, action: 'retry' })],
    ['live loss, a millisecond short of the restore deadline', { contextLost: true, lostMs: RESTORE_TIMEOUT_MS - 1 }, want('lost', { reason: ESTATE_REASONS.lost, action: 'retry' })],
    // unavailable
    ['no WebGL2 or DecompressionStream', { engine: 'unavailable' }, want('unavailable', { reason: ESTATE_REASONS.unsupported, action: 'reload' })],
    ['no restore within 5 s', { contextLost: true, lostMs: RESTORE_TIMEOUT_MS }, want('unavailable', { reason: ESTATE_REASONS.noRestore, action: 'reload' })],
    ['no restore within 5 s, while closed', { open: false, closedMs: 1_000, contextLost: true, lostMs: RESTORE_TIMEOUT_MS }, want('unavailable', { reason: ESTATE_REASONS.noRestore, action: 'reload' })],
    ['two live resets, mid-loss', { contextLost: true, liveResets: 2 }, want('unavailable', { reason: ESTATE_REASONS.resets, action: 'reload' })],
    ['two live resets, even once the second restores', { liveResets: 2 }, want('unavailable', { reason: ESTATE_REASONS.resets, action: 'reload' })],
    ['two live resets outrank a 30 s close', { open: false, closedMs: RELEASE_AFTER_MS, liveResets: 2 }, want('unavailable', { reason: ESTATE_REASONS.resets, action: 'reload' })],
    // error
    ['the engine or first frame failed to download', { engine: 'failed' }, want('error', { reason: ESTATE_REASONS.error, action: 'retry' })],
    ['failed, and closed since', { engine: 'failed', open: false, closedMs: RELEASE_AFTER_MS }, want('error', { reason: ESTATE_REASONS.error, action: 'retry' })],
    // stale
    ['404 on a hashed file', { engine: 'stale' }, want('stale', { reason: ESTATE_REASONS.stale, action: 'reload' })],
    ['stale outranks everything a mounted window has', { engine: 'stale', open: false, policyResolved: false, contextLost: true, liveResets: 9 }, want('stale', { reason: ESTATE_REASONS.stale, action: 'reload' })],
  ])('%s', (_name, over, expected) => {
    expect(at(over)).toEqual(expected);
  });

  it('pins the deadlines and wording the plan gives', () => {
    expect(RELEASE_AFTER_MS).toBe(30_000);
    expect(RESTORE_TIMEOUT_MS).toBe(5_000);
    expect(RESET_WINDOW_MS).toBe(60_000);
    expect(MAX_LIVE_RESETS).toBe(2);
    expect(AUTO_LOAD_IDLE_TIMEOUT_MS).toBe(500);
    expect(ESTATE_REASONS.stale).toBe('The site was updated. Reload to continue.');
    // The reasons sit beside a poster in a public window: no engine jargon.
    for (const text of Object.values(ESTATE_REASONS)) expect(text).not.toMatch(/webgl|three|glb|context|engine/i);
  });
});

// ---- every combination ----------------------------------------------------------

const FLAGS = [
  'open', 'focused', 'onscreen', 'hidden', 'halted', 'allowHeavyAssets', 'policyResolved', 'saveData',
  'userRequested', 'contextLost', 'lostWhileFrozen', 'mounted', 'docReady',
] as const;
const CLOSED_MS = [0, RELEASE_AFTER_MS - 1, RELEASE_AFTER_MS];
const SPACE = 2 ** FLAGS.length * ESTATE_ENGINE_STATES.length * CLOSED_MS.length;

/** Every combination of the fifteen spec'd inputs (optional ones left out), through one reused object. */
const forEveryInput = (visit: (input: EstatePolicyInput) => void) => {
  const input: EstatePolicyInput = { ...BASE };
  for (let mask = 0; mask < 2 ** FLAGS.length; mask += 1) {
    FLAGS.forEach((flag, bit) => { input[flag] = (mask & (1 << bit)) !== 0; });
    for (const engine of ESTATE_ENGINE_STATES) {
      input.engine = engine;
      for (const closedMs of CLOSED_MS) {
        input.closedMs = closedMs;
        visit(input);
      }
    }
  }
};

/** Runs a rule over the whole space; reports the first few inputs that break it. */
const holdsEverywhere = (rule: (input: EstatePolicyInput, out: EstatePhaseResult) => boolean) => {
  const broken: string[] = [];
  let checked = 0;
  forEveryInput((input) => {
    checked += 1;
    const out = resolveEstatePhase(input);
    if (broken.length < 5 && !rule(input, out)) broken.push(`${JSON.stringify(input)} → ${JSON.stringify(out)}`);
  });
  expect(checked).toBe(SPACE);
  expect(broken).toEqual([]);
};

const visible = (i: EstatePolicyInput) => i.open && i.onscreen && !i.hidden;
const liveLoss = (i: EstatePolicyInput) => i.contextLost && !i.lostWhileFrozen;
const iff = (a: boolean, b: boolean) => a === b;

describe(`estate load policy: all ${SPACE.toLocaleString('en')} input combinations`, () => {
  it('is total and reaches every phase', () => {
    const seen = new Set<EstatePhase>();
    holdsEverywhere((_input, out) => {
      seen.add(out.phase);
      return (ESTATE_PHASES as readonly string[]).includes(out.phase)
        && [out.lean, out.autoLoad, out.startEngine, out.claimGpu].every((flag) => typeof flag === 'boolean');
    });
    expect([...seen].sort()).toEqual([...ESTATE_PHASES].sort());
  });

  it('never shows consent before the policy resolves', () => {
    holdsEverywhere((input, out) => out.phase !== 'consent' || input.policyResolved);
  });

  it('shows consent exactly when open, resolved, held, not asked and not started', () => {
    holdsEverywhere((i, out) => iff(out.phase === 'consent',
      i.mounted && i.open && i.engine === 'none' && i.policyResolved && !i.allowHeavyAssets && !i.userRequested));
  });

  it('downloads nothing before the policy resolves unless the visitor asks', () => {
    holdsEverywhere((i, out) => !(i.engine === 'none' && !i.policyResolved && !i.userRequested)
      || (out.phase === 'poster' && !out.autoLoad && !out.startEngine));
  });

  it('starts automatically only after resolve, with heavy assets allowed and the document complete', () => {
    holdsEverywhere((i, out) => iff(out.autoLoad,
      i.mounted && i.open && i.engine === 'none' && i.policyResolved && i.allowHeavyAssets && i.docReady && !i.userRequested));
    holdsEverywhere((_i, out) => !out.autoLoad || out.phase === 'loading');
  });

  it('never auto-loads before readyState is complete', () => {
    holdsEverywhere((i, out) => !(i.engine === 'none' && !i.userRequested && !i.docReady) || out.phase === 'poster' || out.phase === 'consent');
  });

  it('lets a renderer be made only while loading with the window open', () => {
    holdsEverywhere((i, out) => iff(out.startEngine, out.phase === 'loading' && i.open && i.mounted));
  });

  it('keeps a load going once started, open or closed, whatever the policy does', () => {
    holdsEverywhere((i, out) => !(i.mounted && i.engine === 'loading') || (out.phase === 'loading' && out.startEngine === i.open));
  });

  it('is lean exactly when consent came from Save-Data (with no policy reason passed, the capability decides)', () => {
    holdsEverywhere((i, out) => iff(out.lean, i.saveData && !i.allowHeavyAssets));
  });

  it('is never changed by halted motion', () => {
    holdsEverywhere((i, out) => JSON.stringify(resolveEstatePhase({ ...i, halted: !i.halted })) === JSON.stringify(out));
  });

  it('reads focus only for the GPU claim, which is live and focused', () => {
    holdsEverywhere((i, out) => {
      const other = resolveEstatePhase({ ...i, focused: !i.focused });
      return JSON.stringify({ ...other, claimGpu: out.claimGpu }) === JSON.stringify(out)
        && iff(out.claimGpu, out.phase === 'live' && i.focused);
    });
  });

  it('is live exactly when loaded, mounted, open, on screen and visible, with no live loss', () => {
    holdsEverywhere((i, out) => iff(out.phase === 'live', i.mounted && i.engine === 'ready' && visible(i) && !liveLoss(i)));
  });

  it('shows lost exactly for a live loss on a visible window', () => {
    holdsEverywhere((i, out) => iff(out.phase === 'lost', i.mounted && i.engine === 'ready' && visible(i) && liveLoss(i)));
  });

  it('never surfaces a loss taken while frozen', () => {
    holdsEverywhere((i, out) => !(i.contextLost && i.lostWhileFrozen) || (out.phase !== 'lost' && out.phase !== 'unavailable') || i.engine === 'unavailable');
  });

  it('freezes a loaded window that is closed, hidden or off screen, until 30 s closed', () => {
    holdsEverywhere((i, out) => !(i.mounted && i.engine === 'ready') || visible(i)
      || out.phase === (!i.open && i.closedMs >= RELEASE_AFTER_MS ? 'released' : 'frozen'));
  });

  it('releases exactly when unmounted with something started, or loaded and closed 30 s', () => {
    holdsEverywhere((i, out) => iff(out.phase === 'released',
      i.mounted ? i.engine === 'ready' && !i.open && i.closedMs >= RELEASE_AFTER_MS : i.engine !== 'none'));
  });

  it('starts, claims and offers nothing once unmounted', () => {
    holdsEverywhere((i, out) => i.mounted || (!out.autoLoad && !out.startEngine && !out.claimGpu && out.action === undefined
      && out.phase === (i.engine === 'none' ? 'poster' : 'released')));
  });

  it('maps the engine verdicts straight through while mounted', () => {
    const verdict = { stale: 'stale', unavailable: 'unavailable', failed: 'error' } as const;
    holdsEverywhere((i, out) => !i.mounted || !(i.engine in verdict) || out.phase === verdict[i.engine as keyof typeof verdict]);
  });

  it('gives a reason only off the happy path, and the matching button', () => {
    const buttons: Partial<Record<EstatePhase, string>> = { consent: 'load', lost: 'retry', error: 'retry', unavailable: 'reload', stale: 'reload' };
    holdsEverywhere((i, out) => {
      const needsReason = ['lost', 'unavailable', 'error', 'stale'].includes(out.phase);
      const consentReason = out.phase === 'consent' && i.saveData;
      return iff(out.reason !== undefined, needsReason || consentReason) && out.action === buttons[out.phase];
    });
  });

  it('starts nothing for a closed window', () => {
    holdsEverywhere((i, out) => i.open
      || (!out.autoLoad && !out.startEngine && !out.claimGpu && !['consent', 'live', 'lost'].includes(out.phase)));
  });

  it('is deterministic', () => {
    holdsEverywhere((i, out) => JSON.stringify(resolveEstatePhase({ ...i })) === JSON.stringify(out));
  });
});

// ---- sequences the shell walks ---------------------------------------------------------

/** Applies each step on top of the last and records the phase (and the flags that matter). */
const walk = (start: Partial<EstatePolicyInput>, steps: Partial<EstatePolicyInput>[]) => {
  let input: EstatePolicyInput = { ...BASE, ...start };
  const trace = [resolveEstatePhase(input)];
  for (const step of steps) {
    input = { ...input, ...step };
    trace.push(resolveEstatePhase(input));
  }
  return trace;
};
const brief = (r: EstatePhaseResult) =>
  [r.phase, r.autoLoad && 'auto', r.startEngine && 'start', r.lean && 'lean'].filter(Boolean).join(' ');

describe('estate load policy: sequences', () => {
  it('a deep link on a capable page: poster until resolved and complete, then one automatic load, never consent', () => {
    const trace = walk({ engine: 'none', policyResolved: false, allowHeavyAssets: false, docReady: false, policyReason: 'default' }, [
      { policyResolved: true, allowHeavyAssets: true },
      { docReady: true },
      { engine: 'loading' },
      { engine: 'ready' },
    ]);
    expect(trace.map(brief)).toEqual(['poster', 'poster', 'loading auto start', 'loading start', 'live']);
  });

  it('a deep link under Save-Data: consent with the lean label, a click, a lean load, then full detail on request', () => {
    const trace = walk({ engine: 'none', policyResolved: false, allowHeavyAssets: false, saveData: true, docReady: false, policyReason: 'default' }, [
      { policyResolved: true, policyReason: 'save-data' },
      { userRequested: true },
      { engine: 'loading' },
      { engine: 'ready' },
      { fullDetail: true },
    ]);
    // Before resolve the reason is the provisional 'default': not lean, and nothing loads anyway.
    expect(trace.map(brief)).toEqual(['poster', 'consent lean', 'loading start lean', 'loading start lean', 'live lean', 'live']);
  });

  it('closed during loading: the downloads finish, the renderer waits for the window', () => {
    const trace = walk({ engine: 'none' }, [
      { engine: 'loading' },
      { open: false, closedMs: 0 },
      { closedMs: 45_000 },
      { open: true, closedMs: 0 },
      { engine: 'ready' },
    ]);
    expect(trace.map(brief)).toEqual(['loading auto start', 'loading start', 'loading', 'loading', 'loading start', 'live']);
  });

  it('close, reopen at 10 s resumes; close 30 s releases; reopening loads again (from the HTTP cache)', () => {
    const trace = walk({}, [
      { open: false, closedMs: 10_000 },
      { open: true, closedMs: 0 },
      { open: false, closedMs: RELEASE_AFTER_MS },
      { engine: 'none' }, // the shell, having disposed
      { open: true, closedMs: 0 },
    ]);
    expect(trace.map(brief)).toEqual(['live', 'frozen', 'live', 'released', 'poster', 'loading auto start']);
  });

  it('released after consent: reopening does not ask twice', () => {
    const trace = walk({ ...SAVE_DATA_HELD, userRequested: true }, [
      { open: false, closedByDesk: true },
      { engine: 'none' },
      { open: true, closedByDesk: false },
    ]);
    expect(trace.map(brief)).toEqual(['live lean', 'released lean', 'poster lean', 'loading start lean']);
  });

  it('two live resets inside a minute: lost, restored, then unavailable for good', () => {
    let losses = noteContextLoss([], 0, false);
    const first = at({ contextLost: true, lostMs: 0, liveResets: liveResetCount(losses, 0) });
    const restored = at({ liveResets: liveResetCount(losses, 1_000) });
    losses = noteContextLoss(losses, 40_000, false);
    const second = at({ contextLost: true, lostMs: 0, liveResets: liveResetCount(losses, 40_000) });
    // The restore of the second loss arrives; the verdict stands until the shell latches it.
    const after = at({ liveResets: liveResetCount(losses, 41_000) });
    const latched = at({ engine: 'unavailable' });
    expect([first, restored, second, after, latched].map((r) => r.phase)).toEqual(['lost', 'live', 'unavailable', 'unavailable', 'unavailable']);
    expect(second.reason).toBe(ESTATE_REASONS.resets);
  });

  it('a loss while frozen is not counted: the same two losses leave the window live', () => {
    let losses = noteContextLoss([], 0, false); // live
    losses = noteContextLoss(losses, 20_000, true); // tab in the background
    const frozen = at({ hidden: true, contextLost: true, lostWhileFrozen: true, lostMs: 9_000, liveResets: liveResetCount(losses, 29_000) });
    const back = at({ contextLost: true, lostWhileFrozen: true, lostMs: 10_000, liveResets: liveResetCount(losses, 30_000) });
    expect([frozen.phase, back.phase]).toEqual(['frozen', 'live']);
    // Counted, the frozen loss would have been the second reset.
    const counted = noteContextLoss(noteContextLoss([], 0, false), 20_000, false);
    expect(at({ liveResets: liveResetCount(counted, 30_000) }).phase).toBe('unavailable');
  });

  it('a live loss that never restores: lost, then unavailable at 5 s', () => {
    const trace = walk({ contextLost: true, lostMs: 0 }, [{ lostMs: 4_999 }, { lostMs: 5_000 }]);
    expect(trace.map((r) => r.phase)).toEqual(['lost', 'lost', 'unavailable']);
  });

  it('unmounted while the loader is pending: discarded, and a resolved module is never started', () => {
    const trace = walk({ engine: 'loading' }, [{ mounted: false }, { engine: 'ready' }]);
    expect(trace.map(brief)).toEqual(['loading start', 'released', 'released']);
  });
});

// ---- the consent line agrees with the FX panel's ---------------------------------------

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

describe('estate hold wording', () => {
  it('restates ExperiencePolicy reason exactly', () => {
    const same: Same<EstateHoldReason, ExperiencePolicy['reason']> = true;
    expect(same).toBe(true);
  });

  const devices = [false, true].flatMap((saveData) => [false, true].map((reducedMotion) => ({ saveData, reducedMotion })));
  const queries: Array<ExperienceMode | null> = [null, 'scan', 'guided'];

  it.each(devices.flatMap((device) => queries.map((query) => [device, query] as const)))(
    'words the hold as describeBackdropHold does for %o with ?mode=%s', (device, query) => {
      const policy = resolveExperiencePolicy(device, query);
      const out = at({ engine: 'none', allowHeavyAssets: policy.allowHeavyAssets, saveData: device.saveData, policyReason: policy.reason });
      expect(out.phase).toBe(policy.allowHeavyAssets ? 'loading' : 'consent');
      expect(out.reason).toBe(describeBackdropHold(policy) ?? undefined);
      // Every real hold has a line, the FX panel's; the label is lean exactly when the hold is Save-Data's.
      if (!policy.allowHeavyAssets) {
        expect(describeEstateHold(policy.reason, device.saveData)).toBe(describeBackdropHold(policy));
        expect(out.reason).toMatch(/^held: /);
      }
      expect(out.lean).toBe(policy.reason === 'save-data' && !policy.allowHeavyAssets);
    },
  );
});

// ---- the loss record ----------------------------------------------------------------------

describe('estate context-loss record', () => {
  it('records a live loss and never a frozen one', () => {
    expect(noteContextLoss([], 1_000, false)).toEqual([1_000]);
    expect(noteContextLoss([], 1_000, true)).toEqual([]);
    expect(noteContextLoss([1_000], 2_000, true)).toEqual([1_000]);
  });

  it('keeps only losses inside the 60 s window, inclusive', () => {
    expect(noteContextLoss([0], RESET_WINDOW_MS, false)).toEqual([0, RESET_WINDOW_MS]);
    expect(noteContextLoss([0], RESET_WINDOW_MS + 1, false)).toEqual([RESET_WINDOW_MS + 1]);
    expect(noteContextLoss([5_000], 1_000, false)).toEqual([1_000]); // a time from the future is dropped
  });

  it('does not touch the record it is given', () => {
    const record = Object.freeze([1_000, 2_000]);
    expect(noteContextLoss(record, 3_000, false)).toEqual([1_000, 2_000, 3_000]);
    expect(record).toEqual([1_000, 2_000]);
  });

  it('counts the losses inside the window ending now', () => {
    expect(liveResetCount([], 0)).toBe(0);
    expect(liveResetCount([0, 30_000], RESET_WINDOW_MS)).toBe(2);
    expect(liveResetCount([0, 30_000], RESET_WINDOW_MS + 1)).toBe(1);
    expect(liveResetCount([0, 30_000], 10_000)).toBe(1);
  });
});

// ---- the consent label ----------------------------------------------------------------------

/** Plan §6.5's expected figures: first frame ≈ 140 KB, ΣF ≈ 1.65 MB. */
const EXPECTED = { stage0: 140_000, f: 1_650_000 };
/** Its caps: first frame 350 KB, F 2.8 MB. */
const AT_CAPS = { stage0: budgets.pack.firstFrame.bytes, f: budgets.classes.f.total };

const tenthsOf = (label: string): number => {
  const m = /(\d+)\.(\d) MB$/.exec(label);
  if (!m) throw new Error(`no megabytes in ${label}`);
  return Number(m[1]) * 10 + Number(m[2]);
};

describe('estate consent label', () => {
  it('counts the engine at its gzip cap from packBudgets.json, not a measurement', () => {
    expect(ENGINE_GZIP_CAP).toBe(budgets.engineGzip);
    // P4b re-pinned it at the measured Load click + 5% (packBudgets.json units); never above the plan cap.
    expect(ENGINE_GZIP_CAP).toBe(235_000);
    expect(ENGINE_GZIP_CAP).toBeLessThanOrEqual(307_200);
  });

  it('labels a full load as engine cap + stage 0 + ΣF, and a lean one without ΣF', () => {
    expect(consentBytes(EXPECTED, 'full')).toBe(235_000 + 140_000 + 1_650_000);
    expect(consentBytes(EXPECTED, 'lean')).toBe(235_000 + 140_000);
    expect(consentLabel(EXPECTED, 'full')).toBe('Load the 3D estate · 2.1 MB'); // plan: overview ≈ 2.1 MB
    expect(consentLabel(EXPECTED, 'lean')).toBe('Load the 3D estate · 0.4 MB'); // plan: lean ≈ 0.45 MB with the 300 KB cap
    expect(consentLabel(AT_CAPS, 'full')).toBe('Load the 3D estate · 3.4 MB');
    expect(consentLabel(AT_CAPS, 'lean')).toBe('Load the 3D estate · 0.6 MB');
    expect(fullDetailLabel(EXPECTED)).toBe('Load full detail · +1.7 MB');
  });

  it('never states less than the click can download', () => {
    for (const bytes of [EXPECTED, AT_CAPS, { stage0: 0, f: 0 }, { stage0: 1, f: 1 }, { stage0: 92_800, f: 0 }]) {
      for (const mode of ['full', 'lean'] as const) {
        const tenths = tenthsOf(consentLabel(bytes, mode));
        expect(tenths * 100_000).toBeGreaterThanOrEqual(consentBytes(bytes, mode));
        expect(tenths * 100_000 - consentBytes(bytes, mode)).toBeLessThan(100_000);
      }
    }
  });

  it.each([
    [0, '0.0 MB'], [1, '0.1 MB'], [0.5, '0.1 MB'], [99_999, '0.1 MB'], [100_000, '0.1 MB'], [100_001, '0.2 MB'],
    [447_200, '0.5 MB'], [1_850_001, '1.9 MB'], [1_900_000, '1.9 MB'], [1_900_001, '2.0 MB'], [1_999_999, '2.0 MB'],
    [9_999_999, '10.0 MB'], [12_000_000, '12.0 MB'], [12_000_001, '12.1 MB'],
  ])('formats %d B as %s, rounding up', (bytes, text) => {
    expect(formatMegabytes(bytes)).toBe(text);
  });

  it('rounds up, by less than 0.1 MB, across the whole range', () => {
    let seed = 7;
    const next = () => { seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0; return seed; };
    for (let n = 0; n < 20_000; n += 1) {
      const bytes = next() % 20_000_001;
      const tenths = tenthsOf(formatMegabytes(bytes));
      expect(tenths * 100_000 >= bytes && tenths * 100_000 - bytes < 100_000, `${bytes} B → ${formatMegabytes(bytes)}`).toBe(true);
    }
  });

  it('refuses to make a label up from a bad count', () => {
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(() => formatMegabytes(bad)).toThrow(RangeError);
      expect(() => consentLabel({ stage0: bad, f: 0 }, 'lean')).toThrow(/stage0/);
      expect(() => consentLabel({ stage0: 0, f: bad }, 'full')).toThrow(/\bf\b/);
      expect(() => fullDetailLabel({ stage0: 0, f: bad })).toThrow(RangeError);
    }
  });
});

describe('estate Enter label (§6.5)', () => {
  it('sums the building’s F, D, interior, walk and nav bytes, rounded up', () => {
    const blk509 = {
      name: 'Blk 509',
      facade: { bytes: 120_000 }, detail: { bytes: 20_000 }, interior: { bytes: 110_000 }, walk: { bytes: 40_000 }, nav: { bytes: 20_000 },
    };
    expect(enterBytes(blk509)).toBe(310_000);
    expect(enterLabel(blk509)).toBe('Enter Blk 509 · 0.4 MB');
    // A pack that shipped no interiors yet (P4b) counts what it has.
    expect(enterBytes({ name: 'Blk 509', facade: { bytes: 120_000 }, detail: { bytes: 20_000 } })).toBe(140_000);
    expect(() => enterBytes({ name: 'Blk 509', nav: { bytes: Number.NaN } })).toThrow(/Blk 509/);
  });
});
