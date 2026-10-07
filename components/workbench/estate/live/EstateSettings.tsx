import React from 'react';
import {
  DETAIL_CHOICES, ESTATE_SETTINGS_DEFAULTS, FLY_SCALE_STOPS, FOV_RANGE, LOOK_SCALE_STOPS, WALK_SPEED_STOPS, horizontalFovDeg, stopIndex,
  type EstateDetail, type EstateSettingsPatch, type EstateViewerSettings,
} from '../../../../lib/estate/settings';

// The HUD's SETTINGS panel (EstateHud.tsx draws it under its toggle, next in
// tab order, as KEYS' list is): the viewer's settings, applied at once, saved
// in this browser by the shell (shellDom.ts). Stateless: the settings come from
// the engine's view, every change goes back through engine.setSettings from a
// handler, never during render.
//
// Native controls only (the first rule of ARIA): range inputs with a label, a
// visible value the screen reader skips (aria-hidden) and the same value with
// its units as aria-valuetext; on/off switches as pressed buttons with a label
// that never changes; the detail level as a row of pressed buttons (a native
// select's popup would take Esc from the window's layers). Every setting is a
// preference, settable in any mode; each says where it applies. Arrow keys on a
// slider never reach the camera: the engine takes keys only from the stage.

const DETAIL_LABEL: Readonly<Record<EstateDetail, string>> = {
  auto: 'Auto', high: 'High', mid: 'Medium', low: 'Low', min: 'Minimum',
};

/** 1, 1.25, 0.85: no trailing zeros. */
const plain = (value: number): string => String(Number(value.toFixed(2)));

interface SliderProps {
  id: string;
  label: string;
  /** Shown beside the label (aria-hidden). */
  shown: string;
  /** What a screen reader says for the value. */
  spoken: string;
  min: number;
  max: number;
  value: number;
  help?: string;
  disabled: boolean;
  onChange: (value: number) => void;
}

const Slider: React.FC<SliderProps> = ({ id, label, shown, spoken, min, max, value, help, disabled, onChange }) => (
  <div className="wb-estate-set-range">
    <span>
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id} aria-hidden="true">{shown}</output>
    </span>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      disabled={disabled}
      aria-valuetext={spoken}
      aria-describedby={help ? `${id}-help` : undefined}
      onChange={(event) => onChange(Number(event.target.value))}
    />
    {help && <small id={`${id}-help`}>{help}</small>}
  </div>
);

interface ToggleProps {
  id: string;
  label: string;
  on: boolean;
  help: string;
  disabled: boolean;
  onToggle: (on: boolean) => void;
}

const Toggle: React.FC<ToggleProps> = ({ id, label, on, help, disabled, onToggle }) => (
  <button
    type="button"
    className="wb-estate-set-toggle"
    // The name is the label alone (it never changes with the state); the help is its description.
    aria-label={label}
    aria-pressed={on}
    aria-describedby={`${id}-help`}
    disabled={disabled}
    onClick={() => onToggle(!on)}
  >
    <span>
      <strong>{label}</strong>
      <small id={`${id}-help`}>{help}</small>
    </span>
    <span className="toggle-track" aria-hidden="true"><span /></span>
  </button>
);

export interface EstateSettingsPanelProps {
  id: string;
  /** The engine's view.settings (absent before an engine reports them: the defaults). */
  settings: EstateViewerSettings | undefined;
  live: boolean;
  /** The stage's width over its height, for the horizontal field of view. */
  aspect: number;
  onChange: (patch: EstateSettingsPatch) => void;
  onRestore: () => void;
  onClose: () => void;
}

