import React, { useEffect, useRef } from 'react';
import { useEffects } from '../contexts/PhysicsContext';
import { useExperienceMode } from '../contexts/ExperienceModeContext';
import { AUDIO_CUES, createAudioPolicy, type AudioCue } from '../lib/audioPolicy';
import type { PortfolioWorldEvent } from '../types';

const cueForEvent = (event: PortfolioWorldEvent): AudioCue | null => {
  if (event.type === 'CAMERA_CALIBRATED' || event.type === 'STEREO_POINT_TRIANGULATED') return 'calibrationConfirm';
  if (event.type === 'CAMERA_LAB_UPDATED') return 'railServo';
  if (event.type === 'DEPARTURE_COMPLETED' || event.type === 'LAB_RESET') return 'opticalClick';
  if (event.type === 'EXPLORE_ENTERED' || event.type === 'EXPLORE_EXITED') return 'sceneTransition';
  return null;
};

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
    audio.preload = 'none'; audio.volume = .18;
    audioRef.current = audio;
    const handle = (raw: Event) => {
      const cueName = cueForEvent((raw as CustomEvent<PortfolioWorldEvent>).detail);
      if (!cueName) return;
      const cue = AUDIO_CUES[cueName];
      if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
      audio.currentTime = cue.startSeconds;
      void audio.play().catch(() => undefined);
      stopTimer.current = window.setTimeout(() => audio.pause(), cue.durationSeconds * 1000);
    };
    window.addEventListener('portfolio:world-event', handle);
    return () => {
      window.removeEventListener('portfolio:world-event', handle);
      if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
      audio.pause(); audioRef.current = null;
    };
  }, [audioPolicy.enabled]);
  return null;
};

export default AudioSpriteController;
