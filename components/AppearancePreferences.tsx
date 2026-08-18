import React, { useEffect, useRef } from 'react';
import type { AccentId, AppearancePanelTab, ColorSchemePreference, DockSize, WindowTint } from '../types';
import { useAppearance } from '../contexts/AppearanceContext';

const tabs: ReadonlyArray<{ id: AppearancePanelTab; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'window', label: 'Window' },
  { id: 'accessibility', label: 'Accessibility' },
];

const RadioGroup = <T extends string>({ legend, value, values, onChange }: {
  legend: string;
  value: T;
  values: ReadonlyArray<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) => (
  <fieldset className="preference-choice-group">
    <legend>{legend}</legend>
    {values.map((option) => (
      <label key={option.id}>
        <input type="radio" name={legend} checked={value === option.id} onChange={() => onChange(option.id)} />
        <span>{option.label}</span>
      </label>
    ))}
  </fieldset>
);

const AppearancePreferences: React.FC = () => {
  const appearance = useAppearance();
  const closeRef = useRef<HTMLButtonElement>(null);
  const { preferences, preferencesOpen, preferencesTab } = appearance;

  useEffect(() => {
    if (preferencesOpen) closeRef.current?.focus();
  }, [preferencesOpen]);

  useEffect(() => {
    if (!preferencesOpen) return undefined;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') appearance.closePreferences();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [appearance, preferencesOpen]);

  if (!preferencesOpen) return null;
  return (
    <section className="appearance-preferences" role="dialog" aria-modal="false" aria-labelledby="appearance-preferences-title">
      <header className="appearance-preferences-titlebar">
        <div className="traffic-lights" aria-hidden="true"><i className="traffic-close" /><i className="traffic-minimize" /><i className="traffic-maximize" /></div>
        <div><span>OPTICAL DESKTOP</span><h2 id="appearance-preferences-title">Desktop Preferences</h2></div>
        <button ref={closeRef} type="button" onClick={appearance.closePreferences} aria-label="Close Preferences">Close</button>
      </header>
      <div className="appearance-preferences-layout">
        <div className="preferences-tabs" role="tablist" aria-label="Preference categories">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={preferencesTab === tab.id} aria-controls={`preferences-panel-${tab.id}`} onClick={() => appearance.setPreferencesTab(tab.id)}>{tab.label}</button>
          ))}
        </div>
        <div id={`preferences-panel-${preferencesTab}`} className="preferences-panel" role="tabpanel" tabIndex={0}>
          {preferencesTab === 'appearance' && <>
            <div className="preferences-heading"><span>01</span><div><h3>Color and signal</h3><p>Choose the reading surface and one restrained system accent.</p></div></div>
            <RadioGroup<ColorSchemePreference> legend="Color scheme" value={preferences.scheme} onChange={appearance.setScheme} values={[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }, { id: 'system', label: 'System' }]} />
            <RadioGroup<AccentId> legend="Accent color" value={preferences.accent} onChange={appearance.setAccent} values={[{ id: 'teal', label: 'Teal' }, { id: 'sky', label: 'Sky' }, { id: 'amber', label: 'Amber' }, { id: 'violet', label: 'Violet' }, { id: 'rose', label: 'Rose' }]} />
          </>}
          {preferencesTab === 'desktop' && <>
            <div className="preferences-heading"><span>02</span><div><h3>Desktop field</h3><p>Only the selected field loads. The document remains readable above it.</p></div></div>
            <RadioGroup legend="Desktop background" value={preferences.background} onChange={appearance.setBackgroundTheme} values={[{ id: 'nbody', label: 'N-body Field' }, { id: 'fluid', label: 'Fluid Field' }]} />
            <div className="preference-action-row">
              <button type="button" onClick={() => appearance.setBackgroundPaused(!preferences.backgroundPaused)}>{preferences.backgroundPaused ? 'Resume background' : 'Pause background'}</button>
              <button type="button" onClick={appearance.resetBackground}>Reset background</button>
            </div>
          </>}
          {preferencesTab === 'window' && <>
            <div className="preferences-heading"><span>03</span><div><h3>Windows and dock</h3><p>Opaque reading surfaces with controlled titlebar material.</p></div></div>
            <RadioGroup<WindowTint> legend="Window material" value={preferences.windowTint} onChange={(tint) => appearance.dispatch({ type: 'SET_WINDOW_TINT', tint })} values={[{ id: 'neutral', label: 'Neutral' }, { id: 'graphite', label: 'Graphite' }, { id: 'accent', label: 'Accent tinted' }]} />
            <label className="preference-slider"><span>Titlebar opacity <output>{preferences.titlebarOpacity}%</output></span><input type="range" min="85" max="100" value={preferences.titlebarOpacity} onChange={(event) => appearance.dispatch({ type: 'SET_TITLEBAR_OPACITY', opacity: Number(event.target.value) })} /></label>
            <RadioGroup<DockSize> legend="Dock size" value={preferences.dockSize} onChange={(size) => appearance.dispatch({ type: 'SET_DOCK_SIZE', size })} values={[{ id: 'small', label: 'Small dock' }, { id: 'medium', label: 'Medium dock' }, { id: 'large', label: 'Large dock' }]} />
          </>}
          {preferencesTab === 'accessibility' && <>
            <div className="preferences-heading"><span>04</span><div><h3>Comfort and fallbacks</h3><p>Transparency can be removed without changing the evidence hierarchy.</p></div></div>
            <label className="preference-check"><input type="checkbox" checked={preferences.reduceTransparency} onChange={(event) => appearance.dispatch({ type: 'SET_REDUCE_TRANSPARENCY', reduce: event.target.checked })} /><span>Reduce transparency</span></label>
            <button type="button" className="preference-reset-all" onClick={appearance.resetAllPreferences}>Reset all preferences</button>
          </>}
        </div>
      </div>
      <footer><span>⌘, / Ctrl+, opens Preferences</span><span>Changes save on this device</span></footer>
    </section>
  );
};

export default AppearancePreferences;
