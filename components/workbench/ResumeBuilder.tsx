import React from 'react';
import { Kicker } from './bits';

// Résumé Builder window body (WIN-11). The builder itself, with the evidence
// record it reads, is the lazy chunk ResumeBuilderPanel.tsx: it is imported
// after mount, never during SSR, so the prerendered document carries only this
// placeholder and the main bundle none of the builder (its cap,
// scripts/check-bundle.mjs, has a few kB left).

const KICKER = 'C11 / COMPOSE — TARGETED RESUME FROM THE EVIDENCE RECORD';

export const ResumeBuilder: React.FC = () => {
  const [Panel, setPanel] = React.useState<React.FC | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    import('./ResumeBuilderPanel')
      .then((module) => { if (!cancelled) setPanel(() => module.ResumeBuilderPanel); })
      .catch(() => setFailed(true));
    return () => { cancelled = true; };
  }, []);

  if (Panel) return <Panel />;
  return (
    <div id="resume-builder">
      <Kicker>{KICKER}</Kicker>
      <p className="wb-note">{failed ? 'Could not load the evidence record.' : 'Loading the evidence record…'}</p>
    </div>
  );
};
