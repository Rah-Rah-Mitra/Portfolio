import React from 'react';
import { Corners, Hoist, Kicker } from './bits';
import { dispatchPortfolioWorldEvent } from '../../lib/worldEvents';
import {
  CAMERA_MODES,
  DEFAULT_SCENE,
  F_STOPS,
  NAMED_CORNERS,
  SCENE_RANGES,
  SENSOR,
  clampScene,
  fmt,
  intrinsicsOf,
  isCameraMode,
  stereoRig,
  summarizeScene,
  toSnapshot,
  type CameraMode,
  type CameraScene,
  type Intrinsics,
  type SceneSummary,
  type Vec2,
} from '../../lib/cameraModel';
import {
  CHART,
  IMAGE_VIEW,
  PLAN,
  answerFor,
  chartFigure,
  figureLabels,
  imageFigure,
  metricsFor,
  orbitFromPlanPoint,
  pathOf,
  planFigure,
} from '../../lib/cameraFigure';
import {
  CALIBRATION_SEED,
  CAL_VIEWS,
  DEFAULT_NOISE_PX,
  NOISE_RANGE,
  synthesizeViews,
  type SyntheticView,
} from '../../lib/cameraCalibrationViews';
// The Zhang solver is imported on the first Calibrate (runCalibration), not here.
import type { CalibrationResult } from '../../lib/cameraCalibration';

// The Camera window: one synthetic scene, four linked models, and a real Zhang
// calibration of the camera the visitor configures. Every number is derived from
// lib/cameraModel.ts; this file only places what lib/cameraFigure.ts computes.
//
// Host rules (same as MechanismBench):
//  - the render pass touches neither window nor document — App is prerendered,
//    and the prerender is the complete default Intrinsics view;
//  - the plan's drag binds NATIVE listeners found by a DOM scan in a no-deps
//    effect: a re-render can replace the node, and the workbench's own
//    native pointerdown on [data-hoist] fires before React's delegated handlers,
//    so only a listener on the svg itself can stopPropagation the hoist nudge;
//  - exactly two Hoists, always rendered: FieldWorkbench caches [data-hoist] when
//    the window opens, so a conditional one would never swing;
//  - no rAF, no loop, no transition: the lab redraws only on input, so there is
//    nothing for lib/motion to halt. Anything animated added later must use it.

type CalState = {
  status: 'idle' | 'solving' | 'done';
  result?: CalibrationResult;
  key?: string;
  truth?: Intrinsics;
};

type BindingSlot = 'plan' | 'still';
type Binding = { node: Element | null; detach: () => void };

const MODE_EVENT = 'portfolio:camera-lab-mode';
const COMMIT_DEBOUNCE_MS = 400;

// The calibration depends on the intrinsics and the noise only — the pose sliders
// do not move the six calibration views.
const calKeyOf = (s: CameraScene, noisePx: number) =>
  JSON.stringify([s.focalMm, s.cxOffsetPx, s.cyOffsetPx, s.k1, s.k2, s.p1, s.p2, noisePx]);

const sameScene = (a: CameraScene, b: CameraScene) =>
  (Object.keys(a) as Array<keyof CameraScene>).every((key) => a[key] === b[key]);

// Zero-length subpaths with round caps: one <path> draws a whole point cloud.
const dotPath = (pts: Vec2[]) => pts.map((p) => `M${Math.round(p[0] * 10) / 10} ${Math.round(p[1] * 10) / 10}h0`).join('');

const signed = (n: number, digits: number) => (n > 0 && fmt(n, digits) !== fmt(0, digits) ? `+${fmt(n, digits)}` : fmt(n, digits));
const radialWord = (k: number) => (k < 0 ? 'barrel' : k > 0 ? 'pincushion' : 'none');

// ── controls ─────────────────────────────────────────────────────────────

type SliderProps = {
  id: string;
  name: string;
  symbol: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  valueText?: (v: number) => string;
  onChange: (v: number) => void;
};

// The output is aria-hidden: aria-valuetext already speaks the value with its
// unit, and an <output> is a live region that would announce it twice. The
// label points at the input explicitly, because an <output> is labelable too.
const Slider: React.FC<SliderProps> = ({ id, name, symbol, value, min, max, step, format, valueText, onChange }) => (
  <label className="wb-cam-ctl" htmlFor={id}>
    <span className="wb-cam-ctl-head">
      <span>
        {name} <var>{symbol}</var>
      </span>
      <output htmlFor={id} aria-hidden="true">{format(value)}</output>
    </span>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-valuetext={(valueText ?? format)(value)}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
    />
  </label>
);

type SceneSliderSpec = {
  key: keyof CameraScene;
  name: string;
  symbol: React.ReactNode;
  format: (v: number) => string;
  valueText?: (v: number) => string;
};

const SLIDERS = {
  focalMm: { key: 'focalMm', name: 'FOCAL', symbol: 'f', format: (v) => `${v} mm`, valueText: (v) => `${v} millimetres` },
  cxOffsetPx: { key: 'cxOffsetPx', name: 'PRINCIPAL', symbol: <>Δc<sub>x</sub></>, format: (v) => `${signed(v, 0)} px` },
  cyOffsetPx: { key: 'cyOffsetPx', name: 'PRINCIPAL', symbol: <>Δc<sub>y</sub></>, format: (v) => `${signed(v, 0)} px` },
  k1: { key: 'k1', name: 'RADIAL', symbol: <>k<sub>1</sub></>, format: (v) => `${fmt(v, 2)} ${radialWord(v)}` },
  k2: { key: 'k2', name: 'RADIAL', symbol: <>k<sub>2</sub></>, format: (v) => fmt(v, 2) },
  p1: { key: 'p1', name: 'TANGENTIAL', symbol: <>p<sub>1</sub></>, format: (v) => fmt(v, 4) },
  p2: { key: 'p2', name: 'TANGENTIAL', symbol: <>p<sub>2</sub></>, format: (v) => fmt(v, 4) },
  distanceM: { key: 'distanceM', name: 'DISTANCE', symbol: 'ρ', format: (v) => `${fmt(v, 2)} m`, valueText: (v) => `${fmt(v, 2)} metres` },
  yawDeg: { key: 'yawDeg', name: 'YAW', symbol: 'ψ', format: (v) => `${signed(v, 0)}°`, valueText: (v) => `${fmt(v, 0)} degrees` },
  pitchDeg: { key: 'pitchDeg', name: 'PITCH', symbol: 'θ', format: (v) => `${signed(v, 0)}°`, valueText: (v) => `${fmt(v, 0)} degrees` },
  rollDeg: { key: 'rollDeg', name: 'ROLL', symbol: 'φ', format: (v) => `${signed(v, 0)}°`, valueText: (v) => `${fmt(v, 0)} degrees` },
  focusM: { key: 'focusM', name: 'FOCUS', symbol: 's', format: (v) => `${fmt(v, 2)} m`, valueText: (v) => `${fmt(v, 2)} metres` },
  disparitySigmaPx: { key: 'disparitySigmaPx', name: 'MATCHING', symbol: 'δd', format: (v) => `±${fmt(v, 2)} px` },
} satisfies Record<string, SceneSliderSpec>;

