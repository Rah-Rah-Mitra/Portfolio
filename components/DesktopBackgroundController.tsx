import React, { Suspense, useEffect, useState } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';
import { useExperienceMode } from '../contexts/ExperienceModeContext';
import { useEffects } from '../contexts/PhysicsContext';
import { useOptionalWorkstation } from '../contexts/WorkstationContext';
import { resolveDesktopBackgroundActivity } from '../lib/desktopBackgroundPolicy';

const NBodyBackground = React.lazy(() => import('./NBodyBackground'));
const FluidBackground = React.lazy(() => import('./FluidBackground'));
const heavyApps = new Set(['systems-lab', 'camera-lab', 'world-3d']);

const DesktopBackgroundController: React.FC = () => {
  const { preferences } = useAppearance();
  const { policy } = useExperienceMode();
  const { enhancements } = useEffects();
  const workstation = useOptionalWorkstation();
  const [hidden, setHidden] = useState(() => document.hidden);

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const activity = resolveDesktopBackgroundActivity({
    mode: policy.mode,
    allowHeavyAssets: policy.allowHeavyAssets,
    selectedTheme: preferences.background,
    appearancePaused: preferences.backgroundPaused,
    motionPaused: enhancements.motionPaused,
    documentHidden: hidden,
    heavyAppFocused: Boolean(workstation && heavyApps.has(workstation.state.focusedAppId)),
  });

  return (
    <div className="desktop-background-controller" data-theme={activity.theme} data-activity={activity.reason}>
      <Suspense fallback={<div className="desktop-background-static" />}>
        {activity.theme === 'nbody'
          ? <NBodyBackground active={activity.active} />
          : <FluidBackground />}
      </Suspense>
    </div>
  );
};

export default DesktopBackgroundController;
