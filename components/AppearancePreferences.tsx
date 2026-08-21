import React, { useEffect, useRef, useState } from 'react';
import type { AccentId, AppearancePanelTab, AsciiAnimStyle, AsciiBgMode, AsciiCharSet, AsciiRenderMode, ColorSchemePreference, DockSize, NBodyExpansionOrder, NBodyLeafCapacity, WindowTint } from '../types';
import { useAppearance } from '../contexts/AppearanceContext';
import { asciiPostEffectIds, asciiRenderModes } from '../lib/appearance';

const asciiPostEffectLabels: Record<(typeof asciiPostEffectIds)[number], string> = {
  scanLines: 'Scan lines',
  vignette: 'Vignette',
  bloom: 'Bloom',
  chromatic: 'Chromatic',
  filmGrain: 'Film grain',
  glitch: 'Glitch',
  halftone: 'Halftone',
  pixelate: 'Pixelate',
  filmDust: 'Film dust',
};

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
  const [metrics, setMetrics] = useState<{ elapsed?: number; p95?: number; effectiveParticleCount?: number; metrics?: { treeDepth?: number; m2lInteractions?: number; directInteractions?: number } }>({});
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

  useEffect(() => {
    const update = (event: Event) => setMetrics((event as CustomEvent<typeof metrics>).detail);
    window.addEventListener('portfolio:nbody-metrics', update);
    return () => window.removeEventListener('portfolio:nbody-metrics', update);
  }, []);

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
            <RadioGroup legend="Desktop background" value={preferences.background} onChange={appearance.setBackgroundTheme} values={[{ id: 'nbody', label: 'N-body Field' }, { id: 'fluid', label: 'Fluid Field' }, { id: 'ascii', label: 'ASCII Gaze' }]} />
            {preferences.background === 'nbody' && <div className="nbody-preference-controls">
              <RadioGroup legend="Initial condition" value={preferences.nbody.preset} onChange={(preset) => appearance.patchNBody({ preset })} values={[{ id: 'galaxy', label: 'Galaxy' }, { id: 'binary', label: 'Binary' }, { id: 'field', label: 'Field' }]} />
              <label className="preference-slider"><span>Bodies <output>{preferences.nbody.particleCount}</output></span><input type="range" min="256" max="4096" step="256" value={preferences.nbody.particleCount} onChange={(event) => appearance.patchNBody({ particleCount: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Time scale <output>{preferences.nbody.timeScale.toFixed(2)}×</output></span><input type="range" min="0.25" max="2" step="0.05" value={preferences.nbody.timeScale} onChange={(event) => appearance.patchNBody({ timeScale: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Gravity <output>{preferences.nbody.gravity.toFixed(2)}×</output></span><input type="range" min="0.2" max="2" step="0.05" value={preferences.nbody.gravity} onChange={(event) => appearance.patchNBody({ gravity: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Softening <output>{preferences.nbody.softening.toFixed(3)}</output></span><input type="range" min="0.002" max="0.04" step="0.001" value={preferences.nbody.softening} onChange={(event) => appearance.patchNBody({ softening: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Trail persistence <output>{preferences.nbody.trailPersistence}%</output></span><input type="range" min="0" max="90" value={preferences.nbody.trailPersistence} onChange={(event) => appearance.patchNBody({ trailPersistence: Number(event.target.value) })} /></label>
              <div className="preference-select-grid">
                <label><span>Expansion order</span><select value={preferences.nbody.expansionOrder} onChange={(event) => appearance.patchNBody({ expansionOrder: Number(event.target.value) as NBodyExpansionOrder })}>{[4, 6, 8, 10].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label><span>Leaf capacity</span><select value={preferences.nbody.leafCapacity} onChange={(event) => appearance.patchNBody({ leafCapacity: Number(event.target.value) as NBodyLeafCapacity })}>{[24, 48, 72, 96].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label><span>Deterministic seed</span><input type="number" min="0" max="2147483647" value={preferences.nbody.seed} onChange={(event) => appearance.patchNBody({ seed: Math.max(0, Number(event.target.value)) })} /></label>
              </div>
              <label className="preference-check"><input type="checkbox" checked={preferences.nbody.pointerAttraction} onChange={(event) => appearance.patchNBody({ pointerAttraction: event.target.checked })} /><span>Pointer attraction</span></label>
              <label className="preference-check"><input type="checkbox" checked={preferences.nbody.showTree} onChange={(event) => appearance.patchNBody({ showTree: event.target.checked })} /><span>Quadtree overlay</span></label>
              <dl className="nbody-engineer-readout" aria-label="N-body engineer readout">
                <div><dt>Effective bodies</dt><dd>{metrics.effectiveParticleCount ?? 'Standby'}</dd></div>
                <div><dt>Tree depth</dt><dd>{metrics.metrics?.treeDepth ?? '—'}</dd></div>
                <div><dt>Expansion</dt><dd>P{preferences.nbody.expansionOrder}</dd></div>
                <div><dt>Step</dt><dd>{metrics.elapsed === undefined ? '—' : `${metrics.elapsed.toFixed(1)}ms`}</dd></div>
                <div><dt>p95</dt><dd>{metrics.p95 === undefined ? '—' : `${metrics.p95.toFixed(1)}ms`}</dd></div>
              </dl>
              <button type="button" className="preference-retry" onClick={() => window.dispatchEvent(new CustomEvent('portfolio:nbody-retry'))}>Retry requested particle tier</button>
            </div>}
            {preferences.background === 'fluid' && <div className="nbody-preference-controls">
              <div className="preferences-heading"><span>F</span><div><h3>Fluid field</h3><p>Pointer-driven WebGL dye and velocity, mutually exclusive with active 3D applications.</p></div></div>
              <label className="preference-slider"><span>Speed <output>{preferences.fluid.speed.toFixed(1)}×</output></span><input type="range" min="0.2" max="2.4" step="0.1" value={preferences.fluid.speed} onChange={(event) => appearance.patchFluid({ speed: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Intensity <output>{preferences.fluid.intensity}%</output></span><input type="range" min="0" max="100" value={preferences.fluid.intensity} onChange={(event) => appearance.patchFluid({ intensity: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Opacity <output>{preferences.fluid.opacity}%</output></span><input type="range" min="0" max="80" value={preferences.fluid.opacity} onChange={(event) => appearance.patchFluid({ opacity: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Splat radius <output>{preferences.fluid.splatRadius}%</output></span><input type="range" min="10" max="85" value={preferences.fluid.splatRadius} onChange={(event) => appearance.patchFluid({ splatRadius: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Curl <output>{preferences.fluid.curl}%</output></span><input type="range" min="0" max="90" value={preferences.fluid.curl} onChange={(event) => appearance.patchFluid({ curl: Number(event.target.value) })} /></label>
              <div className="preference-select-grid"><label><span>Quality</span><select value={preferences.fluid.quality} onChange={(event) => appearance.patchFluid({ quality: event.target.value as 'balanced' | 'high' })}><option value="balanced">Balanced</option><option value="high">High</option></select></label></div>
              <label className="preference-check"><input type="checkbox" checked={preferences.fluid.pointerInteraction} onChange={(event) => appearance.patchFluid({ pointerInteraction: event.target.checked })} /><span>Pointer interaction</span></label>
            </div>}
            {preferences.background === 'ascii' && <div className="nbody-preference-controls ascii-preference-controls">
              <div className="preferences-heading"><span>A</span><div><h3>ASCII Electric Gaze</h3><p>A Canvas2D grid re-rendering of the reference photograph. Every parameter below reshapes the live field.</p></div></div>
              <div className="preference-select-grid">
                <label><span>Render mode</span><select value={preferences.ascii.renderMode} onChange={(event) => appearance.patchAscii({ renderMode: event.target.value as AsciiRenderMode })}>{asciiRenderModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
                <label><span>Character set</span><select value={preferences.ascii.charSet} onChange={(event) => appearance.patchAscii({ charSet: event.target.value as AsciiCharSet })}><option value="standard">Standard</option><option value="blocks">Blocks</option><option value="minimal">Minimal</option><option value="digits">Digits</option><option value="custom">Custom</option></select></label>
                <label><span>Backdrop</span><select value={preferences.ascii.bgMode} onChange={(event) => appearance.patchAscii({ bgMode: event.target.value as AsciiBgMode })}><option value="none">None</option><option value="solid">Solid</option><option value="blur">Blurred photo</option><option value="photo">Photo</option></select></label>
              </div>
              {preferences.ascii.charSet === 'custom' && <label className="preference-text"><span>Custom characters</span><input type="text" maxLength={64} value={preferences.ascii.customChars} onChange={(event) => appearance.patchAscii({ customChars: event.target.value })} placeholder=".:-=+*#%@" /></label>}
              <label className="preference-slider"><span>Cell size <output>{preferences.ascii.cellSize}px</output></span><input type="range" min="4" max="32" value={preferences.ascii.cellSize} onChange={(event) => appearance.patchAscii({ cellSize: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Coverage <output>{preferences.ascii.coverage}%</output></span><input type="range" min="0" max="100" value={preferences.ascii.coverage} onChange={(event) => appearance.patchAscii({ coverage: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Density <output>{preferences.ascii.density}%</output></span><input type="range" min="0" max="100" value={preferences.ascii.density} onChange={(event) => appearance.patchAscii({ density: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Brightness <output>{preferences.ascii.brightness}</output></span><input type="range" min="-100" max="100" value={preferences.ascii.brightness} onChange={(event) => appearance.patchAscii({ brightness: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Contrast <output>{preferences.ascii.contrast}</output></span><input type="range" min="0" max="300" value={preferences.ascii.contrast} onChange={(event) => appearance.patchAscii({ contrast: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Saturation <output>{preferences.ascii.saturation}%</output></span><input type="range" min="0" max="200" value={preferences.ascii.saturation} onChange={(event) => appearance.patchAscii({ saturation: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Grayscale <output>{preferences.ascii.grayscale}%</output></span><input type="range" min="0" max="100" value={preferences.ascii.grayscale} onChange={(event) => appearance.patchAscii({ grayscale: Number(event.target.value) })} /></label>
              <label className="preference-slider"><span>Edge emphasis <output>{preferences.ascii.edgeEmphasis}%</output></span><input type="range" min="0" max="100" value={preferences.ascii.edgeEmphasis} onChange={(event) => appearance.patchAscii({ edgeEmphasis: Number(event.target.value) })} /></label>
              <div className="preference-select-grid">
                <label><span>Tint color</span><input type="color" value={preferences.ascii.tint} onChange={(event) => appearance.patchAscii({ tint: event.target.value })} aria-label="ASCII tint color" /></label>
                <label><span>Tint opacity</span><input type="number" min="0" max="100" value={preferences.ascii.tintOpacity} onChange={(event) => appearance.patchAscii({ tintOpacity: Math.min(100, Math.max(0, Number(event.target.value))) })} /></label>
              </div>
              <label className="preference-check"><input type="checkbox" checked={preferences.ascii.invert} onChange={(event) => appearance.patchAscii({ invert: event.target.checked })} /><span>Invert luminance</span></label>
              <label className="preference-check"><input type="checkbox" checked={preferences.ascii.animated} onChange={(event) => appearance.patchAscii({ animated: event.target.checked })} /><span>Animated</span></label>
              {preferences.ascii.animated && <>
                <RadioGroup<AsciiAnimStyle> legend="Animation style" value={preferences.ascii.animStyle} onChange={(animStyle) => appearance.patchAscii({ animStyle })} values={[{ id: 'wave', label: 'Wave' }, { id: 'pulse', label: 'Pulse' }, { id: 'shimmer', label: 'Shimmer' }, { id: 'ripple', label: 'Ripple' }, { id: 'flicker', label: 'Flicker' }]} />
                <label className="preference-slider"><span>Animation speed <output>{preferences.ascii.animSpeed}%</output></span><input type="range" min="0" max="100" value={preferences.ascii.animSpeed} onChange={(event) => appearance.patchAscii({ animSpeed: Number(event.target.value) })} /></label>
                <label className="preference-slider"><span>Animation intensity <output>{preferences.ascii.animIntensity}%</output></span><input type="range" min="0" max="100" value={preferences.ascii.animIntensity} onChange={(event) => appearance.patchAscii({ animIntensity: Number(event.target.value) })} /></label>
              </>}
              <fieldset className="preference-choice-group ascii-post-effects">
                <legend>Post effects</legend>
                {asciiPostEffectIds.map((effectId) => (
                  <div key={effectId} className="ascii-post-effect-row">
                    <label className="preference-check"><input type="checkbox" checked={preferences.ascii.pfx[effectId].enabled} onChange={(event) => appearance.patchAscii({ pfx: { [effectId]: { ...preferences.ascii.pfx[effectId], enabled: event.target.checked } } as never })} /><span>{asciiPostEffectLabels[effectId]}</span></label>
                    {preferences.ascii.pfx[effectId].enabled && <label className="preference-slider"><span className="sr-only">{asciiPostEffectLabels[effectId]} intensity</span><input type="range" min="0" max="100" value={preferences.ascii.pfx[effectId].intensity} onChange={(event) => appearance.patchAscii({ pfx: { [effectId]: { ...preferences.ascii.pfx[effectId], intensity: Number(event.target.value) } } as never })} /><output>{preferences.ascii.pfx[effectId].intensity}</output></label>}
                  </div>
                ))}
              </fieldset>
            </div>}
            <div className="preference-action-row">
              <button type="button" onClick={() => appearance.setBackgroundPaused(!preferences.backgroundPaused)}>{preferences.backgroundPaused ? 'Resume background' : 'Pause background'}</button>
              <button type="button" onClick={appearance.resetBackground}>Reset background</button>
            </div>
          </>}
          {preferencesTab === 'window' && <>
            <div className="preferences-heading"><span>03</span><div><h3>Windows and dock</h3><p>Opaque reading surfaces with controlled titlebar material.</p></div></div>
            <RadioGroup<WindowTint> legend="Window material" value={preferences.windowTint} onChange={(tint) => appearance.dispatch({ type: 'SET_WINDOW_TINT', tint })} values={[{ id: 'neutral', label: 'Neutral' }, { id: 'graphite', label: 'Graphite' }, { id: 'accent', label: 'Accent tinted' }]} />
            <label className="preference-check"><input type="checkbox" checked={preferences.windowGlow} onChange={(event) => appearance.setWindowGlow(event.target.checked)} /><span>Glow outline on windows and desktop frame</span></label>
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