const APERTURE: SceneSliderSpec = { key: 'fNumber', name: 'APERTURE', symbol: 'N', format: (v) => `f/${v}` };
const BASELINE: SceneSliderSpec = {
  key: 'baselineM',
  name: 'BASELINE',
  symbol: 'B',
  format: (v) => `${fmt(v * 1000, 0)} mm`,
  valueText: (v) => `${fmt(v * 1000, 0)} millimetres`,
};

const MODE_CONTROLS: Record<CameraMode, Array<keyof typeof SLIDERS | 'aperture' | 'baseline' | 'focus-target'>> = {
  intrinsics: ['focalMm', 'cxOffsetPx', 'cyOffsetPx', 'k1', 'k2', 'p1', 'p2'],
  extrinsics: ['distanceM', 'yawDeg', 'pitchDeg', 'rollDeg'],
  optics: ['focalMm', 'aperture', 'focusM', 'focus-target'],
  stereo: ['baseline', 'disparitySigmaPx'],
};

const Controls: React.FC<{ scene: CameraScene; mode: CameraMode; commit: (patch: Partial<CameraScene>) => void }> = ({ scene, mode, commit }) => {
  const sceneSlider = (id: string, spec: SceneSliderSpec) => {
    const range = SCENE_RANGES[spec.key];
    return (
      <Slider
        key={id}
        id={`cam-ctl-${id}`}
        name={spec.name}
        symbol={spec.symbol}
        value={scene[spec.key]}
        min={range.min}
        max={range.max}
        step={range.step}
        format={spec.format}
        valueText={spec.valueText}
        onChange={(v) => commit({ [spec.key]: v })}
      />
    );
  };
  return (
    <div className="wb-cam-controls">
      {MODE_CONTROLS[mode].map((name) => {
        if (name === 'baseline') return sceneSlider('baselineM', BASELINE);
        if (name === 'focus-target') {
          return (
            <button key={name} type="button" className="btn btn-ghost wb-cam-focusbtn" onClick={() => commit({ focusM: scene.distanceM })}>
              Focus on target
            </button>
          );
        }
        if (name === 'aperture') {
          // A stop index, not a continuous f-number: the lens has eight detents.
          return (
            <Slider
              key={name}
              id="cam-ctl-fNumber"
              name={APERTURE.name}
              symbol={APERTURE.symbol}
              value={Math.max(0, F_STOPS.findIndex((n) => n === scene.fNumber))}
              min={0}
              max={F_STOPS.length - 1}
              step={1}
              format={(i) => APERTURE.format(F_STOPS[i])}
              onChange={(i) => commit({ fNumber: F_STOPS[i] })}
            />
          );
        }
        return sceneSlider(name, SLIDERS[name]);
      })}
    </div>
  );
};

const ModeTabs: React.FC<{ mode: CameraMode; onSelect: (mode: CameraMode) => void }> = ({ mode, onSelect }) => {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const at = CAMERA_MODES.findIndex((m) => m.id === mode);
    const n = CAMERA_MODES.length;
    const next =
      event.key === 'ArrowRight' ? (at + 1) % n
        : event.key === 'ArrowLeft' ? (at - 1 + n) % n
          : event.key === 'Home' ? 0
            : event.key === 'End' ? n - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    const id = CAMERA_MODES[next].id;
    onSelect(id); // selection follows focus
    event.currentTarget.querySelector<HTMLButtonElement>(`#cam-tab-${id}`)?.focus();
  };
  return (
    <div className="wb-domainseg wb-cam-tabs" role="tablist" aria-label="Camera model" onKeyDown={onKeyDown}>
      {CAMERA_MODES.map((m, index) => {
        const selected = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            id={`cam-tab-${m.id}`}
            aria-controls="cam-panel"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            data-active={selected || undefined}
            onClick={() => onSelect(m.id)}
          >
            <span className="wb-cam-tabno" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            {m.label}
          </button>
        );
      })}
    </div>
  );
};

// ── FIG. 06: plan, image, chart ──────────────────────────────────────────

const CameraGlyph: React.FC<{ at: Vec2; heading: number; ghost?: boolean }> = ({ at, heading, ghost }) => {
  const line = ghost ? 'ghost dash body' : 'ink body';
  return (
    <g transform={`translate(${at[0]} ${at[1]}) rotate(${heading})`}>
      <rect x={-6} y={1.5} width={12} height={8} className={line} />
      <rect x={-3} y={-2} width={6} height={3.5} className={line} />
      <circle r={1.4} className={ghost ? 'fill-ghost' : 'fill-ink'} />
    </g>
  );
};