export function EstateSettingsPanel({ id, settings, live, aspect, onChange, onRestore, onClose }: EstateSettingsPanelProps): React.ReactElement {
  const s = settings ?? ESTATE_SETTINGS_DEFAULTS;
  const off = !live;
  const walk = s.walkSpeed;
  const fly = s.flyScale;
  const look = s.lookScale;
  const wide = Math.round(horizontalFovDeg(s.fovDeg, aspect > 0 ? aspect : 4 / 3));
  return (
    <div className="wb-estate-popover wb-estate-settings" id={id} role="region" aria-label="Viewer settings" data-estate-scroll data-estate-popover="settings">
      <div className="wb-estate-popover-head">
        <span>Settings</span>
        <button type="button" className="wb-estate-hud-btn" disabled={off} onClick={onClose}>Close</button>
      </div>

      <fieldset className="wb-estate-set-group">
        <legend>Movement</legend>
        <Slider
          id={`${id}-walk`}
          label="Walk speed"
          shown={`${plain(walk)} m/s`}
          spoken={`${plain(walk)} metres per second, ${plain(walk * 2.5)} with Shift`}
          min={0}
          max={WALK_SPEED_STOPS.length - 1}
          value={stopIndex(WALK_SPEED_STOPS, walk)}
          help="Shift runs at 2.5 times this"
          disabled={off}
          onChange={(i) => onChange({ walkSpeed: WALK_SPEED_STOPS[i] })}
        />
        <Slider
          id={`${id}-fly`}
          label="Fly speed"
          shown={`×${plain(fly)}`}
          spoken={`${plain(fly)} times the usual flying speed`}
          min={0}
          max={FLY_SCALE_STOPS.length - 1}
          value={stopIndex(FLY_SCALE_STOPS, fly)}
          help="The wheel still speeds up or slows down a flight"
          disabled={off}
          onChange={(i) => onChange({ flyScale: FLY_SCALE_STOPS[i] })}
        />
        <Slider
          id={`${id}-look`}
          label="Look sensitivity"
          shown={`×${plain(look)}`}
          spoken={`${plain(look)} times`}
          min={0}
          max={LOOK_SCALE_STOPS.length - 1}
          value={stopIndex(LOOK_SCALE_STOPS, look)}
          help="Dragging to look or orbit, and a captured mouse"
          disabled={off}
          onChange={(i) => onChange({ lookScale: LOOK_SCALE_STOPS[i] })}
        />
        <Toggle
          id={`${id}-invert`}
          label="Invert vertical look"
          on={s.invertLook}
          help="Walk and Fly: drag up to look down"
          disabled={off}
          onToggle={(on) => onChange({ invertLook: on })}
        />
      </fieldset>

      <fieldset className="wb-estate-set-group">
        <legend>View</legend>
        <Slider
          id={`${id}-fov`}
          label="Field of view"
          shown={`${s.fovDeg}° · ${wide}° wide`}
          spoken={`${s.fovDeg} degrees vertical, ${wide} degrees horizontal`}
          min={FOV_RANGE.min}
          max={FOV_RANGE.max}
          value={s.fovDeg}
          help="Walk and Fly. Wider shows more and bends the edges"
          disabled={off}
          onChange={(fovDeg) => onChange({ fovDeg })}
        />
        <Toggle
          id={`${id}-edges`}
          label="Edge lines"
          on={s.edges}
          help="Façade outlines and the storey lines on the massing"
          disabled={off}
          onToggle={(on) => onChange({ edges: on })}
        />
        <Toggle
          id={`${id}-toon`}
          label="Toon shading"
          on={s.toon}
          help="Three flat tones per colour, outlined at every detail level"
          disabled={off}
          onToggle={(on) => onChange({ toon: on })}
        />
      </fieldset>

      <fieldset className="wb-estate-set-group">
        <legend>Detail</legend>
        <div className="wb-domainseg wb-estate-set-detail">
          {DETAIL_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={off}
              aria-pressed={s.detail === choice}
              data-active={s.detail === choice ? '' : undefined}
              onClick={() => onChange({ detail: choice })}
            >{DETAIL_LABEL[choice]}</button>
          ))}
        </div>
        <small>Auto lowers detail and sharpness when frames drop. A fixed level stays put, however slow.</small>
      </fieldset>

      <fieldset className="wb-estate-set-group">
        <legend>Comfort</legend>
        <Toggle
          id={`${id}-motion`}
          label="Reduce camera motion"
          on={s.reduceMotion}
          help="Flights, entries, lift fades and stair climbs cut to their end; walking starts and stops at once"
          disabled={off}
          onToggle={(on) => onChange({ reduceMotion: on })}
        />
        <Toggle
          id={`${id}-stats`}
          label="Performance readout"
          on={s.stats}
          help="Frame time, draw calls, triangles and the detail level, top left"
          disabled={off}
          onToggle={(on) => onChange({ stats: on })}
        />
      </fieldset>

      <div className="wb-estate-set-foot">
        <button type="button" className="wb-estate-hud-btn" disabled={off} onClick={onRestore}>Restore defaults</button>
        <small>Saved in this browser.</small>
      </div>
    </div>
  );
}
