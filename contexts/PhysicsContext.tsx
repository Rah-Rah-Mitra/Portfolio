import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { track } from '../lib/analytics';
import { readSoundPreference, SOUND_PREFERENCE_KEY } from '../lib/audioPolicy';
import { defaultBackdropSettings, type BackdropSettings } from '../lib/backdropSettings';
import { MOTION_PAUSED_ATTR, onMotionChange, prefersReducedMotion } from '../lib/motion';

// The FX layer. Two things live here and nothing else:
//  - the desk backgrounds (N-body field, fluid smoke): off at boot, toggled and
//    tuned from the Effects lab drawer, drawn by components/workbench/DeskBackdrop;
//  - the site-wide switches: "Pause all motion" (written to html[data-motion-paused],
//    which every animation loop reads through lib/motion) and sound cues.
// Page-wide word physics (smash / gravity over the whole document) is gone; the
// drop test in the Systems Lab window is its contained replacement.

export type EffectId = keyof BackdropSettings;
export type EffectPatch<K extends EffectId> = Partial<BackdropSettings[K]>;

export type EnhancementSettings = {
  motionPaused: boolean;
  soundEnabled: boolean;
  soundUnlocked: boolean;
};

interface EffectsContextType {
  settings: BackdropSettings;
  enhancements: EnhancementSettings;
  /** The visitor's system asks for reduced motion (detected after mount). */
  reducedMotion: boolean;
  toggleEffect: (id: EffectId) => void;
  updateEffect: <K extends EffectId>(id: K, patch: EffectPatch<K>) => void;
  setMotionPaused: (paused: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  pauseAll: () => void;
}

export const defaultSettings: BackdropSettings = defaultBackdropSettings;

// [min, max, integer]. Ported from the retired appearance validators so a patch
// from anywhere (the drawer, a future page-agent command) lands inside the range
// the engines were tuned for.
type Range = readonly [number, number, boolean?];

const RANGES: { [K in EffectId]: Partial<Record<keyof BackdropSettings[K], Range>> } = {
  nbody: {
    particleCount: [256, 4096, true],
    timeScale: [0.25, 2],
    gravity: [0.2, 2],
    softening: [0.002, 0.04],
    trailPersistence: [0, 90],
    seed: [0, 2_147_483_647, true],
  },
  fluid: {
    speed: [0.2, 2.4],
    intensity: [0, 100],
    opacity: [0, 80],
    splatRadius: [10, 85],
    curl: [0, 90],
  },
  drawing: {},
};

// Discrete settings: anything off this list is dropped, not snapped. An FMM
// expansion order of 7 is not "nearly 8", it is a request the solver never ran.
const CHOICES: { [K in EffectId]: Partial<Record<keyof BackdropSettings[K], readonly unknown[]>> } = {
  nbody: {
    preset: ['galaxy', 'binary', 'field'],
    expansionOrder: [4, 6, 8, 10],
    leafCapacity: [24, 48, 72, 96],
  },
  fluid: {
    quality: ['balanced', 'high'],
  },
  drawing: {},
};

const FLAGS: { [K in EffectId]: readonly (keyof BackdropSettings[K])[] } = {
  nbody: ['enabled', 'pointerAttraction', 'showTree'],
  fluid: ['enabled', 'pointerInteraction'],
  drawing: ['enabled'],
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Keeps only the keys of `patch` that are valid for `id`, clamping numbers into range. */
export const sanitizeEffectPatch = <K extends EffectId>(id: K, patch: Record<string, unknown>): EffectPatch<K> => {
  const ranges = RANGES[id] as Record<string, Range | undefined>;
  const choices = CHOICES[id] as Record<string, readonly unknown[] | undefined>;
  const flags = FLAGS[id] as readonly string[];
  const clean: Record<string, unknown> = {};
  Object.entries(patch).forEach(([key, value]) => {
    const range = ranges[key];
    if (range) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      const [min, max, integer] = range;
      const bounded = clamp(value, min, max);
      clean[key] = integer ? Math.round(bounded) : bounded;
      return;
    }
    const options = choices[key];
    if (options) {
      if (options.includes(value)) clean[key] = value;
      return;
    }
    if (flags.includes(key) && typeof value === 'boolean') clean[key] = value;
  });
  return clean as EffectPatch<K>;
};

/** Pure settings reducer behind updateEffect: unknown keys and bad values never land. */
export const applyEffectPatch = <K extends EffectId>(settings: BackdropSettings, id: K, patch: EffectPatch<K>): BackdropSettings => {
  const clean = sanitizeEffectPatch(id, patch as Record<string, unknown>);
  if (Object.keys(clean).length === 0) return settings;
  return { ...settings, [id]: { ...settings[id], ...clean } };
};

export const EffectsContext = createContext<EffectsContextType | undefined>(undefined);

export const useEffects = () => {
  const context = useContext(EffectsContext);
  if (!context) {
    throw new Error('useEffects must be used within an EffectsProvider');
  }
  return context;
};

const readStoredSoundPreference = () => {
  try {
    return readSoundPreference(window.localStorage.getItem(SOUND_PREFERENCE_KEY));
  } catch {
    return false; // storage blocked (private window, sandboxed frame): stay muted
  }
};

export const EffectsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<BackdropSettings>(defaultSettings);
  const [enhancements, setEnhancements] = useState<EnhancementSettings>({
    motionPaused: false, soundEnabled: false, soundUnlocked: false,
  });
  const [reducedMotion, setReducedMotion] = useState(false);