const PlanView: React.FC<{ sum: SceneSummary; mode: CameraMode; label: string }> = ({ sum, mode, label }) => {
  const fig = React.useMemo(() => planFigure(sum, mode), [sum, mode]);
  const o = fig.overlay;
  const [b0, b1] = fig.board;
  const s = sum.scene;
  return (
    <svg
      data-cam-plan=""
      viewBox={`0 0 ${PLAN.w} ${PLAN.h}`}
      className="wb-cam-svg wb-cam-plan"
      role="img"
      aria-label={label}
    >
      <defs>
        <pattern id="wb-cam-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M2.5 0V5" className="hatch-line" />
        </pattern>
      </defs>
      <path d={fig.grid} className="faint" />
      <path d={fig.axes} className="ghost" />
      <text x={PLAN.w - 6} y={PLAN.oy - 4} textAnchor="end">X</text>
      <text x={PLAN.ox + 4} y={12}>Z</text>
      <text x={8} y={14}>PLAN · TOP VIEW</text>
      <path d="M12 288H67M12 284.5V291.5M67 284.5V291.5" className="ink" />
      <text x={12} y={281}>0.5 m</text>
      {o.mode === 'optics' && <path d={o.band} className="hatch" fill="url(#wb-cam-hatch)" />}
      <path d={fig.frustum} className="acc" strokeWidth={mode === 'intrinsics' ? 1.4 : 1} />
      <path d={fig.axis} className="ghost dash" />
      <path d={`M${b0[0]} ${b0[1]}H${b1[0]}`} className="ink" strokeWidth={2.4} />
      <path d={fig.boardTicks} className="ink" />
      <path d={`M${PLAN.ox - 5} ${PLAN.oy}H${PLAN.ox + 5}M${PLAN.ox} ${PLAN.oy - 5}V${PLAN.oy + 5}`} className="acc7" />
      {o.mode === 'intrinsics' && (
        <text x={o.hfovLabelAt[0]} y={o.hfovLabelAt[1]} textAnchor={o.anchor}>{`HFOV ${fmt(sum.fov.h, 1)}°`}</text>
      )}
      {o.mode === 'extrinsics' && (
        <>
          <path d={o.worldAxes} className="ink" />
          <path d={o.camAxes} className="acc7" />
          <path d={o.yawArc} className="acc7" />
          <text x={o.yawLabelAt[0]} y={o.yawLabelAt[1]} className="t-acc7" textAnchor={s.yawDeg >= 0 ? 'start' : 'end'}>
            {`ψ ${fmt(s.yawDeg, 0)}°`}
          </text>
          {o.labels.map((l) => (
            <text key={l.text} x={l.at[0]} y={l.at[1] + 3} textAnchor="middle">{l.text}</text>
          ))}
        </>
      )}
      {o.mode === 'optics' && (
        <>
          <path d={o.near} className="acc dash" />
          {o.far && <path d={o.far} className="acc dash" />}
          <path d={o.focus} className="acc7" strokeWidth={1.4} />
          <text x={o.labelAt[0]} y={o.labelAt[1]} className="t-acc7">{`s ${fmt(s.focusM, 2)} m`}</text>
        </>
      )}
      {o.mode === 'stereo' && (
        <>
          <path d={o.rightFrustum} className="ghost dash" />
          <path d={o.rays} className="acc7" />
          <path d={o.baseline} className="ink" strokeWidth={1.4} />
          <text x={o.baselineLabelAt[0]} y={o.baselineLabelAt[1] + 3} textAnchor="middle">{`B ${fmt(s.baselineM * 1000, 0)} mm`}</text>
          <CameraGlyph at={o.right.at} heading={o.right.headingDeg} ghost />
        </>
      )}
      <CameraGlyph at={fig.camera.at} heading={fig.camera.headingDeg} />
    </svg>
  );
};

const ImageView: React.FC<{ sum: SceneSummary; mode: CameraMode; label: string }> = ({ sum, mode, label }) => {
  const fig = React.useMemo(() => imageFigure(sum, mode), [sum, mode]);
  const { frameW, frameH } = IMAGE_VIEW;
  const [px, py] = fig.principal;
  return (
    <svg
      viewBox={`${IMAGE_VIEW.x} ${IMAGE_VIEW.y} ${IMAGE_VIEW.w} ${IMAGE_VIEW.h}`}
      className="wb-cam-svg wb-cam-image"
      role="img"
      aria-label={label}
    >
      {fig.field?.map((d, i) => <path key={i} d={d} className="faint" />)}
      {fig.squares.map((d, i) => <path key={i} d={d} className="fill-board" />)}
      <path d={fig.border} className="ink" />
      {fig.ideal && <path d={fig.ideal} className="ghost dash" />}
      <rect x={0} y={0} width={frameW} height={frameH} className="ink" />
      <text x={0} y={-3}>{`IMAGE · ${SENSOR.widthPx} × ${SENSOR.heightPx} PX`}</text>
      {fig.stereo && (
        <>
          <path d={fig.stereo.rightBorder} className="ghost dash" />
          <path d={dotPath(fig.stereo.rightCorners)} className="ghost dotline" />
          {fig.stereo.rows.map((row) => (
            <g key={row.label + row.y}>
              <path d={`M0 ${row.y}H${frameW}`} className="faint dash" />
              <path d={pathOf([[row.from, row.y], [row.to, row.y]]) + pathOf([[row.to - 4, row.y - 2.5], [row.to, row.y], [row.to - 4, row.y + 2.5]])} className="acc7" />
              {/* Below the arrow, clear of the TL ring: above it, row 0's label
                  overprinted the TL probe label at every baseline up to 140 mm. */}
              <text x={(row.from + row.to) / 2} y={row.y + 14} textAnchor="middle" className="t-acc7">{row.label}</text>
            </g>
          ))}
        </>
      )}
      {/* Optics: a sharp corner's ×10 disc is at most 1.25 units, smaller than the
          corner dot, so it is drawn at least dot-sized and the dot shrinks to a pip. */}
      {mode === 'optics' &&
        fig.corners.map((c, i) => (
          <circle key={`d${i}`} cx={c.at[0]} cy={c.at[1]} r={c.sharp ? Math.max(c.discR, 1.6) : c.discR} className={c.sharp ? 'fill-acc' : 'acc7'} />
        ))}
      {fig.corners.map((c, i) =>
        c.inFrame ? (
          <circle key={i} cx={c.at[0]} cy={c.at[1]} r={mode === 'optics' ? 0.7 : 1.3} className="fill-ink" />
        ) : (
          <circle key={i} cx={c.at[0]} cy={c.at[1]} r={1.6} className="ink" />
        ),
      )}
      {fig.axes && (
        <>
          <path d={fig.axes.x} className="acc7" strokeWidth={1.4} />
          <path d={fig.axes.y} className="acc7" strokeWidth={1.4} />
          <path d={fig.axes.z} className="acc7 dash" strokeWidth={1.4} />
          {fig.axes.labels.map((l) => (
            <text key={l.text} x={l.at[0]} y={l.at[1] + 3} textAnchor="middle" className="t-acc7">{l.text}</text>
          ))}
        </>
      )}
      <path d={`M${px - 5} ${py}H${px + 5}M${px} ${py - 5}V${py + 5}`} className="acc7" />
      <circle cx={fig.probe[0]} cy={fig.probe[1]} r={4.5} className="acc7" />
      <text x={fig.probe[0] - 6} y={fig.probe[1] - 5} textAnchor="end" className="t-acc7">TL</text>
      <text x={frameW} y={IMAGE_VIEW.y + IMAGE_VIEW.h - 2} textAnchor="end">{fig.tag}</text>
    </svg>
  );
};

