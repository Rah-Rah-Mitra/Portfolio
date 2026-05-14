import React, { useEffect, useRef, useState } from 'react';
import { EffectId, FluidQuality, NumericEffectId, TextEffectMode, useEffects, WorldQuality } from '../contexts/PhysicsContext';
import { useTheme } from '../contexts/ThemeContext';
import { GravityIcon } from './icons/GravityIcon';
import { HammerIcon } from './icons/HammerIcon';
import { RestoreIcon } from './icons/RestoreIcon';
import { CodeBracketIcon, PaintBrushIcon, ServerStackIcon } from './icons/TechIcons';
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
    className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300 dark:focus:ring-red-300 ${
      enabled ? 'border-cyan-300 bg-cyan-400/80 dark:border-red-300 dark:bg-red-500/80' : 'border-white/15 bg-gray-700'
    }`}
  >
    <span
      className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
        enabled ? 'translate-x-5' : 'translate-x-0'
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
    <span className="mb-1.5 grid grid-cols-[1fr,4rem] items-center gap-3 text-xs font-medium text-gray-400">
      <span>{label}</span>
      <span className="text-right tabular-nums text-gray-300">{suffix === '%' ? formatPercent(value) : `${value.toFixed(1)}${suffix}`}</span>
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

const PresetButtons: React.FC<{
  effect: NumericEffectId;
  onPreset: (effect: NumericEffectId, preset: 'gentle' | 'balanced' | 'intense') => void;
}> = ({ effect, onPreset }) => (
  <div className="mb-3 grid grid-cols-3 gap-2">
    {(['gentle', 'balanced', 'intense'] as const).map((preset) => (
      <button
        key={`${effect}-${preset}`}
        type="button"
        onClick={() => onPreset(effect, preset)}
        className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs font-semibold capitalize text-gray-300 transition-colors hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200"
      >
        {preset}
      </button>
    ))}
  </div>
);

const CardHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  label: string;
  onToggle: () => void;
}> = ({ icon, title, description, enabled, label, onToggle }) => (
  <div className="mb-3 grid grid-cols-[1fr,3rem] items-start gap-3">
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-cyan-300 dark:text-red-300">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="font-semibold leading-tight text-white">{title}</h3>
        <p className="mt-0.5 text-xs leading-snug text-gray-400">{description}</p>
      </div>
    </div>
    <div className="flex justify-end">
      <ToggleButton enabled={enabled} label={label} onClick={onToggle} />
    </div>
  </div>
);

const effectPresets: Record<NumericEffectId, Record<'gentle' | 'balanced' | 'intense', Record<string, number>>> = {
  smash: {
    gentle: { intensity: 28, radius: 32 },
    balanced: { intensity: 60, radius: 42 },
    intense: { intensity: 88, radius: 68 },
  },
  gravity: {
    gentle: { strength: 22, radius: 36 },
    balanced: { strength: 45, radius: 48 },
    intense: { strength: 78, radius: 72 },
  },
  fluid: {
    gentle: { speed: 0.7, intensity: 38, opacity: 28, curl: 18, splatRadius: 28 },
    balanced: { speed: 1.15, intensity: 62, opacity: 48, curl: 34, splatRadius: 46 },
    intense: { speed: 1.9, intensity: 86, opacity: 72, curl: 68, splatRadius: 72 },
  },
  pretext: {
    gentle: { intensity: 24 },
    balanced: { intensity: 42 },
    intense: { intensity: 82 },
  },
};

const getInitialCollapsed = () => {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem('effects-lab-collapsed');
  if (stored) return stored === 'true';
  return true;
};

const EffectsLabPanel: React.FC = () => {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const openedAtRef = useRef<number | null>(collapsed ? null : performance.now());
  const {
    settings,
    toggleEffect,
    setEffectParam,
    setPretextMode,
    setWorldQuality,
    setFluidQuality,
    openWorld,
    restoreAll,
  } = useEffects();
  const { theme } = useTheme();

  useEffect(() => {
    window.localStorage.setItem('effects-lab-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePanel('escape_key');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openPanel = (source: string) => {
    openedAtRef.current = performance.now();
    setCollapsed(false);
    track('panel_opened', { panel: 'effects_lab', source });
  };

  const closePanel = (reason: string) => {
    const duration = openedAtRef.current ? Math.round(performance.now() - openedAtRef.current) : 0;
    openedAtRef.current = null;
    setCollapsed(true);
    track('panel_closed', { panel: 'effects_lab', reason, duration_ms: duration });
  };

  const handleToggle = (effect: EffectId) => {
    toggleEffect(effect);
    const next = !settings[effect].enabled;
    track('effect_control_changed', { effect, control: 'enabled', value: String(next) });
  };

  const applyPreset = (effect: NumericEffectId, preset: 'gentle' | 'balanced' | 'intense') => {
    Object.entries(effectPresets[effect][preset]).forEach(([param, value]) => {
      setEffectParam(effect, param, value);
    });
    track('effect_preset_applied', { effect, preset });
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => openPanel('dock')}
        data-analytics-id="effects-lab-open"
        className="effects-dock fixed bottom-5 right-5 z-[70] inline-flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-300/40 bg-gray-950/90 text-cyan-200 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl transition-transform hover:-translate-y-0.5 hover:border-cyan-200 dark:border-red-400/40 dark:text-red-200 dark:shadow-red-950/40"
        aria-label="Open Effects Lab"
        title="Open Effects Lab"
      >
        <span className="text-sm font-black tracking-widest">FX</span>
      </button>
    );
  }

  return (
    <aside className="effects-lab fixed bottom-5 right-5 z-[70] w-[min(400px,calc(100vw-1.5rem))] rounded-lg border border-cyan-400/30 bg-gray-950/92 p-4 text-white shadow-2xl shadow-cyan-950/40 backdrop-blur-xl dark:border-red-500/35 dark:shadow-red-950/40">
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300 dark:text-red-300">Effects Lab</p>
          <h2 className="text-lg font-bold">Interaction Panel</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => closePanel('hide_button')}
            data-analytics-id="effects-lab-close"
            className="rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-gray-300 transition-colors hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200"
            aria-expanded={!collapsed}
            aria-label="Hide Effects Lab"
          >
            Hide
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
          <CardHeader
            icon={<HammerIcon className="h-6 w-6" />}
            title="Smash"
            description="Cursor impact distortion"
            enabled={settings.smash.enabled}
            label="Toggle smash effect"
            onToggle={() => handleToggle('smash')}
          />
          <PresetButtons effect="smash" onPreset={applyPreset} />
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
          <CardHeader
            icon={<GravityIcon className="h-6 w-6" />}
            title="Gravity"
            description="Cursor gravity well"
            enabled={settings.gravity.enabled}
            label="Toggle gravity effect"
            onToggle={() => handleToggle('gravity')}
          />
          <PresetButtons effect="gravity" onPreset={applyPreset} />
          <RangeField label="Strength" value={settings.gravity.strength} min={0} max={100} onChange={(value) => setEffectParam('gravity', 'strength', value)} />
          <RangeField label="Radius" value={settings.gravity.radius} min={20} max={75} onChange={(value) => setEffectParam('gravity', 'radius', value)} />
        </section>

        <section className="effects-lab-card">
          <CardHeader
            icon={<PaintBrushIcon className="h-6 w-6" />}
            title="Fluid"
            description="Translucent cursor-driven CFD overlay"
            enabled={settings.fluid.enabled}
            label="Toggle fluid background"
            onToggle={() => handleToggle('fluid')}
          />
          <PresetButtons effect="fluid" onPreset={applyPreset} />
          <RangeField label="Speed" value={settings.fluid.speed} min={0.2} max={2.4} step={0.1} suffix="x" onChange={(value) => setEffectParam('fluid', 'speed', value)} />
          <RangeField label="Intensity" value={settings.fluid.intensity} min={0} max={100} onChange={(value) => setEffectParam('fluid', 'intensity', value)} />
          <RangeField label="Opacity" value={settings.fluid.opacity} min={0} max={80} onChange={(value) => setEffectParam('fluid', 'opacity', value)} />
          <RangeField label="Ripple curl" value={settings.fluid.curl} min={0} max={90} onChange={(value) => setEffectParam('fluid', 'curl', value)} />
          <RangeField label="Splat radius" value={settings.fluid.splatRadius} min={10} max={85} onChange={(value) => setEffectParam('fluid', 'splatRadius', value)} />
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-medium text-gray-400">Simulation quality</span>
            <select
              value={settings.fluid.quality}
              onChange={(event) => setFluidQuality(event.target.value as FluidQuality)}
              className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-cyan-300 dark:focus:border-red-300"
            >
              <option value="balanced">Balanced</option>
              <option value="high">High quality</option>
            </select>
          </label>
        </section>

        <section className="effects-lab-card">
          <CardHeader
            icon={<CodeBracketIcon className="h-6 w-6" />}
            title="Pretext"
            description="Line-aware text effects"
            enabled={settings.pretext.enabled}
            label="Toggle Pretext effects"
            onToggle={() => handleToggle('pretext')}
          />
          <PresetButtons effect="pretext" onPreset={applyPreset} />
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
          <CardHeader
            icon={<ServerStackIcon className="h-6 w-6" />}
            title="3D World"
            description="Playable portfolio hub"
            enabled={settings.world.enabled}
            label="Toggle 3D world"
            onToggle={() => handleToggle('world')}
          />
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
              onClick={() => openWorld('effects_lab')}
              data-analytics-id="effects-lab-enter-world"
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