  // Sound stays muted until the visitor has opted in (persisted) AND touched
  // the page: browsers refuse audio before a gesture anyway.
  useEffect(() => {
    setEnhancements((current) => ({ ...current, soundEnabled: readStoredSoundPreference() }));
    const unlock = () => setEnhancements((current) => (current.soundUnlocked ? current : { ...current, soundUnlocked: true }));
    // Capture phase: the lab stages stop pointerdown propagation (so their
    // hoisted cards don't swing), and a first gesture there must still count.
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => { window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
  }, []);

  // The one write behind "Pause all motion". lib/motion reads this attribute,
  // so every loop on the site (rig springs, mechanisms, backdrops, labs) halts
  // without knowing this provider exists.
  useEffect(() => {
    document.documentElement.setAttribute(MOTION_PAUSED_ATTR, String(enhancements.motionPaused));
  }, [enhancements.motionPaused]);
  useEffect(() => () => document.documentElement.removeAttribute(MOTION_PAUSED_ATTR), []);

  useEffect(() => {
    const sync = () => setReducedMotion(prefersReducedMotion());
    sync();
    return onMotionChange(sync);
  }, []);

  const setMotionPaused = useCallback((motionPaused: boolean) => {
    setEnhancements((current) => (current.motionPaused === motionPaused ? current : { ...current, motionPaused }));
  }, []);

  // Freezes rather than switches off: the backdrops keep their last frame and
  // resume where they stopped, so pausing never loses a configured scene.
  const pauseAll = useCallback(() => {
    setMotionPaused(true);
    track('effect_control_changed', { effect: 'all', control: 'motion', value: 'paused' });
  }, [setMotionPaused]);

  const setSoundEnabled = useCallback((soundEnabled: boolean) => {
    try {
      window.localStorage.setItem(SOUND_PREFERENCE_KEY, String(soundEnabled));
    } catch {
      // Not persisted; the choice still holds for this visit.
    }
    setEnhancements((current) => ({ ...current, soundEnabled }));
  }, []);

  const toggleEffect = useCallback((id: EffectId) => {
    setSettings((prev) => ({ ...prev, [id]: { ...prev[id], enabled: !prev[id].enabled } }));
  }, []);

  const updateEffect = useCallback(<K extends EffectId>(id: K, patch: EffectPatch<K>) => {
    setSettings((prev) => applyEffectPatch(prev, id, patch));
  }, []);

  const value = useMemo<EffectsContextType>(() => ({
    settings,
    enhancements,
    reducedMotion,
    toggleEffect,
    updateEffect,
    setMotionPaused,
    setSoundEnabled,
    pauseAll,
  }), [settings, enhancements, reducedMotion, toggleEffect, updateEffect, setMotionPaused, setSoundEnabled, pauseAll]);

  return (
    <EffectsContext.Provider value={value}>
      {children}
    </EffectsContext.Provider>
  );
};