const ChartStrip: React.FC<{ sum: SceneSummary; mode: CameraMode; label: string }> = ({ sum, mode, label }) => {
  const fig = React.useMemo(() => chartFigure(sum, mode), [sum, mode]);
  const { x0, x1, y0, y1 } = CHART;
  return (
    <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} className="wb-cam-svg wb-cam-chart" role="img" aria-label={label}>
      {fig.band && <rect x={fig.band[0]} y={y0} width={Math.max(0.5, fig.band[1] - fig.band[0])} height={y1 - y0} className="fill-band" />}
      {fig.hatch?.map(([a, b], i) => (
        <rect key={i} x={a} y={y0} width={Math.max(0.5, b - a)} height={y1 - y0} className="hatch" fill="url(#wb-cam-hatch)" />
      ))}
      <path d={`M${x0} ${y0}V${y1}H${x1}`} className="ghost" />
      {fig.yTicks.map((t) => (
        <g key={t.label}>
          <path d={`M${x0 - 3} ${t.at}H${x0}`} className="ghost" />
          <text x={x0 - 6} y={t.at + 3} textAnchor="end">{t.label}</text>
        </g>
      ))}
      {fig.xTicks.map((t) => (
        <g key={t.label}>
          <path d={`M${t.at} ${y1}V${y1 + 3}`} className="ghost" />
          <text x={t.at} y={96} textAnchor="middle">{t.label}</text>
        </g>
      ))}
      {fig.guide && <path d={fig.guide} className="ghost dash" />}
      {fig.curve && <path d={fig.curve} className="acc7" strokeWidth={1.4} />}
      {fig.marks.map((m, i) => {
        if (m.kind === 'dot') return <circle key={i} cx={m.at[0]} cy={m.at[1]} r={2} className="fill-acc7" />;
        if (m.kind === 'tick') return <path key={i} d={`M${m.at[0]} ${m.at[1] - 7}V${m.at[1] + 7}`} className="ink" />;
        const flip = m.at[0] > x1 - 90;
        return (
          <g key={i}>
            <path d={`M${m.at[0]} ${y0}V${y1}`} className="acc dash" />
            <text x={m.at[0] + (flip ? -4 : 4)} y={y0 + 9} textAnchor={flip ? 'end' : 'start'}>{m.label}</text>
          </g>
        );
      })}
      <text x={x1} y={108} textAnchor="end">{fig.label}</text>
    </svg>
  );
};

// ── the detail block ─────────────────────────────────────────────────────

