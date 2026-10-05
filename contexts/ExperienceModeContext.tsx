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
  /**
   * The real policy has replaced staticPolicy (set in the same effect, so the
   * two change in one commit). Not `capabilities !== null`: supplied
   * capabilities are present on the first render, while the policy is still
   * the static one. The Estate window reads this so a deep link never shows
   * its consent button before the device has been asked.
   */
  resolved: boolean;
}

const ExperienceModeContext = createContext<ExperienceModeContextValue | null>(null);

export const useExperienceMode = () => {
  const value = useContext(ExperienceModeContext);
  if (!value) throw new Error('useExperienceMode must be used within ExperienceModeProvider');
  return value;
};

/**
 * The same context without the throw, for a window body that is also mounted
 * bare (tests mount <FieldWorkbench/> with no providers). null means there is
 * no provider: no heavy assets, and a policy that never resolves.
 */
export const useOptionalExperienceMode = (): ExperienceModeContextValue | null => useContext(ExperienceModeContext);

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
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const detected = suppliedCapabilities ?? detectExperienceCapabilities();
    setCapabilities(detected);
    setPolicy(resolveExperiencePolicy(detected, modeFromSearch(window.location.search)));
    setResolved(true);
  }, [suppliedCapabilities]);

  const value = useMemo(() => ({ policy, capabilities, resolved }), [policy, capabilities, resolved]);
  return <ExperienceModeContext.Provider value={value}>{children}</ExperienceModeContext.Provider>;
};
