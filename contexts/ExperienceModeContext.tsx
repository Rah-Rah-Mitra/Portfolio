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
import { signalWorldPolicyChange } from '../lib/worldPolicyHandoff';

const SESSION_MODE_KEY = 'portfolio-experience-mode';
const staticPolicy: ExperiencePolicy = {
  mode: 'scan',
  allowHeavyAssets: false,
  lowMotion: true,
  hardFailure: false,
  reason: 'default',
  choice: 'automatic',
};

const modeFromHistoryState = (state: unknown): ExperienceMode | null => {
  if (!state || typeof state !== 'object') return null;
  const mode = (state as { portfolioExperienceMode?: unknown }).portfolioExperienceMode;
  return mode === 'guided' || mode === 'scan' ? mode : null;
};

interface ExperienceModeContextValue {
  policy: ExperiencePolicy;
  capabilities: ExperienceCapabilities | null;
  chooseMode: (mode: ExperienceMode) => void;
}

const ExperienceModeContext = createContext<ExperienceModeContextValue | null>(null);

const signalPolicyHandoff = (policy: ExperiencePolicy) => {
  if (!policy.allowHeavyAssets) signalWorldPolicyChange({ allowWorld: false, qualityTier: 'static' });
};

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
    const saved = sessionStorage.getItem(SESSION_MODE_KEY);
    const sessionChoice: ExperienceMode | null = saved === 'guided' || saved === 'scan' ? saved : null;
    const resolveLocation = (historyChoice: ExperienceMode | null, useSessionChoice: boolean) => resolveExperiencePolicy(
      detected,
      historyChoice ?? (useSessionChoice ? sessionChoice : null),
      modeFromSearch(window.location.search),
    );
    const next = resolveLocation(null, true);
    signalPolicyHandoff(next);
    setCapabilities(detected);
    setPolicy(next);
    if (next.mode === 'scan' && modeFromSearch(window.location.search) !== 'scan') {
      window.history.replaceState({ ...window.history.state, portfolioExperienceMode: 'scan' }, '', withExperienceMode(window.location.href, 'scan'));
    }
    const synchronizeHistory = (event: PopStateEvent) => {
      const historyChoice = modeFromHistoryState(event.state);
      const restored = resolveLocation(historyChoice, false);
      signalPolicyHandoff(restored);
      setPolicy(restored);
      if (historyChoice) sessionStorage.setItem(SESSION_MODE_KEY, historyChoice);
    };
    window.addEventListener('popstate', synchronizeHistory);
    return () => window.removeEventListener('popstate', synchronizeHistory);
  }, [suppliedCapabilities]);

  const chooseMode = (mode: ExperienceMode) => {
    if (!capabilities || (policy.hardFailure && mode === 'guided')) return;
    sessionStorage.setItem(SESSION_MODE_KEY, mode);
    const next = resolveExperiencePolicy(capabilities, mode);
    signalPolicyHandoff(next);
    setPolicy(next);
    window.history.pushState({ ...window.history.state, portfolioExperienceMode: mode }, '', withExperienceMode(window.location.href, mode));
  };

  const value = useMemo(() => ({ policy, capabilities, chooseMode }), [policy, capabilities]);
  return <ExperienceModeContext.Provider value={value}>{children}</ExperienceModeContext.Provider>;
};
