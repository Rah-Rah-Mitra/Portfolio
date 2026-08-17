import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import {
  detectExperienceCapabilities,
  ExperienceCapabilities,
  ExperienceMode,
  ExperiencePolicy,
  modeFromSearch,
  resolveExperiencePolicy,
  withExperienceMode,
} from '../lib/experienceMode';

const SESSION_MODE_KEY = 'portfolio-experience-mode';
const staticPolicy: ExperiencePolicy = {
  mode: 'scan',
  allowHeavyAssets: false,
  lowMotion: true,
  hardFailure: false,
  reason: 'default',
};

interface ExperienceModeContextValue {
  policy: ExperiencePolicy;
  chooseMode: (mode: ExperienceMode) => void;
}

const ExperienceModeContext = createContext<ExperienceModeContextValue | null>(null);

export const useExperienceMode = () => {
  const value = useContext(ExperienceModeContext);
  if (!value) throw new Error('useExperienceMode must be used within ExperienceModeProvider');
  return value;
};

export const ExperienceModeProvider: React.FC<{
  children: ReactNode;
  capabilities?: ExperienceCapabilities;
}> = ({ children, capabilities: suppliedCapabilities }) => {
  const [capabilities, setCapabilities] = useState<ExperienceCapabilities | null>(suppliedCapabilities ?? null);
  const [policy, setPolicy] = useState<ExperiencePolicy>(staticPolicy);

  useEffect(() => {
    const detected = suppliedCapabilities ?? detectExperienceCapabilities();
    const queryMode = modeFromSearch(window.location.search);
    const saved = sessionStorage.getItem(SESSION_MODE_KEY);
    const sessionChoice: ExperienceMode | null = saved === 'guided' || saved === 'scan' ? saved : null;
    const next = resolveExperiencePolicy(detected, sessionChoice, queryMode);
    setCapabilities(detected);
    setPolicy(next);
    if (next.mode === 'scan' && queryMode !== 'scan') {
      window.history.replaceState(window.history.state, '', withExperienceMode(window.location.href, 'scan'));
    }
  }, [suppliedCapabilities]);

  const chooseMode = (mode: ExperienceMode) => {
    if (!capabilities || (policy.hardFailure && mode === 'guided')) return;
    sessionStorage.setItem(SESSION_MODE_KEY, mode);
    const next = resolveExperiencePolicy(capabilities, mode);
    setPolicy(next);
    window.history.pushState(window.history.state, '', withExperienceMode(window.location.href, mode));
  };

  const value = useMemo(() => ({ policy, chooseMode }), [policy]);
  return <ExperienceModeContext.Provider value={value}>{children}</ExperienceModeContext.Provider>;
};
