import React, { useEffect, useRef, useState } from 'react';
import { EffectId, FluidQuality, NumericEffectId, TextEffectMode, useEffects, VisualDensity } from '../contexts/PhysicsContext';
import type { QualityTier } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import BreakableText from './BreakableText';
import { track } from '../lib/analytics';
import { useOptionalWorkstation } from '../contexts/WorkstationContext';

const RangeField: React.FC<{ label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }> = ({ label, value, min, max, step = 1, suffix = '%', onChange }) => (
  <label className="lab-range">
    <span><span>{label}</span><output>{suffix === '%' ? `${Math.round(value)}%` : `${value.toFixed(1)}${suffix}`}</output></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </label>
);

const EffectToggle: React.FC<{ enabled: boolean; title: string; description: string; onClick: () => void }> = ({ enabled, title, description, onClick }) => (
  <button type="button" className="lab-toggle" aria-pressed={enabled} onClick={onClick}>
    <span><strong>{title}</strong><small>{description}</small></span>
    <span aria-hidden="true" className="toggle-track"><span /></span>
  </button>
);

const presets: Record<NumericEffectId, Record<'gentle' | 'balanced' | 'intense', Record<string, number>>> = {
  smash: { gentle: { intensity: 28, radius: 32 }, balanced: { intensity: 60, radius: 42 }, intense: { intensity: 88, radius: 68 } },
  gravity: { gentle: { strength: 22, radius: 36 }, balanced: { strength: 45, radius: 48 }, intense: { strength: 78, radius: 72 } },
  fluid: {
    gentle: { speed: 0.7, intensity: 38, opacity: 28, curl: 18, splatRadius: 28 },
    balanced: { speed: 1.15, intensity: 62, opacity: 48, curl: 34, splatRadius: 46 },
    intense: { speed: 1.9, intensity: 86, opacity: 72, curl: 68, splatRadius: 72 },
  },
  pretext: { gentle: { intensity: 24 }, balanced: { intensity: 42 }, intense: { intensity: 82 } },
};

const EffectsLabPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const suppressFocusRestore = useRef(false);
  const openedAt = useRef<number | null>(null);
  const { settings, enhancements, toggleEffect, setEffectParam, setPretextMode, setFluidQuality, restoreAll, pauseAll, setMotionPaused, setVisualDensity, setMediaEnabled, setSoundEnabled, setQuality } = useEffects();
  const workstation = useOptionalWorkstation();
  useFocusTrap(open, panelRef, '[data-open-effects], .effects-dock', suppressFocusRestore);

  const close = (reason: string) => {
    setOpen(false);
    track('panel_closed', { panel: 'effects_lab', reason, duration_ms: openedAt.current ? Math.round(performance.now() - openedAt.current) : 0 });
    openedAt.current = null;
  };

  const openPanel = (source: string) => {
    openedAt.current = performance.now();
    setOpen(true);
    track('panel_opened', { panel: 'effects_lab', source });
  };

  useEffect(() => {
    const handleOpen = () => openPanel('page_cta');
    window.addEventListener('portfolio:openEffects', handleOpen);
    return () => window.removeEventListener('portfolio:openEffects', handleOpen);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close('escape_key'); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);

  const toggle = (id: EffectId) => {
    toggleEffect(id);
    track('effect_control_changed', { effect: id, control: 'enabled', value: String(!settings[id].enabled) });
  };
  const applyPreset = (id: NumericEffectId, preset: 'gentle' | 'balanced' | 'intense') => {
    Object.entries(presets[id][preset]).forEach(([param, value]) => setEffectParam(id, param, value));
    track('effect_preset_applied', { effect: id, preset });
  };
  const PresetRow = ({ id }: { id: NumericEffectId }) => (
    <div className="lab-presets" aria-label={`${id} presets`}>
      {(['gentle', 'balanced', 'intense'] as const).map((preset) => <button key={preset} type="button" onClick={() => applyPreset(id, preset)}>{preset}</button>)}
    </div>
  );

  const dockTrigger = (
    <button type="button" className="effects-dock" data-open-effects onClick={() => openPanel('dock')} aria-label="FX, open optional effects lab">
      <span aria-hidden="true">FX</span><span>Lab mode</span>
    </button>
  );

  if (!open) return dockTrigger;

  return (
    <>
      {dockTrigger}
      <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close('backdrop'); }}>
        <aside ref={panelRef} className="effects-lab" role="dialog" aria-modal="true" aria-labelledby="effects-title" tabIndex={-1}>
        <header className="panel-header">
          <div><h2 id="effects-title">Effects lab</h2><p className="panel-context">Optional interaction layer</p></div>
          <button type="button" onClick={() => close('close_button')}>Close</button>
        </header>
        <p className="panel-intro">All stronger motion is opt-in. Pause everything at any time; reduced-motion preferences always take priority.</p>
        <div className="lab-safety-row">
          <button type="button" aria-pressed={enhancements.motionPaused} onClick={() => { const paused = !enhancements.motionPaused; setMotionPaused(paused); if (paused) pauseAll(); }}>{enhancements.motionPaused ? 'Resume motion' : 'Pause all motion'}</button>
          <button type="button" onClick={restoreAll}>Reset displaced text</button>
        </div>
        <div className="lab-sample" aria-label="Text effect test surface"><BreakableText text="interaction test surface" /></div>

        <div className="lab-sections">
          <section aria-labelledby="experience-output-title">
            <h3 id="experience-output-title">Experience output</h3>
            <EffectToggle enabled={enhancements.mediaEnabled} title="Supporting media" description="Optional local-generated video; evidence remains in text" onClick={() => setMediaEnabled(!enhancements.mediaEnabled)} />
            <EffectToggle enabled={enhancements.soundEnabled} title="Sound cues" description="Muted by default; unlocked only after your gesture" onClick={() => setSoundEnabled(!enhancements.soundEnabled)} />
            <label className="lab-select"><span>Visual density</span><select value={enhancements.visualDensity} onChange={(event) => setVisualDensity(event.target.value as VisualDensity)}><option value="minimal">Minimal</option><option value="balanced">Balanced</option><option value="dense">Dense</option></select></label>
            <label className="lab-select"><span>World quality</span><select value={enhancements.quality} onChange={(event) => setQuality(event.target.value as QualityTier)}><option value="full">Full</option><option value="balanced">Balanced</option><option value="reduced">Reduced</option><option value="static">Static</option></select></label>
          </section>
          <section>
            <EffectToggle enabled={settings.smash.enabled} title="Smash" description="Pointer impulse on the test surface" onClick={() => toggle('smash')} />
            <PresetRow id="smash" />
            <RangeField label="Intensity" value={settings.smash.intensity} min={0} max={100} onChange={(value) => setEffectParam('smash', 'intensity', value)} />
            <RangeField label="Radius" value={settings.smash.radius} min={20} max={70} onChange={(value) => setEffectParam('smash', 'radius', value)} />
          </section>
          <section>
            <EffectToggle enabled={settings.gravity.enabled} title="Gravity" description="Pointer-centered attraction field" onClick={() => toggle('gravity')} />
            <PresetRow id="gravity" />
            <RangeField label="Strength" value={settings.gravity.strength} min={0} max={100} onChange={(value) => setEffectParam('gravity', 'strength', value)} />
            <RangeField label="Radius" value={settings.gravity.radius} min={20} max={75} onChange={(value) => setEffectParam('gravity', 'radius', value)} />
          </section>
          <section>
            <EffectToggle enabled={settings.fluid.enabled} title="Fluid field" description="Translucent pointer-driven WebGL layer" onClick={() => toggle('fluid')} />
            <PresetRow id="fluid" />
            <RangeField label="Speed" value={settings.fluid.speed} min={0.2} max={2.4} step={0.1} suffix="×" onChange={(value) => setEffectParam('fluid', 'speed', value)} />
            <RangeField label="Opacity" value={settings.fluid.opacity} min={0} max={80} onChange={(value) => setEffectParam('fluid', 'opacity', value)} />
            <RangeField label="Curl" value={settings.fluid.curl} min={0} max={90} onChange={(value) => setEffectParam('fluid', 'curl', value)} />
            <label className="lab-select"><span>Quality</span><select value={settings.fluid.quality} onChange={(event) => setFluidQuality(event.target.value as FluidQuality)}><option value="balanced">Balanced</option><option value="high">High</option></select></label>
          </section>
          <section>
            <EffectToggle enabled={settings.pretext.enabled} title="Text signal" description="Decode, scan, or pulse on marked text" onClick={() => toggle('pretext')} />
            <PresetRow id="pretext" />
            <label className="lab-select"><span>Mode</span><select value={settings.pretext.mode} onChange={(event) => setPretextMode(event.target.value as TextEffectMode)}><option value="decode">Decode</option><option value="scan">Scan</option><option value="pulse">Pulse</option></select></label>
            <RangeField label="Strength" value={settings.pretext.intensity} min={0} max={100} onChange={(value) => setEffectParam('pretext', 'intensity', value)} />
          </section>
          <section className="world-control">
            <h3>Explore World</h3>
            <p>The shared optical test bench is this site’s enhancement target. This anchor marks its integration point; the evidence document remains the shipped experience.</p>
            <a href="#world" onClick={(event) => {
              if (workstation?.enabled && workstation.enhanced) {
                event.preventDefault();
                workstation.openApp('world-3d', 'link');
              }
              close('explore_world');
            }}>Explore World</a>
          </section>
        </div>
        </aside>
      </div>
    </>
  );
};

export default EffectsLabPanel;
