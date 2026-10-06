import React, { useEffect, useId, useRef, useState } from 'react';
import { useEffects, type EffectId, type EffectPatch } from '../contexts/PhysicsContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { track } from '../lib/analytics';
import { describeAudioPolicy } from '../lib/audioPolicy';
import { BACKDROP_YIELD_HOLD, describeBackdropHold } from '../lib/desktopBackgroundPolicy';
import { isGpuClaimed, onGpuClaimChange } from '../lib/gpuClaim';
import { dispatchWorkbenchOpen } from '../lib/workbench';
import { useExperienceMode } from '../contexts/ExperienceModeContext';
import type { NBodyExpansionOrder, NBodyLeafCapacity, NBodyPreset } from '../types';
import { useSoundPolicy } from './AudioSpriteController';

// The desk backgrounds draw only behind the desktop workbench; ≤880px the site
// is the Field Index registry, which has no desk. Same breakpoint as App.tsx.
const NARROW_QUERY = '(max-width: 880px)';

// Detected after mount (App is prerendered), and the drawer is never open in
// the prerendered HTML, so the first paint of the drawer already knows.
const useNarrowSurface = () => {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  return narrow;
};

const times = (value: number) => `${value.toFixed(2)}×`;
const percent = (value: number) => `${Math.round(value)}%`;
const plain = (value: number) => String(Math.round(value));

const RangeField: React.FC<{ label: string; value: number; min: number; max: number; step: number; format: (value: number) => string; onChange: (value: number) => void }> = ({ label, value, min, max, step, format, onChange }) => {
  const id = useId();
  // The slider's aria-valuetext already speaks the formatted value, and an
  // <output> is a live region that would announce it twice (as in CameraLab).
  return (
    <div className="lab-range">
      <span><label htmlFor={id}>{label}</label><output htmlFor={id} aria-hidden="true">{format(value)}</output></span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={format(value)} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
};

const CheckField: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="lab-check">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span>{label}</span>
  </label>
);

const EffectToggle: React.FC<{ enabled: boolean; title: string; description: string; status?: string; disabled?: boolean; controls?: string; onClick: () => void }> = ({ enabled, title, description, status, disabled, controls, onClick }) => (
  <button type="button" className="lab-toggle" aria-pressed={enabled} aria-controls={enabled ? controls : undefined} disabled={disabled} onClick={onClick}>
    <span><strong>{title}</strong><small>{description}</small>{status && <small className="lab-status">{status}</small>}</span>
    <span aria-hidden="true" className="toggle-track"><span /></span>
  </button>
);

const NBODY_SCENES: { id: NBodyPreset; label: string; hint: string }[] = [
  { id: 'galaxy', label: 'Galaxy', hint: 'One rotating disc' },
  { id: 'binary', label: 'Binary', hint: 'Two clusters in orbit' },
  { id: 'field', label: 'Field', hint: 'A cold uniform cloud collapsing' },
];
const EXPANSION_ORDERS: NBodyExpansionOrder[] = [4, 6, 8, 10];
const LEAF_CAPACITIES: NBodyLeafCapacity[] = [24, 48, 72, 96];

const FLUID_PRESETS: { id: string; label: string; values: EffectPatch<'fluid'> }[] = [
  { id: 'calm', label: 'Calm', values: { speed: 0.7, intensity: 38, opacity: 28, curl: 18, splatRadius: 28 } },
  { id: 'balanced', label: 'Balanced', values: { speed: 1.15, intensity: 62, opacity: 48, curl: 34, splatRadius: 46 } },
  { id: 'vivid', label: 'Vivid', values: { speed: 1.9, intensity: 86, opacity: 72, curl: 68, splatRadius: 72 } },
];

const EffectsLabPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const suppressFocusRestore = useRef(false);
  const openedAt = useRef<number | null>(null);
  const { settings, enhancements, reducedMotion, toggleEffect, updateEffect, setMotionPaused, setSoundEnabled, pauseAll } = useEffects();
  const sound = useSoundPolicy();
  const narrow = useNarrowSurface();
  const { policy } = useExperienceMode();
  // Whether the Estate window holds the GPU (lib/gpuClaim.ts), read after mount.
  const [gpuClaimed, setGpuClaimed] = useState(false);
  useEffect(() => {
    const sync = () => setGpuClaimed(isGpuClaimed());
    sync();
    return onGpuClaimChange(sync);
  }, []);
  useFocusTrap(open, panelRef, '.effects-dock', suppressFocusRestore);

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
    if (!open) return undefined;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close('escape_key'); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);

  const toggle = (id: EffectId) => {
    toggleEffect(id);
    track('effect_control_changed', { effect: id, control: 'enabled', value: String(!settings[id].enabled) });
  };

  const toggleMotion = () => {
    if (enhancements.motionPaused) {
      setMotionPaused(false);
      track('effect_control_changed', { effect: 'all', control: 'motion', value: 'resumed' });
    } else {
      pauseAll();
    }
  };

  const toggleSound = () => {
    setSoundEnabled(!enhancements.soundEnabled);
    track('effect_control_changed', { effect: 'sound', control: 'enabled', value: String(!enhancements.soundEnabled) });
  };

  const setScene = (preset: NBodyPreset) => {
    updateEffect('nbody', { preset });
    track('effect_preset_applied', { effect: 'nbody', preset });
  };

  const applyFluidPreset = (preset: (typeof FLUID_PRESETS)[number]) => {
    updateEffect('fluid', preset.values);
    track('effect_preset_applied', { effect: 'fluid', preset: preset.id });
  };

  // Hands off to the workbench: close the drawer without returning focus to
  // the dock, open Systems Lab at the drop test, and put focus on that sheet.
  const openDropTest = () => {
    suppressFocusRestore.current = true;
    close('drop_test');
    dispatchWorkbenchOpen({ appId: 'systems-lab', targetId: 'drop-test' });
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-scroll="systems-lab"]')?.focus({ preventScroll: true });
    });
  };

  const dockTrigger = (
    <button type="button" className="effects-dock" onClick={() => openPanel('dock')} aria-label="FX, open optional effects lab">
      <span aria-hidden="true">FX</span><span>Lab mode</span>
    </button>
  );

  if (!open) return dockTrigger;

  const { nbody, fluid } = settings;
  // ?mode=scan, Data Saver and reduced motion never let a backdrop mount
  // (lib/desktopBackgroundPolicy), so say so on the toggle rather than show
  // live settings over a desk that stays plain. Not on the narrow surface,
  // whose note already says why the toggles are off there.
  const backdropHold = narrow ? null : describeBackdropHold(policy);
  // An enabled backdrop also yields while the Estate window holds the GPU.
  const holdStatus = (enabled: boolean) => (backdropHold ? `${enabled ? 'On' : 'Off'} · ${backdropHold}`
    : enabled && gpuClaimed && !narrow ? `On · ${BACKDROP_YIELD_HOLD}` : undefined);
  const motionNote = enhancements.motionPaused
    ? 'Paused. Window rigs, Systems Lab mechanisms and the desk backgrounds hold their current frame; the labs skip straight to their end state, and the Estate camera’s flights, lift fades and stair climbs cut to the end.'
    : reducedMotion
      ? 'Your device asks for reduced motion, so every loop on this site already holds still.'
      : 'Stops every animation loop on the site at once: window rigs, mechanisms, desk backgrounds and labs, and makes the Estate camera’s flights, lift fades and stair climbs cut to the end.';

  return (
    <>
      {dockTrigger}
      <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close('backdrop'); }}>
        <aside ref={panelRef} className="effects-lab" role="dialog" aria-modal="true" aria-labelledby="effects-title" tabIndex={-1}>
          <header className="panel-header">
            <div><h2 id="effects-title">Effects lab</h2><p className="panel-context">Optional interaction layer</p></div>
            <button type="button" onClick={() => close('close_button')}>Close</button>
          </header>
          <p className="panel-intro">Everything here is off until you turn it on. A reduced-motion setting on your device always wins.</p>

          <div className="lab-sections">
            <section aria-labelledby="fx-motion-title">
              <h3 id="fx-motion-title">Motion and sound</h3>
              <div className="lab-safety-row">
                <button type="button" aria-pressed={enhancements.motionPaused} aria-describedby="fx-motion-note" onClick={toggleMotion}>Pause all motion</button>
              </div>
              <p id="fx-motion-note" className="lab-note">{motionNote}</p>
              <EffectToggle
                enabled={enhancements.soundEnabled}
                title="Sound cues"
                description="Short nonverbal cues when a window opens, a schedule solves, a camera calibrates or the drop test is struck. No music, no voice."
                status={describeAudioPolicy(sound.reason)}
                onClick={toggleSound}
              />
            </section>

            <section aria-labelledby="fx-backdrops-title">
              <h3 id="fx-backdrops-title">Desk backgrounds</h3>
              <p className="lab-note">
                {narrow
                  ? 'These draw behind the desktop workbench, wider than 880px. This screen shows the registry instead, so they stay off here.'
                  : 'Drawn on the desk behind the windows. Both freeze while motion is paused.'}
              </p>

              <EffectToggle
                enabled={nbody.enabled}
                title="N-body field"
                description="Up to 4,096 bodies under mutual gravity, solved by a 2-D fast multipole method off the main thread."
                status={holdStatus(nbody.enabled)}
                disabled={narrow}
                controls={backdropHold ? undefined : 'fx-nbody-params'}
                onClick={() => toggle('nbody')}
              />
              {nbody.enabled && !narrow && !backdropHold && (
                <div className="lab-params" id="fx-nbody-params" role="group" aria-label="N-body field settings">
                  <div className="lab-segment" role="group" aria-label="Scene">
                    {NBODY_SCENES.map((scene) => (
                      <button key={scene.id} type="button" aria-pressed={nbody.preset === scene.id} title={scene.hint} onClick={() => setScene(scene.id)}>{scene.label}</button>
                    ))}
                  </div>
                  <RangeField label="Bodies" value={nbody.particleCount} min={256} max={4096} step={256} format={plain} onChange={(particleCount) => updateEffect('nbody', { particleCount })} />
                  <RangeField label="Gravity" value={nbody.gravity} min={0.2} max={2} step={0.05} format={times} onChange={(gravity) => updateEffect('nbody', { gravity })} />
                  <RangeField label="Time scale" value={nbody.timeScale} min={0.25} max={2} step={0.05} format={times} onChange={(timeScale) => updateEffect('nbody', { timeScale })} />
                  <RangeField label="Trail" value={nbody.trailPersistence} min={0} max={90} step={1} format={percent} onChange={(trailPersistence) => updateEffect('nbody', { trailPersistence })} />
                  <CheckField label="Pointer pulls bodies" checked={nbody.pointerAttraction} onChange={(pointerAttraction) => updateEffect('nbody', { pointerAttraction })} />
                  <CheckField label="Show the quadtree" checked={nbody.showTree} onChange={(showTree) => updateEffect('nbody', { showTree })} />
                  <div className="lab-solver">
                    <label className="lab-select"><span>Multipole order</span>
                      <select value={nbody.expansionOrder} onChange={(event) => updateEffect('nbody', { expansionOrder: Number(event.target.value) as NBodyExpansionOrder })}>
                        {EXPANSION_ORDERS.map((order) => <option key={order} value={order}>p = {order}</option>)}
                      </select>
                    </label>
                    <label className="lab-select"><span>Leaf capacity</span>
                      <select value={nbody.leafCapacity} onChange={(event) => updateEffect('nbody', { leafCapacity: Number(event.target.value) as NBodyLeafCapacity })}>
                        {LEAF_CAPACITIES.map((capacity) => <option key={capacity} value={capacity}>{capacity} bodies</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )}

              <EffectToggle
                enabled={fluid.enabled}
                title="Fluid smoke"
                description="A stable-fluids solver on WebGL: advection, vorticity confinement and a pressure projection every frame."
                status={holdStatus(fluid.enabled)}
                disabled={narrow}
                controls={backdropHold ? undefined : 'fx-fluid-params'}
                onClick={() => toggle('fluid')}
              />
              {fluid.enabled && !narrow && !backdropHold && (
                <div className="lab-params" id="fx-fluid-params" role="group" aria-label="Fluid smoke settings">
                  <div className="lab-segment" role="group" aria-label="Fluid presets">
                    {FLUID_PRESETS.map((preset) => (
                      <button key={preset.id} type="button" onClick={() => applyFluidPreset(preset)}>{preset.label}</button>
                    ))}
                  </div>
                  <RangeField label="Speed" value={fluid.speed} min={0.2} max={2.4} step={0.05} format={times} onChange={(speed) => updateEffect('fluid', { speed })} />
                  <RangeField label="Intensity" value={fluid.intensity} min={0} max={100} step={1} format={percent} onChange={(intensity) => updateEffect('fluid', { intensity })} />
                  <RangeField label="Opacity" value={fluid.opacity} min={0} max={80} step={1} format={percent} onChange={(opacity) => updateEffect('fluid', { opacity })} />
                  <RangeField label="Curl" value={fluid.curl} min={0} max={90} step={1} format={plain} onChange={(curl) => updateEffect('fluid', { curl })} />
                  <RangeField label="Splat radius" value={fluid.splatRadius} min={10} max={85} step={1} format={plain} onChange={(splatRadius) => updateEffect('fluid', { splatRadius })} />
                  <CheckField label="Pointer stirs the smoke" checked={fluid.pointerInteraction} onChange={(pointerInteraction) => updateEffect('fluid', { pointerInteraction })} />
                </div>
              )}
            </section>

            {!narrow && (
              <section className="lab-handoff" aria-label="Drop test">
                <p>Smash and gravity text physics now run inside one contained bench, not across the page.</p>
                <button type="button" className="btn btn-secondary" onClick={openDropTest}>
                  Drop test <span aria-hidden="true">→</span> Systems Lab
                </button>
              </section>
            )}
          </div>
        </aside>
      </div>
    </>
  );
};

export default EffectsLabPanel;