const MatrixTable: React.FC<{ label: string; rows: number[][]; digits: number; sepAt?: number }> = ({ label, rows, digits, sepAt }) => (
  <table className="wb-cam-matrix" aria-label={label}>
    <tbody>
      {rows.map((row, i) => (
        <tr key={i}>
          {row.map((v, j) => (
            <td key={j} data-sep={j === sepAt || undefined}>{fmt(v, digits)}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

const CornerTable: React.FC<{ sum: SceneSummary; stereo: boolean }> = ({ sum, stereo }) => (
  <table className="wb-cam-table">
    <thead>
      <tr>
        <th scope="col">CORNER</th>
        <th scope="col">Z (MM)</th>
        {stereo ? (
          <>
            <th scope="col">d (PX)</th>
            <th scope="col">δZ (MM)</th>
          </>
        ) : (
          <th scope="col">BLUR (PX)</th>
        )}
      </tr>
    </thead>
    <tbody>
      {NAMED_CORNERS.map(({ id, index }) => {
        const c = sum.corners[index];
        return (
          <tr key={id}>
            <th scope="row">{id}</th>
            <td>{fmt(c.z * 1000, 1)}</td>
            {stereo ? (
              <>
                <td>{fmt(c.disparityPx, 1)}</td>
                <td>{fmt(c.depthSigmaMm, 2)}</td>
              </>
            ) : (
              <td>{fmt(c.blurPx, 2)}</td>
            )}
          </tr>
        );
      })}
    </tbody>
  </table>
);

const Equations: React.FC<{ sum: SceneSummary; mode: CameraMode }> = ({ sum, mode }) => {
  const { scene: s, intrinsics: I, probe } = sum;
  if (mode === 'intrinsics') {
    const [xd, yd] = probe.distorted;
    return (
      <ol className="wb-cam-eqs" aria-label="Equations">
        <li>
          <var>f</var><sub>x</sub> = <var>f</var><sub>y</sub> = <var>f</var>/<var>p</var> = {s.focalMm}/{SENSOR.pitchMm} = {fmt(I.fx, 0)} px
        </li>
        <li>
          <var>x</var> = <var>X</var><sub>c</sub>/<var>Z</var><sub>c</sub>, <var>y</var> = <var>Y</var><sub>c</sub>/<var>Z</var><sub>c</sub>, <var>r</var><sup>2</sup> = <var>x</var><sup>2</sup> + <var>y</var><sup>2</sup>
        </li>
        <li>
          <var>x</var><sub>d</sub> = <var>x</var>(1 + <var>k</var><sub>1</sub><var>r</var><sup>2</sup> + <var>k</var><sub>2</sub><var>r</var><sup>4</sup>) + 2<var>p</var><sub>1</sub><var>xy</var> + <var>p</var><sub>2</sub>(<var>r</var><sup>2</sup> + 2<var>x</var><sup>2</sup>)
        </li>
        <li>
          <var>y</var><sub>d</sub> = <var>y</var>(1 + <var>k</var><sub>1</sub><var>r</var><sup>2</sup> + <var>k</var><sub>2</sub><var>r</var><sup>4</sup>) + <var>p</var><sub>1</sub>(<var>r</var><sup>2</sup> + 2<var>y</var><sup>2</sup>) + 2<var>p</var><sub>2</sub><var>xy</var>
        </li>
        <li>
          TL: <var>r</var><sup>2</sup> = {fmt(probe.r2, 4)} → <var>x</var><sub>d</sub> = {fmt(xd, 4)}, <var>y</var><sub>d</sub> = {fmt(yd, 4)} → <var>u</var> = {fmt(I.fx, 0)}·({fmt(xd, 4)}) + {fmt(I.cx, 0)} = {fmt(probe.pixel[0], 1)}, <var>v</var> = {fmt(probe.pixel[1], 1)}
        </li>
      </ol>
    );
  }
  if (mode === 'extrinsics') {
    // H has no distortion term, so line 5 is the pinhole trace: H·[X Y 1] gives it exactly.
    const tl = sum.pinhole.probe;
    return (
      <ol className="wb-cam-eqs" aria-label="Equations">
        <li>
          <var>R</var><sub>wc</sub> = <var>R</var><sub>y</sub>(ψ) <var>R</var><sub>x</sub>(−θ) <var>R</var><sub>z</sub>(φ), <var>R</var> = <var>R</var><sub>wc</sub><sup>T</sup>
        </li>
        <li>
          <var>C</var> = <var>T</var> − ρ·<var>R</var><sub>wc</sub><var>e</var><sub>z</sub>, <var>t</var> = −<var>RC</var>
        </li>
        <li>
          <var>R</var> = <var>I</var> + sin|ω|[<var>k</var>]<sub>×</sub> + (1 − cos|ω|)[<var>k</var>]<sub>×</sub><sup>2</sup>, <var>k</var> = ω/|ω|
        </li>
        <li>
          <var>Z</var><sub>w</sub> = 0 ⇒ <var>s</var>[<var>u</var> <var>v</var> 1]<sup>T</sup> = <var>K</var>[<var>r</var><sub>1</sub> <var>r</var><sub>2</sub> <var>t</var>][<var>X</var> <var>Y</var> 1]<sup>T</sup> = <var>H</var>[<var>X</var> <var>Y</var> 1]<sup>T</sup>
        </li>
        <li>
          <var>X</var><sub>c</sub> = <var>RX</var><sub>w</sub> + <var>t</var>: TL → ({tl.camera.map((v) => fmt(v, 3)).join(', ')}) m → <var>H</var> → ({fmt(tl.pixel[0], 1)}, {fmt(tl.pixel[1], 1)}) px
        </li>
      </ol>
    );
  }
  if (mode === 'optics') {
    const lens = sum.lens;
    const z = sum.corners[NAMED_CORNERS[0].index].z * 1000;
    const focus = s.focusM * 1000;
    return (
      <ol className="wb-cam-eqs" aria-label="Equations">
        <li>
          <var>v</var> = <var>fs</var>/(<var>s</var> − <var>f</var>) = {fmt(lens.imageDistanceMm, 2)} mm, <var>A</var> = <var>f</var>/<var>N</var> = {fmt(lens.apertureMm, 2)} mm
        </li>
        <li>
          <var>c</var>(<var>Z</var>) = <var>A</var>·|<var>Z</var> − <var>s</var>|/<var>Z</var> · <var>f</var>/(<var>s</var> − <var>f</var>)
        </li>
        <li>
          <var>H</var> = <var>f</var><sup>2</sup>/(<var>Nc</var>) + <var>f</var> = {fmt(lens.hyperfocalMm / 1000, 2)} m, <var>c</var> = 0.025 mm = 1 px
        </li>
        <li>
          <var>Z</var><sub>near</sub> = <var>s</var>(<var>H</var> − <var>f</var>)/(<var>H</var> + <var>s</var> − 2<var>f</var>), <var>Z</var><sub>far</sub> = <var>s</var>(<var>H</var> − <var>f</var>)/(<var>H</var> − <var>s</var>)
        </li>
        <li>
          TL: <var>c</var>({fmt(z, 1)}) = {fmt(lens.apertureMm, 1)}·{fmt(Math.abs(z - focus), 1)}/{fmt(z, 1)}·{s.focalMm}/{fmt(focus - s.focalMm, 0)} = {fmt(lens.blurMm(z), 4)} mm = {fmt(lens.blurPx(z), 2)} px
        </li>
      </ol>
    );
  }
  const d = sum.stereo.disparityPx(s.distanceM);
  const [lo, hi] = sum.stereo.depthIntervalM(s.distanceM);
  return (
    <ol className="wb-cam-eqs" aria-label="Equations">
      <li>
        <var>v</var><sub>L</sub> = <var>v</var><sub>R</sub>: rectified, so every epipolar line is an image row
      </li>
      <li>
        <var>d</var> = <var>u</var><sub>L</sub> − <var>u</var><sub>R</sub> = <var>f</var><sub>x</sub>·<var>B</var>/<var>Z</var>
      </li>
      <li>
        <var>Z</var> = <var>f</var><sub>x</sub>·<var>B</var>/<var>d</var> = {fmt(I.fx, 0)}·{fmt(s.baselineM, 2)}/{fmt(d, 1)} = {fmt(s.distanceM, 3)} m
      </li>
      <li>
        δ<var>Z</var> ≈ <var>Z</var><sup>2</sup>δ<var>d</var>/(<var>f</var><sub>x</sub>·<var>B</var>) = {fmt(sum.stereo.depthSigmaM(s.distanceM) * 1000, 2)} mm
      </li>
      <li>
        exact: [<var>f</var><sub>x</sub>·<var>B</var>/(<var>d</var> + δ<var>d</var>), <var>f</var><sub>x</sub>·<var>B</var>/(<var>d</var> − δ<var>d</var>)] = [{fmt(lo, 4)}, {fmt(hi, 4)}] m
      </li>
    </ol>
  );
};

const DetailAside: React.FC<{ sum: SceneSummary; mode: CameraMode }> = ({ sum, mode }) => {
  const { scene: s, pose, lens } = sum;
  if (mode === 'intrinsics') {
    return (
      <div className="wb-cam-aside">
        <div className="wb-cam-mat">
          <var>K</var> =
          <MatrixTable label="K" rows={sum.K} digits={1} />
        </div>
        <p>
          (<var>k</var><sub>1</sub>, <var>k</var><sub>2</sub>, <var>p</var><sub>1</sub>, <var>p</var><sub>2</sub>, <var>k</var><sub>3</sub>) = ({fmt(s.k1, 3)}, {fmt(s.k2, 3)}, {fmt(s.p1, 4)}, {fmt(s.p2, 4)}, 0)
        </p>
      </div>
    );
  }
  if (mode === 'extrinsics') {
    const Rt = pose.R.map((row, i) => [...row, pose.t[i]]);
    return (
      <div className="wb-cam-aside">
        <div className="wb-cam-mat">
          [<var>R</var> | <var>t</var>] =
          <MatrixTable label="R | t" rows={Rt} digits={4} sepAt={3} />
        </div>
        <div className="wb-cam-mat">
          <var>H</var> =
          <MatrixTable label="H" rows={sum.H} digits={4} />
        </div>
        <p>
          <var>t</var> = (0, 0, ρ) because the world origin sits on the optical axis; <var>C</var> carries the position. <var>h</var><sub>33</sub> = 1.
        </p>
      </div>
    );
  }
  if (mode === 'optics') {
    return (
      <div className="wb-cam-aside">
        <CornerTable sum={sum} stereo={false} />
        <p>
          <var>K</var> uses <var>f</var> (focus at ∞); focused at {fmt(s.focusM, 2)} m the lens sits {fmt(lens.imageDistanceMm - s.focalMm, 2)} mm further out and the image scales ×{fmt(lens.breathing, 3)} — a calibration holds only at the focus it was taken at.
        </p>
      </div>
    );
  }
  return (
    <div className="wb-cam-aside">
      <CornerTable sum={sum} stereo />
    </div>
  );
};

// ── FIG. 06b: Zhang calibration ──────────────────────────────────────────

const THUMB_SCALE = 1 / 12;

const thumbLabel = (index: number, view: SyntheticView | null) => {
  const v = CAL_VIEWS[index];
  if (!view) return `View ${index + 1}: rejected — the board left the frame at every distance tried`;
  return `View ${index + 1}: board ${fmt(view.distanceM, 2)} m away, yaw ${fmt(v.yawDeg, 0)}°, pitch ${fmt(v.pitchDeg, 0)}°, roll ${fmt(v.rollDeg, 0)}°, ${view.points.length} corners`;
};

const Thumb: React.FC<{ index: number; view: SyntheticView | null }> = ({ index, view }) => {
  const w = SENSOR.widthPx * THUMB_SCALE;
  const h = SENSOR.heightPx * THUMB_SCALE;
  const at = (p: Vec2): Vec2 => [p[0] * THUMB_SCALE, p[1] * THUMB_SCALE];
  const label = thumbLabel(index, view);
  return (
    <li>
      <svg viewBox={`0 0 ${w} ${h}`} className="wb-cam-svg wb-cam-thumb" role="img" aria-label={label}>
        {view ? (
          <>
            <path d={pathOf([0, 8, 53, 45].map((k) => at(view.points[k])), true)} className="acc" />
            <path d={dotPath(view.points.map(at))} className="ink dotline" />
          </>
        ) : (
          <text x={w / 2} y={h / 2 - 2} textAnchor="middle">
            <tspan x={w / 2}>REJECTED —</tspan>
            <tspan x={w / 2} dy={10}>board left the frame</tspan>
          </text>
        )}
      </svg>
      <span className="wb-cam-thumb-cap" aria-hidden="true">
        {view ? `V${index + 1} · ${fmt(view.distanceM, 2)} m` : `V${index + 1} · REJECTED`}
      </span>
    </li>
  );
};

type ResultRow = { key: keyof Intrinsics; label: React.ReactNode; digits: number; closed: boolean };
const RESULT_ROWS: ResultRow[] = [
  { key: 'fx', label: <><var>f</var><sub>x</sub></>, digits: 2, closed: true },
  { key: 'fy', label: <><var>f</var><sub>y</sub></>, digits: 2, closed: true },
  { key: 'cx', label: <><var>c</var><sub>x</sub></>, digits: 2, closed: true },
  { key: 'cy', label: <><var>c</var><sub>y</sub></>, digits: 2, closed: true },
  { key: 'k1', label: <><var>k</var><sub>1</sub></>, digits: 4, closed: false },
  { key: 'k2', label: <><var>k</var><sub>2</sub></>, digits: 4, closed: false },
  { key: 'p1', label: <><var>p</var><sub>1</sub></>, digits: 5, closed: false },
  { key: 'p2', label: <><var>p</var><sub>2</sub></>, digits: 5, closed: false },
];

const Scatter: React.FC<{ residuals: Vec2[]; rms: number }> = ({ residuals, rms }) => {
  const R = Math.max(0.5, Math.ceil((8 * rms) / Math.SQRT2) / 2);
  const c = 75;
  const k = 66 / R;
  const pts = residuals.map(([du, dv]): Vec2 => [c + du * k, c + dv * k]);
  return (
    <svg viewBox="0 0 150 150" className="wb-cam-svg wb-cam-scatter" role="img" aria-label={`Residuals: ${residuals.length} corners, RMS ${fmt(rms, 3)} px`}>
      <path d={`M${c} 6V144M6 ${c}H144`} className="faint" />
      <circle cx={c} cy={c} r={Math.round(rms * k * 10) / 10} className="acc7 dash" />
      <path d={dotPath(pts)} className="ink dotline" />
      <text x={5} y={13}>{`±${fmt(R, 1)} PX`}</text>
      <text x={145} y={145} textAnchor="end">{`RMS ${fmt(rms, 3)}`}</text>
    </svg>
  );
};

const CalibrationFigure: React.FC<{
  noisePx: number;
  onNoise: (v: number) => void;
  views: Array<SyntheticView | null>;
  cal: CalState;
  stale: boolean;
  disabled: boolean;
  onCalibrate: () => void;
}> = ({ noisePx, onNoise, views, cal, stale, disabled, onCalibrate }) => {
  const solving = cal.status === 'solving';
  const result = cal.result;
  let status: React.ReactNode;
  if (cal.status === 'idle') status = 'Not yet run — nothing is precomputed.';
  else if (solving) status = 'Solving…';
  else if (result && !result.ok) status = `Did not converge — ${result.reason}; no estimate to show.`;
  else if (stale) status = <>Stale — the camera changed since this run <span className="tag tag-neutral">STALE</span></>;
  else if (result?.ok) status = `Solved: ${result.iterations} iterations · RMS ${fmt(result.rms, 3)} px (closed form ${fmt(result.closedRms, 3)} px)`;
  return (
    <figure className="blueprint wb-figure wb-cam-cal">
      <Corners />
      <div className="wb-figure-head">
        <h3>Zhang Calibration — Synthetic Detections</h3>
        <span>{`SEED ${CALIBRATION_SEED} · ${CAL_VIEWS.length} VIEWS`}</span>
      </div>
      <div className="wb-cam-calrow" data-cam-still="">
        <Slider
          id="cam-ctl-noise"
          name="DETECTION NOISE"
          symbol="σ"
          value={noisePx}
          min={NOISE_RANGE.min}
          max={NOISE_RANGE.max}
          step={NOISE_RANGE.step}
          format={(v) => `${fmt(v, 2)} px`}
          onChange={onNoise}
        />
        {/* Never `disabled` while solving: disabling the focused button drops focus
            to <body>. runCalibration already ignores a press mid-solve. */}
        <button
          type="button"
          className="btn btn-primary"
          onClick={onCalibrate}
          disabled={disabled}
          aria-disabled={solving || undefined}
          aria-busy={solving || undefined}
        >
          Calibrate
        </button>
        <span role="status" className="wb-cam-status">{status}</span>
      </div>
      <ol className="wb-cam-thumbs">
        {views.map((view, index) => <Thumb key={index} index={index} view={view} />)}
      </ol>
      {result?.ok && cal.truth && (
        <div className="wb-cam-results">
          <table className="wb-cam-table wb-cam-caltable">
            <caption>Calibration results</caption>
            <thead>
              <tr>
                <th scope="col">PARAMETER</th>
                <th scope="col">TRUTH</th>
                <th scope="col">CLOSED FORM</th>
                <th scope="col">REFINED ± 1σ</th>
                <th scope="col">ERROR</th>
              </tr>
            </thead>
            <tbody>
              {RESULT_ROWS.map(({ key, label, digits, closed }) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>{fmt(cal.truth![key], digits)}</td>
                  <td>{closed ? fmt(result.closedForm[key as 'fx' | 'fy' | 'cx' | 'cy'], digits) : '0 (assumed)'}</td>
                  <td>{`${fmt(result.estimate[key], digits)} ± ${fmt(result.stdErr[key], digits)}`}</td>
                  <td>{signed(result.estimate[key] - cal.truth![key], digits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Scatter residuals={result.residuals} rms={result.rms} />
        </div>
      )}
      <figcaption>
        FIG. 06b — Zhang (2000): one homography per view by normalised DLT, then <var>K</var> in closed form from the image of the absolute conic <var>B</var> = <var>K</var><sup>−T</sup><var>K</var><sup>−1</sup> (zero skew imposed), then Levenberg–Marquardt over 8 intrinsics + 6 poses (44 parameters, 648 residuals); ±1σ from σ̂<sup>2</sup>(<var>J</var><sup>T</sup><var>J</var>)<sup>−1</sup>. The truth is the camera configured above — on a real rig the error column is unknowable.
      </figcaption>
    </figure>
  );
};

// ── the window body ──────────────────────────────────────────────────────

export const CameraLab: React.FC = () => {
  const [mode, setMode] = React.useState<CameraMode>('intrinsics');
  const [scene, setScene] = React.useState<CameraScene>(DEFAULT_SCENE);
  const [noisePx, setNoisePx] = React.useState<number>(DEFAULT_NOISE_PX);
  const [cal, setCal] = React.useState<CalState>({ status: 'idle' });

  const latest = React.useRef({ scene, mode });
  const commitTimer = React.useRef<number | undefined>(undefined);
  const calTimer = React.useRef<number | undefined>(undefined);
  // Bumped by every run and by unmount, so a solve that resolves late is dropped.
  const calRun = React.useRef(0);
  const bindings = React.useRef<Record<BindingSlot, Binding>>({
    plan: { node: null, detach: () => {} },
    still: { node: null, detach: () => {} },
  });
  const dragPointer = React.useRef<number | null>(null);

  const sum = React.useMemo(() => summarizeScene(scene), [scene]);
  const labels = React.useMemo(() => figureLabels(sum, mode), [sum, mode]);
  const calKey = calKeyOf(scene, noisePx);
  // Thumbnails are part of the prerender: derived in render, and keyed on the
  // intrinsics + noise only, because the six calibration poses are fixed.
  const { focalMm, cxOffsetPx, cyOffsetPx, k1, k2, p1, p2 } = scene;
  const views = React.useMemo(
    () => synthesizeViews({ ...DEFAULT_SCENE, focalMm, cxOffsetPx, cyOffsetPx, k1, k2, p1, p2 }, { noisePx }),
    [focalMm, cxOffsetPx, cyOffsetPx, k1, k2, p1, p2, noisePx],
  );
  const modeInfo = CAMERA_MODES.find((m) => m.id === mode) ?? CAMERA_MODES[0];

  React.useEffect(() => {
    latest.current = { scene, mode };
  });

  // One event per settled change, never at mount. Stereo sends its own event
  // because audioPolicy gives the two different cues; both at once is noise.
  const schedule = React.useCallback(() => {
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = undefined;
      const { scene: s, mode: m } = latest.current;
      if (m === 'stereo') dispatchPortfolioWorldEvent({ type: 'STEREO_POINT_TRIANGULATED', depthError: stereoRig(s).depthSigmaM(s.distanceM) });
      else dispatchPortfolioWorldEvent({ type: 'CAMERA_LAB_UPDATED', snapshot: toSnapshot(s, m) });
    }, COMMIT_DEBOUNCE_MS);
  }, []);

  const commit = React.useCallback(
    (patch: Partial<CameraScene>) => {
      setScene((prev) => {
        const next = clampScene({ ...prev, ...patch });
        return sameScene(prev, next) ? prev : next;
      });
      schedule();
    },
    [schedule],
  );

  const selectMode = (next: CameraMode) => {
    if (next === mode) return;
    setMode(next);
    schedule();
  };

  // The assistant switches modes by event. It never dispatches and never moves focus.
  React.useEffect(() => {
    const onMode = (event: Event) => {
      const next = (event as CustomEvent<{ mode?: unknown } | undefined>).detail?.mode;
      if (isCameraMode(next)) setMode(next);
    };
    window.addEventListener(MODE_EVENT, onMode);
    return () => window.removeEventListener(MODE_EVENT, onMode);
  }, []);

  const reset = () => {
    window.clearTimeout(commitTimer.current);
    commitTimer.current = undefined;
    setScene(DEFAULT_SCENE);
    setNoisePx(DEFAULT_NOISE_PX);
    dispatchPortfolioWorldEvent({ type: 'LAB_RESET', sceneId: 'camera-laboratory' });
  };

  const runCalibration = () => {
    if (cal.status === 'solving' || !sum.monotonic) return;
    const key = calKey;
    const input = views;
    const truth = intrinsicsOf(scene);
    const run = ++calRun.current;
    setCal((prev) => ({ ...prev, status: 'solving' }));
    window.clearTimeout(calTimer.current);
    // A macrotask first, so "Solving…" paints before ~60 ms of main-thread work.
    const painted = new Promise<void>((resolve) => {
      calTimer.current = window.setTimeout(() => {
        calTimer.current = undefined;
        resolve();
      }, 20);
    });
    // The solver is its own chunk: nothing else on the page needs it, so it is
    // fetched here, in parallel with that beat, rather than with the page. A
    // failed fetch reports like a failed solve. A run superseded or unmounted
    // (calRun) while the fetch is in flight is dropped.
    Promise.all([import('../../lib/cameraCalibration'), painted])
      .then(([{ calibrate }]) => calibrate(input))
      .catch((error: unknown): CalibrationResult => ({ ok: false, reason: error instanceof Error ? error.message : 'the solver failed' }))
      .then((result) => {
        if (calRun.current !== run) return;
        setCal({ status: 'done', result, key, truth });
        if (result.ok) dispatchPortfolioWorldEvent({ type: 'CAMERA_CALIBRATED', reprojectionError: result.rms });
      });
  };

  // Native bindings, found by a DOM scan after every render (no dep array) and
  // re-bound only when a node itself changed — see the header comment.
  //  - the plan: drag the camera, a pointer-only mirror of the ρ and ψ sliders;
  //  - [data-cam-still]: the calibration controls ride a hoist, and a slider whose
  //    card starts swinging under the thumb is unusable, so they swallow the nudge.
  React.useEffect(() => {
    const rebind = <T extends Element>(slot: BindingSlot, node: T | null, attach: (node: T) => () => void) => {
      const binding = bindings.current[slot];
      if (node === binding.node) return;
      binding.detach();
      binding.node = node;
      binding.detach = node ? attach(node) : () => {};
    };

    rebind('plan', document.querySelector<SVGSVGElement>('svg[data-cam-plan]'), (node) => {
      // getScreenCTM includes the hoist's live rotation, so a swinging card still maps.
      const moveTo = (event: PointerEvent) => {
        const ctm = typeof node.getScreenCTM === 'function' ? node.getScreenCTM() : null;
        if (!ctm) return;
        const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
        commit(orbitFromPlanPoint([p.x, p.y], latest.current.scene));
      };
      const onDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        event.stopPropagation(); // keep FieldWorkbench from nudging the hoist
        event.preventDefault();
        try { node.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
        dragPointer.current = event.pointerId;
        node.setAttribute('data-dragging', '');
        moveTo(event);
      };
      const onMove = (event: PointerEvent) => {
        if (dragPointer.current === event.pointerId) moveTo(event);
      };
      const onEnd = (event: PointerEvent) => {
        if (dragPointer.current !== event.pointerId) return;
        dragPointer.current = null;
        node.removeAttribute('data-dragging');
      };
      node.addEventListener('pointerdown', onDown);
      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerup', onEnd);
      node.addEventListener('pointercancel', onEnd);
      return () => {
        node.removeEventListener('pointerdown', onDown);
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerup', onEnd);
        node.removeEventListener('pointercancel', onEnd);
        node.removeAttribute('data-dragging');
        dragPointer.current = null;
      };
    });

    rebind('still', document.querySelector<HTMLElement>('[data-cam-still]'), (node) => {
      const stop = (event: PointerEvent) => event.stopPropagation();
      node.addEventListener('pointerdown', stop);
      return () => node.removeEventListener('pointerdown', stop);
    });
  });

  React.useEffect(
    () => () => {
      window.clearTimeout(commitTimer.current);
      window.clearTimeout(calTimer.current);
      calRun.current += 1;
      Object.values(bindings.current).forEach((binding) => {
        binding.detach();
        binding.node = null;
        binding.detach = () => {};
      });
    },
    [],
  );

  const stale = cal.status === 'done' && cal.key !== calKey;
  const metrics = metricsFor(sum, mode);

  return (
    <div className="wb-cam">
      <Kicker>C4 / CALIBRATE — ONE SCENE · FOUR MODELS · SYNTHETIC</Kicker>
      <p className="wb-cam-lead">
        One simulated camera — a 35 mm lens on a 36 × 24 mm sensor read out at 1440 × 960 px (25 µm pixels, coarse so the numbers stay legible) — looking at one 9 × 6-corner, 50 mm checkerboard. Every number below is computed in your browser from the equation printed beside it; nothing is photographed or measured.
      </p>
      <div className="wb-cam-bar">
        <ModeTabs mode={mode} onSelect={selectMode} />
        <button type="button" className="btn btn-ghost" onClick={reset}>Reset scene</button>
      </div>
      <div role="tabpanel" id="cam-panel" aria-labelledby={`cam-tab-${mode}`}>
        <Controls scene={scene} mode={mode} commit={commit} />
        <Hoist>
          <figure className="blueprint wb-figure wb-cam-fig">
            <Corners />
            <div className="wb-figure-head">
              <h3>{modeInfo.question}</h3>
              <span>{modeInfo.tag}</span>
            </div>
            <div className="wb-cam-views">
              <PlanView sum={sum} mode={mode} label={labels.plan} />
              <ImageView sum={sum} mode={mode} label={labels.image} />
            </div>
            <ChartStrip sum={sum} mode={mode} label={labels.chart} />
            <figcaption>{`FIG. 06 — ${answerFor(sum, mode)} Drag the camera in the plan.`}</figcaption>
          </figure>
        </Hoist>
        <div className="wb-cam-detail">
          <Equations sum={sum} mode={mode} />
          <DetailAside sum={sum} mode={mode} />
          <div className="wb-metrics wb-cam-metrics">
            {metrics.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {!sum.monotonic && (
            <p role="alert" className="wb-cam-alert">
              Distortion folds back inside the frame (d<var>r</var><sub>d</sub>/d<var>r</var> ≤ 0 — tangential terms not checked) — not a physical lens; calibration disabled.
            </p>
          )}
        </div>
      </div>
      <Hoist>
        <CalibrationFigure
          noisePx={noisePx}
          onNoise={(v) => setNoisePx(Math.min(NOISE_RANGE.max, Math.max(NOISE_RANGE.min, v)))}
          views={views}
          cal={cal}
          stale={stale}
          disabled={!sum.monotonic}
          onCalibrate={runCalibration}
        />
      </Hoist>
      <p className="wb-note">
        Synthetic, deterministic instrument: the scene, the camera and the ‘detections’ are generated in your browser from the model on this sheet, seeded ({CALIBRATION_SEED}) and identical on every visit — no real camera or image data, and not project evidence. The pinhole, pose, calibration and stereo models are CS4277 (NUS 3D Computer Vision) material, a course where Rahul was the top student of 24 (AY2025/26 Sem 2); the thin-lens optics model is not part of that record.
      </p>
    </div>
  );
};

export default CameraLab;
