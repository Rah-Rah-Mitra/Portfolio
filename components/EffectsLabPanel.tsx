import React, { useState } from 'react';
import { EffectId, TextEffectMode, useEffects, WorldQuality } from '../contexts/PhysicsContext';
import { useTheme } from '../contexts/ThemeContext';
import { GravityIcon } from './icons/GravityIcon';
import { HammerIcon } from './icons/HammerIcon';
import { RestoreIcon } from './icons/RestoreIcon';
import { track } from '../lib/analytics';

const formatPercent = (value: number) => `${Math.round(value)}%`;

const ToggleButton: React.FC<{
  enabled: boolean;
  label: string;
  onClick: () => void;
}> = ({ enabled, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={enabled}
    aria-label={label}
    className={`relative h-7 w-12 rounded-full border transition-colors ${
      enabled ? 'border-cyan-300 bg-cyan-400/80 dark:border-red-300 dark:bg-red-500/80' : 'border-white/15 bg-gray-700'
    }`}
  >
    <span
      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
        enabled ? 'translate-x-5' : 'translate-x-1'
      }`}
    />
  </button>
);

const RangeField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 1, suffix = '%', onChange }) => (
  <label className="block">
    <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-gray-400">
      <span>{label}</span>
      <span className="text-gray-300">{suffix === '%' ? formatPercent(value) : `${value.toFixed(1)}${suffix}`}</span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="effect-range w-full"
    />
  </label>
);

const EffectsLabPanel: React.FC = () => {
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const {
    settings,
    toggleEffect,
    setEffectParam,
    setPretextMode,
    setWorldQuality,
    openWorld,
    restoreAll,
  } = useEffects();
  const { theme } = useTheme();

  const handleToggle = (effect: EffectId) => {
    toggleEffect(effect);
    const next = !settings[effect].enabled;
    track('effect_control_changed', { effect, control: 'enabled', value: String(next) });
  };

  return (
    <aside className="effects-lab fixed bottom-5 right-5 z-[70] w-[min(380px,calc(100vw-1.5rem))] rounded-lg border border-cyan-400/30 bg-gray-950/92 p-4 text-white shadow-2xl shadow-cyan-950/40 backdrop-blur-xl dark:border-red-500/35 dark:shadow-red-950/40">
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300 dark:text-red-300">Effects Lab</p>
          <h2 className="text-lg font-bold">Interaction Panel</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-gray-300 transition-colors hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200"
            aria-expanded={!collapsed}
          >
            {collapsed ? 'Open' : 'Hide'}
          </button>
          <button
            type="button"
            onClick={restoreAll}
            className="rounded-md border border-white/10 p-2 text-gray-300 transition-colors hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200"
            aria-label="Restore text"
            title="Restore text"
          >
            <RestoreIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {!collapsed && <div className="space-y-3">
        <section className="effects-lab-card">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <HammerIcon className="mt-0.5 h-6 w-6 text-cyan-300" />
              <div>
                <h3 className="font-semibold text-white">Smash</h3>
                <p className="text-xs text-gray-400">Cursor impact distortion</p>
              </div>
            </div>
            <ToggleButton enabled={settings.smash.enabled} label="Toggle smash effect" onClick={() => handleToggle('smash')} />
          </div>
          <RangeField
            label="Intensity"
            value={settings.smash.intensity}
            min={0}
            max={100}
            onChange={(value) => {
              setEffectParam('smash', 'intensity', value);
              track('effect_control_changed', { effect: 'smash', control: 'intensity', value: String(value) });
            }}
          />
          <RangeField
            label="Radius"
            value={settings.smash.radius}
            min={20}
            max={70}
            onChange={(value) => setEffectParam('smash', 'radius', value)}
          />
        </section>

        <section className="effects-lab-card">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <GravityIcon className="mt-0.5 h-6 w-6 text-violet-300" />
              <div>
                <h3 className="font-semibold text-white">Gravity</h3>
                <p className="text-xs text-gray-400">Cursor gravity well</p>
              </div>
            </div>
            <ToggleButton enabled={settings.gravity.enabled} label="Toggle gravity effect" onClick={() => handleToggle('gravity')} />
          </div>
          <RangeField label="Strength" value={settings.gravity.strength} min={0} max={100} onChange={(value) => setEffectParam('gravity', 'strength', value)} />
          <RangeField label="Radius" value={settings.gravity.radius} min={20} max={75} onChange={(value) => setEffectParam('gravity', 'radius', value)} />
        </section>

        <section className="effects-lab-card">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">Fluid</h3>
              <p className="text-xs text-gray-400">Shader-style background motion</p>
            </div>
            <ToggleButton enabled={settings.fluid.enabled} label="Toggle fluid background" onClick={() => handleToggle('fluid')} />
          </div>
          <RangeField label="Speed" value={settings.fluid.speed} min={0.2} max={2.4} step={0.1} suffix="x" onChange={(value) => setEffectParam('fluid', 'speed', value)} />
          <RangeField label="Intensity" value={settings.fluid.intensity} min={0} max={100} onChange={(value) => setEffectParam('fluid', 'intensity', value)} />
        </section>

        <section className="effects-lab-card">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">Pretext</h3>
              <p className="text-xs text-gray-400">Line-aware text effects</p>
            </div>
            <ToggleButton enabled={settings.pretext.enabled} label="Toggle Pretext effects" onClick={() => handleToggle('pretext')} />
          </div>
          <label className="mb-3 block">
            <span className="mb-1.5 block text-xs font-medium text-gray-400">Mode</span>
            <select
              value={settings.pretext.mode}
              onChange={(event) => setPretextMode(event.target.value as TextEffectMode)}
              className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-cyan-300 dark:focus:border-red-300"
            >
              <option value="decode">Decode on hover</option>
              <option value="scan">Scanline</option>
              <option value="pulse">Signal pulse</option>
            </select>
          </label>
          <RangeField label="Strength" value={settings.pretext.intensity} min={0} max={100} onChange={(value) => setEffectParam('pretext', 'intensity', value)} />
        </section>

        <section className="effects-lab-card">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">3D World</h3>
              <p className="text-xs text-gray-400">Playable portfolio hub</p>
            </div>
            <ToggleButton enabled={settings.world.enabled} label="Toggle 3D world" onClick={() => handleToggle('world')} />
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <select
              value={settings.world.quality}
              onChange={(event) => setWorldQuality(event.target.value as WorldQuality)}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-cyan-300 dark:focus:border-red-300"
            >
              <option value="balanced">Balanced</option>
              <option value="high">High quality</option>
            </select>
            <button
              type="button"
              disabled={!settings.world.enabled}
              onClick={openWorld}
              className="rounded-md bg-cyan-400 px-3 py-2 text-sm font-bold text-black transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400 dark:bg-red-500 dark:text-white dark:hover:bg-red-400"
            >
              Enter world
            </button>
          </div>
          <p className="text-xs text-gray-500">Current profile: {theme === 'light' ? 'systems engineer' : 'cyber security'}</p>
        </section>
      </div>}
    </aside>
  );
};

export default EffectsLabPanel;
