import React from 'react';
import { usePhysics, defaultAbilityParams, PhysicsAbility, AbilityParams } from '../contexts/PhysicsContext';
import { track } from '../lib/analytics';

interface ParameterSchema {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  description: string;
}

interface AbilitySchema {
  label: string;
  description: string;
  params: ParameterSchema[];
  presets?: Record<'Gentle' | 'Balanced' | 'Intense', Record<string, number>>;
}

const abilitySchemas: Record<PhysicsAbility, AbilitySchema> = {
  smash: {
    label: 'Smash',
    description: 'Burst nearby words outward on click.',
    params: [
      { key: 'radiusFactor', label: 'Impact Radius', min: 0.15, max: 0.75, step: 0.01, description: 'Area affected by each smash click.' },
      { key: 'forceMultiplier', label: 'Force', min: 0.01, max: 0.12, step: 0.005, description: 'Push strength applied to words.' },
    ],
    presets: {
      Gentle: { radiusFactor: 0.25, forceMultiplier: 0.025 },
      Balanced: { ...defaultAbilityParams.smash },
      Intense: { radiusFactor: 0.6, forceMultiplier: 0.09 },
    },
  },
  gravity_well: {
    label: 'Gravity Well',
    description: 'Hold click to pull words into a singularity.',
    params: [
      { key: 'radiusFactor', label: 'Well Radius', min: 0.2, max: 0.8, step: 0.01, description: 'Range where pull applies.' },
      { key: 'acceleration', label: 'Pull Strength', min: 0.005, max: 0.06, step: 0.001, description: 'Acceleration toward well center.' },
    ],
    presets: {
      Gentle: { radiusFactor: 0.3, acceleration: 0.01 },
      Balanced: { ...defaultAbilityParams.gravity_well },
      Intense: { radiusFactor: 0.65, acceleration: 0.045 },
    },
  },
  fluid: {
    label: 'Fluid',
    description: 'Hold click to create swirling flow around the cursor.',
    params: [
      { key: 'radiusFactor', label: 'Flow Radius', min: 0.2, max: 0.8, step: 0.01, description: 'Range where fluid flow applies.' },
      { key: 'flowStrength', label: 'Flow Strength', min: 0.005, max: 0.06, step: 0.001, description: 'Strength of inward + swirl flow.' },
      { key: 'damping', label: 'Damping', min: 0.005, max: 0.08, step: 0.001, description: 'How quickly velocity is softened.' },
    ],
    presets: {
      Gentle: { radiusFactor: 0.3, flowStrength: 0.01, damping: 0.012 },
      Balanced: { ...defaultAbilityParams.fluid },
      Intense: { radiusFactor: 0.65, flowStrength: 0.04, damping: 0.045 },
    },
  },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const PhysicsControls: React.FC = () => {
  const {
    isInteractionActive,
    toggleInteraction,
    restoreAll,
    activeAbility,
    setActiveAbility,
    abilityParams,
    setAbilityParam,
  } = usePhysics();

  const schema = abilitySchemas[activeAbility];

  const updateParam = (key: string, nextValue: number) => {
    const param = schema.params.find((item) => item.key === key);
    if (!param || Number.isNaN(nextValue)) {
      return;
    }

    const value = clamp(nextValue, param.min, param.max);
    setAbilityParam(activeAbility, key as keyof AbilityParams[typeof activeAbility], value as never);
    track('ability_param_changed', {
      ability: activeAbility,
      param: key,
      value,
    });
  };

  const applyPreset = (presetName: 'Gentle' | 'Balanced' | 'Intense') => {
    const preset = schema.presets?.[presetName];
    if (!preset) {
      return;
    }

    Object.entries(preset).forEach(([key, value]) => {
      setAbilityParam(activeAbility, key as keyof AbilityParams[typeof activeAbility], value as never);
    });

    track('ability_preset_applied', {
      ability: activeAbility,
      preset: presetName.toLowerCase() as 'gentle' | 'balanced' | 'intense',
    });
  };

  return (
    <aside
      className="fixed bottom-5 right-5 z-50 w-[22rem] max-w-[calc(100vw-2.5rem)] rounded-xl border border-white/10 bg-gray-900/95 p-4 text-white shadow-xl backdrop-blur"
      aria-label="Physics controls"
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-200">Physics Controls</h2>

      <div className="mb-4" role="tablist" aria-label="Ability selector">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(abilitySchemas) as PhysicsAbility[]).map((ability) => {
            const isSelected = activeAbility === ability;
            return (
              <button
                key={ability}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`ability-panel-${ability}`}
                id={`ability-tab-${ability}`}
                onClick={() => {
                  setActiveAbility(ability);
                  track('ability_changed', { ability });
                }}
                className={`rounded-md px-2 py-2 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                  isSelected ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                {abilitySchemas[ability].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={toggleInteraction}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-400 ${
            isInteractionActive ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          aria-pressed={isInteractionActive}
        >
          {isInteractionActive ? `Disable ${schema.label}` : `Enable ${schema.label}`}
        </button>
        <button
          type="button"
          onClick={restoreAll}
          className="rounded-md bg-gray-700 px-3 py-2 text-sm font-medium hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
          aria-label="Restore text to original positions"
        >
          Restore text
        </button>
      </div>

      <section
        id={`ability-panel-${activeAbility}`}
        role="tabpanel"
        aria-labelledby={`ability-tab-${activeAbility}`}
        className="space-y-3"
      >
        <p className="text-xs text-gray-300">{schema.description}</p>

        {schema.presets && (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-200">Presets</p>
            <div className="flex gap-2">
              {(Object.keys(schema.presets) as Array<'Gentle' | 'Balanced' | 'Intense'>).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-md border border-gray-600 px-2 py-1 text-xs hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {schema.params.map((param) => {
            const value = abilityParams[activeAbility][param.key as keyof AbilityParams[typeof activeAbility]] as number;
            const valueDisplay = value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
            const describedById = `${activeAbility}-${param.key}-description`;
            return (
              <fieldset key={param.key} className="rounded-md border border-white/10 p-2">
                <legend className="px-1 text-xs font-medium text-gray-100">{param.label}</legend>
                <p id={describedById} className="mb-2 text-[11px] text-gray-400">
                  {param.description}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    value={value}
                    onChange={(e) => updateParam(param.key, Number(e.target.value))}
                    className="w-full"
                    aria-label={`${schema.label} ${param.label}`}
                    aria-describedby={describedById}
                    aria-valuemin={param.min}
                    aria-valuemax={param.max}
                    aria-valuenow={value}
                    aria-valuetext={`${valueDisplay}`}
                  />
                  <label className="sr-only" htmlFor={`${activeAbility}-${param.key}-number`}>
                    {param.label} numeric value
                  </label>
                  <input
                    id={`${activeAbility}-${param.key}-number`}
                    type="number"
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    value={valueDisplay}
                    onChange={(e) => updateParam(param.key, Number(e.target.value))}
                    className="w-20 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs"
                    aria-describedby={describedById}
                  />
                </div>
              </fieldset>
            );
          })}
        </div>
      </section>
    </aside>
  );
};

export default PhysicsControls;
