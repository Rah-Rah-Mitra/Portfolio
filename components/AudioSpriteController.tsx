import React, { useEffect, useRef } from 'react';
import { useEffects } from '../contexts/PhysicsContext';
import { useExperienceMode } from '../contexts/ExperienceModeContext';
import { AUDIO_CUES, createAudioCueGate, createAudioPolicy, cueForWorldEvent } from '../lib/audioPolicy';
import type { PortfolioWorldEvent } from '../types';
import { PORTFOLIO_WORLD_EVENT } from '../lib/worldEvents';

const AudioSpriteController: React.FC = () => {
  const { policy, capabilities } = useExperienceMode();
  const { enhancements } = useEffects();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimer = useRef<number | null>(null);
  const audioPolicy = createAudioPolicy({
    preference: enhancements.soundEnabled, userGesture: enhancements.soundUnlocked,
    motionPaused: enhancements.motionPaused, lowMotion: policy.lowMotion || policy.mode === 'scan',
    saveData: Boolean(capabilities?.saveData),
  });

  useEffect(() => {
    if (!audioPolicy.enabled) {
      audioRef.current?.pause(); audioRef.current = null;
      if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
      stopTimer.current = null;
      return undefined;
    }
    const audio = new Audio('/media/optical-cues.mp3');
    const cueGate = createAudioCueGate();
    audio.preload = 'none'; audio.volume = .18;
    audioRef.current = audio;
    const handle = (raw: Event) => {
      const cueName = cueForWorldEvent((raw as CustomEvent<PortfolioWorldEvent>).detail);
      if (!cueName || !cueGate.shouldPlay(cueName)) return;
      const cue = AUDIO_CUES[cueName];
      if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
      audio.currentTime = cue.startSeconds;
      void audio.play().catch(() => undefined);
      stopTimer.current = window.setTimeout(() => audio.pause(), cue.durationSeconds * 1000);
    };
    window.addEventListener(PORTFOLIO_WORLD_EVENT, handle);
    return () => {
      window.removeEventListener(PORTFOLIO_WORLD_EVENT, handle);
      if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
      cueGate.reset();
      audio.pause(); audioRef.current = null;
    };
  }, [audioPolicy.enabled]);
  return null;
};

export default AudioSpriteController;
