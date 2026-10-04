import React, { useEffect } from 'react';
import { useEffects } from '../contexts/PhysicsContext';
import { useExperienceMode } from '../contexts/ExperienceModeContext';
import { AUDIO_CUES, createAudioCueGate, createAudioPolicy, cueForWorldEvent } from '../lib/audioPolicy';
import type { PortfolioWorldEvent } from '../types';
import { PORTFOLIO_WORLD_EVENT } from '../lib/worldEvents';

const SPRITE_URL = '/media/optical-cues.mp3';
const CUE_VOLUME = 0.18;

type AudioContextCtor = typeof AudioContext;

/**
 * Whether cues may sound right now, and why not. Shared with the Effects lab so
 * the drawer reports the same answer the controller acts on. Motion counts:
 * "Pause all motion" and a reduced-motion system setting (lib/motion) both hold
 * the cues, as Save-Data and an explicit ?mode=scan link do.
 */
export const useSoundPolicy = () => {
  const { policy, capabilities } = useExperienceMode();
  const { enhancements, reducedMotion } = useEffects();
  return createAudioPolicy({
    preference: enhancements.soundEnabled,
    userGesture: enhancements.soundUnlocked,
    motionPaused: enhancements.motionPaused,
    lowMotion: reducedMotion || (policy.lowMotion && policy.mode !== 'scan'),
    quickScan: policy.mode === 'scan',
    saveData: Boolean(capabilities?.saveData),
  });
};

// One decoded buffer, one short-lived source node per cue. Web Audio rather
// than seeking an <audio> element: a seek on an unloaded element swallowed the
// first cue (the pause timer fired before playback began), and timer-based
// stops cut cues early or late. A buffer source starts and stops on the sample.
const AudioSpriteController: React.FC = () => {
  const { enabled } = useSoundPolicy();

  useEffect(() => {
    if (!enabled) return undefined;
    const Ctor = (window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext);
    if (!Ctor) return undefined;

    const context = new Ctor();
    const output = context.createGain();
    output.gain.value = CUE_VOLUME;
    output.connect(context.destination);
    const loading = new AbortController();
    let sprite: AudioBuffer | null = null;
    let current: AudioBufferSourceNode | null = null;
    const gate = createAudioCueGate();

    fetch(SPRITE_URL, { signal: loading.signal })
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => { sprite = buffer; })
      .catch(() => undefined); // optional layer: a missing or undecodable sprite stays silent

    // Safari keeps a context created outside a gesture suspended; the next
    // gesture is the only moment it may be resumed.
    const resume = () => { if (context.state === 'suspended') void context.resume().catch(() => undefined); };
    window.addEventListener('pointerdown', resume, true);
    window.addEventListener('keydown', resume, true);

    const handle = (raw: Event) => {
      const cueName = cueForWorldEvent((raw as CustomEvent<PortfolioWorldEvent>).detail);
      if (!cueName || !sprite || !gate.shouldPlay(cueName)) return;
      resume();
      const cue = AUDIO_CUES[cueName];
      // One cue at a time, as before: a new cue cuts the previous one off.
      try { current?.stop(); } catch { /* already ended */ }
      const source = context.createBufferSource();
      source.buffer = sprite;
      source.connect(output);
      source.onended = () => { if (current === source) current = null; };
      source.start(0, cue.startSeconds, cue.durationSeconds);
      current = source;
    };
    window.addEventListener(PORTFOLIO_WORLD_EVENT, handle);

    return () => {
      window.removeEventListener(PORTFOLIO_WORLD_EVENT, handle);
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
      loading.abort();
      try { current?.stop(); } catch { /* already ended */ }
      gate.reset();
      void context.close().catch(() => undefined);
    };
  }, [enabled]);

  return null;
};

export default AudioSpriteController;
