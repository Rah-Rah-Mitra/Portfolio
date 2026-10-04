import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import {
  detectExperienceCapabilities,
  ExperienceCapabilities,
  ExperiencePolicy,
  modeFromSearch,
  resolveExperiencePolicy,
} from '../lib/experienceMode';

// The prerendered page, and the first client render that hydrates it, carry no
// optional weight: the real policy needs navigator and matchMedia, so it is
// resolved in an effect and the page only ever gains weight after hydration.
const staticPolicy: ExperiencePolicy = {
  mode: 'scan',
  allowHeavyAssets: false,
  lowMotion: true,
  hardFailure: false,
  reason: 'default',
  choice: 'automatic',
};

interface ExperienceModeContextValue {
  policy: ExperiencePolicy;
  capabilities: ExperienceCapabilities | null;
}

const ExperienceModeContext = createContext<ExperienceModeContextValue | null>(null);

export const useExperienceMode = () => {
  const value = useContext(ExperienceModeContext);
  if (!value) throw new Error('useExperienceMode must be used within ExperienceModeProvider');
  return value;
};

/**
 * There is no mode chooser any more: the Guided / Quick Scan switch went with the
 * field-test UI, and every workbench window is plain, readable HTML either way.
 * The policy is read once from the device (Save-Data, reduced motion) and an
 * explicit ?mode= in the URL, and it never writes the URL back.
 */
export const ExperienceModeProvider: React.FC<{
  children: ReactNode;
  capabilities?: ExperienceCapabilities;
}> = ({ children, capabilities: suppliedCapabilities }) => {
  const [capabilities, setCapabilities] = useState<ExperienceCapabilities | null>(suppliedCapabilities ?? null);
  const [policy, setPolicy] = useState<ExperiencePolicy>(staticPolicy);

  useEffect(() => {
    const detected = suppliedCapabilities ?? detectExperienceCapabilities();
    setCapabilities(detected);
    setPolicy(resolveExperiencePolicy(detected, modeFromSearch(window.location.search)));
  }, [suppliedCapabilities]);

  const value = useMemo(() => ({ policy, capabilities }), [policy, capabilities]);
  return <ExperienceModeContext.Provider value={value}>{children}</ExperienceModeContext.Provider>;
};
