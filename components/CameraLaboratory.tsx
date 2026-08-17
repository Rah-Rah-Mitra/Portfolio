import React, { useMemo, useRef, useState } from 'react';
import {
  DEFAULT_EXTRINSICS, DEFAULT_INTRINSICS, DEFAULT_OPTICS, DEFAULT_STEREO,
  computeExtrinsics, computeIntrinsics, computeOptics, computeStereo,
  type ExtrinsicsInput, type IntrinsicsInput, type OpticsInput, type StereoInput,
} from '../lib/cameraMath';
import type { PortfolioWorldEvent, QualityTier } from '../types';

type Mode = 'intrinsics' | 'extrinsics' | 'optics' | 'stereo';
const modes: Array<{ id: Mode; label: string }> = [
  { id: 'intrinsics', label: 'Intrinsics' }, { id: 'extrinsics', label: 'Extrinsics' },
  { id: 'optics', label: 'Optics' }, { id: 'stereo', label: 'Stereo' },
];

const fmt = (value: number | null, digits = 3) => value === null || !Number.isFinite(value) ? 'Invalid' : value.toFixed(digits);
const Matrix = ({ value }: { value: number[][] }) => <code className="camera-matrix">{value.map((row) => `[${row.map((cell) => fmt(cell, 3)).join(', ')}]`).join(' ')}</code>;
const Numeric = ({ label, value, onChange, min, max, step = 'any' }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number | 'any' }) => (
  <label className="camera-control"><span>{label}</span><input type="number" aria-label={label} value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>
);

interface CameraLaboratoryProps { onWorldEvent?: (event: PortfolioWorldEvent) => void; qualityTier?: QualityTier }

const CameraLaboratory: React.FC<CameraLaboratoryProps> = ({ onWorldEvent, qualityTier = 'full' }) => {
  const [mode, setMode] = useState<Mode>('intrinsics');
  const [intrinsics, setIntrinsics] = useState<IntrinsicsInput>({ ...DEFAULT_INTRINSICS });
  const [extrinsics, setExtrinsics] = useState<ExtrinsicsInput>({ ...DEFAULT_EXTRINSICS });
  const [optics, setOptics] = useState<OpticsInput>({ ...DEFAULT_OPTICS });
  const [stereo, setStereo] = useState<StereoInput>({ ...DEFAULT_STEREO });
  const [engineer, setEngineer] = useState(false);
  const tabs = useRef(new Map<Mode, HTMLButtonElement>());
  const intrinsicsResult = useMemo(() => computeIntrinsics(intrinsics), [intrinsics]);
  const extrinsicsResult = useMemo(() => computeExtrinsics(extrinsics, intrinsics), [extrinsics, intrinsics]);
  const opticsResult = useMemo(() => computeOptics(optics), [optics]);
  const stereoResult = useMemo(() => computeStereo(stereo), [stereo]);

  const changeMode = (next: Mode) => { setMode(next); tabs.current.get(next)?.focus(); };
  const handleTabKey = (event: React.KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % modes.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + modes.length) % modes.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = modes.length - 1;
    else return;
    event.preventDefault(); changeMode(modes[next].id);
  };
  const updateIntrinsics = (patch: Partial<IntrinsicsInput>) => {
    const next = { ...intrinsics, ...patch }; setIntrinsics(next);
    const projection = computeExtrinsics(extrinsics, next);
    onWorldEvent?.({ type: 'CAMERA_CALIBRATED', reprojectionError: projection.valid ? Math.hypot((projection.pixel?.[0] ?? next.principalX) - next.principalX, (projection.pixel?.[1] ?? next.principalY) - next.principalY) : Number.POSITIVE_INFINITY });
  };
  const updateExtrinsics = (patch: Partial<ExtrinsicsInput>) => {
    const next = { ...extrinsics, ...patch }; setExtrinsics(next);
    const projection = computeExtrinsics(next, intrinsics);
    onWorldEvent?.({ type: 'CAMERA_CALIBRATED', reprojectionError: projection.valid ? Math.hypot((projection.pixel?.[0] ?? intrinsics.principalX) - intrinsics.principalX, (projection.pixel?.[1] ?? intrinsics.principalY) - intrinsics.principalY) : Number.POSITIVE_INFINITY });
  };
  const updateStereo = (patch: Partial<StereoInput>) => {
    const next = { ...stereo, ...patch }; setStereo(next); const result = computeStereo(next);
    if (result.valid) onWorldEvent?.({ type: 'STEREO_POINT_TRIANGULATED', depthError: result.absoluteErrorMeters });
  };
  const reset = () => {
    if (mode === 'intrinsics') setIntrinsics({ ...DEFAULT_INTRINSICS });
    if (mode === 'extrinsics') setExtrinsics({ ...DEFAULT_EXTRINSICS });
    if (mode === 'optics') setOptics({ ...DEFAULT_OPTICS });
    if (mode === 'stereo') setStereo({ ...DEFAULT_STEREO });
    onWorldEvent?.({ type: 'LAB_RESET', sceneId: 'camera-laboratory' });
  };

  return (
    <section className="camera-laboratory" aria-labelledby="camera-laboratory-heading">
      <header className="camera-lab-header"><div><h3 id="camera-laboratory-heading">Camera Laboratory</h3><p>Directly manipulate the camera model; equations and numerical results remain available without WebGL.</p></div><button type="button" aria-pressed={engineer} onClick={() => setEngineer((value) => !value)}>{engineer ? 'Hide' : 'Show'} Engineer View</button></header>
      <p className="camera-lab-disclaimer">An interactive portfolio-site experiment, not professional project evidence. Values are synthetic and computed locally.</p>
      <div className="camera-mode-tabs" role="tablist" aria-label="Camera laboratory modes">
        {modes.map((item, index) => <button key={item.id} ref={(node) => { if (node) tabs.current.set(item.id, node); else tabs.current.delete(item.id); }} id={`camera-tab-${item.id}`} role="tab" type="button" aria-selected={mode === item.id} aria-controls="camera-mode-panel" tabIndex={mode === item.id ? 0 : -1} onClick={() => changeMode(item.id)} onKeyDown={(event) => handleTabKey(event, index)}>{item.label}</button>)}
      </div>

      <div className="camera-mode-panel" id="camera-mode-panel" role="tabpanel" aria-labelledby={`camera-tab-${mode}`} tabIndex={0}>
        {mode === 'intrinsics' && <>
          <div className="camera-control-grid">
            <Numeric label="Image width (px)" value={intrinsics.imageWidthPx} min={1} onChange={(value) => updateIntrinsics({ imageWidthPx: value })} />
            <Numeric label="Image height (px)" value={intrinsics.imageHeightPx} min={1} onChange={(value) => updateIntrinsics({ imageHeightPx: value })} />
            <Numeric label="Focal length (mm)" value={intrinsics.focalLengthMm} min={1} onChange={(value) => updateIntrinsics({ focalLengthMm: value })} />
            <Numeric label="Sensor width (mm)" value={intrinsics.sensorWidthMm} min={1} onChange={(value) => updateIntrinsics({ sensorWidthMm: value })} />
            <Numeric label="Sensor height (mm)" value={intrinsics.sensorHeightMm} min={1} onChange={(value) => updateIntrinsics({ sensorHeightMm: value })} />
            <Numeric label="Principal point X" value={intrinsics.principalX} onChange={(value) => updateIntrinsics({ principalX: value })} />
            <Numeric label="Principal point Y" value={intrinsics.principalY} onChange={(value) => updateIntrinsics({ principalY: value })} />
            <Numeric label="Radial distortion k1" value={intrinsics.k1} step={0.01} onChange={(value) => updateIntrinsics({ k1: value })} />
            <Numeric label="Radial distortion k2" value={intrinsics.k2} step={0.01} onChange={(value) => updateIntrinsics({ k2: value })} />
          </div>
          {!intrinsicsResult.valid && <p role="alert">{intrinsicsResult.error}</p>}
          <p className="camera-equation">fx = f / sensorWidth × imageWidth · FOV = 2 atan(sensor / 2f)</p>
          <table aria-label="Intrinsics results"><tbody><tr><th scope="row">fx / fy</th><td>{fmt(intrinsicsResult.fx)} / {fmt(intrinsicsResult.fy)} px</td></tr><tr><th scope="row">Horizontal / vertical FOV</th><td>{fmt(intrinsicsResult.horizontalFovDegrees, 2)}° / {fmt(intrinsicsResult.verticalFovDegrees, 2)}°</td></tr><tr><th scope="row">Intrinsic matrix K</th><td><Matrix value={intrinsicsResult.K} /></td></tr></tbody></table>
          <button type="button" onClick={() => updateIntrinsics({ focalLengthMm: 24, k1: -0.08, k2: 0.015 })}>Load Intrinsics example</button>
        </>}
        {mode === 'extrinsics' && <>
          <p className="camera-convention">Right-handed world; +Z is camera-forward view depth. Yaw/pitch/roll rotate the world into camera coordinates.</p>
          <div className="camera-control-grid">
            {(['X', 'Y', 'Z'] as const).map((axis, index) => <Numeric key={`camera-${axis}`} label={`Camera ${axis}`} value={extrinsics.camera[index]} onChange={(value) => { const camera = [...extrinsics.camera] as [number, number, number]; camera[index] = value; updateExtrinsics({ camera }); }} />)}
            <Numeric label="Yaw (degrees)" value={extrinsics.yawDegrees} onChange={(value) => updateExtrinsics({ yawDegrees: value })} /><Numeric label="Pitch (degrees)" value={extrinsics.pitchDegrees} onChange={(value) => updateExtrinsics({ pitchDegrees: value })} /><Numeric label="Roll (degrees)" value={extrinsics.rollDegrees} onChange={(value) => updateExtrinsics({ rollDegrees: value })} />
            {(['X', 'Y', 'Z'] as const).map((axis, index) => <Numeric key={`object-${axis}`} label={`Object ${axis}`} value={extrinsics.object[index]} onChange={(value) => { const object = [...extrinsics.object] as [number, number, number]; object[index] = value; updateExtrinsics({ object }); }} />)}
          </div>
          {!extrinsicsResult.valid && <p role="alert">{extrinsicsResult.error}</p>}
          <p className="camera-equation">p = K [R | t] P · projection requires view depth z &gt; 0</p>
          <table aria-label="Extrinsics results"><tbody><tr><th scope="row">View coordinates</th><td>{extrinsicsResult.viewPoint.map((v) => fmt(v)).join(', ')}</td></tr><tr><th scope="row">Projected pixel</th><td>{extrinsicsResult.pixel ? extrinsicsResult.pixel.map((v) => fmt(v, 2)).join(', ') : 'Rejected'}</td></tr><tr><th scope="row">World-to-camera matrix</th><td><Matrix value={extrinsicsResult.matrix} /></td></tr></tbody></table>
          <button type="button" onClick={() => updateExtrinsics({ camera: [1, 0.5, -1], yawDegrees: 12, object: [0.5, 0.25, 4] })}>Load Extrinsics example</button>
        </>}
        {mode === 'optics' && <>
          <p className="camera-convention">Analytic thin-lens sensor blur only; this is not a photorealistic depth-of-field renderer.</p>
          <div className="camera-control-grid"><Numeric label="F-number" value={optics.fNumber} min={1.4} max={16} step={0.1} onChange={(value) => setOptics({ ...optics, fNumber: value })} /><Numeric label="Optics focal length (mm)" value={optics.focalLengthMm} min={1} onChange={(value) => setOptics({ ...optics, focalLengthMm: value })} /><Numeric label="Object distance (mm)" value={optics.objectDistanceMm} min={1} onChange={(value) => setOptics({ ...optics, objectDistanceMm: value })} /><Numeric label="Focus distance (mm)" value={optics.focusDistanceMm} min={1} onChange={(value) => setOptics({ ...optics, focusDistanceMm: value })} /></div>
          {!opticsResult.valid && <p role="alert">{opticsResult.error}</p>}
          <p className="camera-equation">v = fs/(s−f) · vf = fsf/(sf−f) · D = f/N · c = D |v−vf| / v</p>
          <table aria-label="Optics results"><tbody><tr><th scope="row">Image / focus plane</th><td>{fmt(opticsResult.imageDistanceMm)} / {fmt(opticsResult.focusImageDistanceMm)} mm</td></tr><tr><th scope="row">Aperture diameter</th><td>{fmt(opticsResult.apertureDiameterMm)} mm</td></tr><tr><th scope="row">Analytic blur circle</th><td>{fmt(opticsResult.blurCircleMm, 4)} mm</td></tr></tbody></table>
          <button type="button" onClick={() => setOptics({ fNumber: 1.4, focalLengthMm: 85, objectDistanceMm: 1800, focusDistanceMm: 3000 })}>Load Optics example</button>
        </>}
        {mode === 'stereo' && <>
          <div className="camera-control-grid"><Numeric label="Stereo focal length (px)" value={stereo.focalPx} min={1} onChange={(value) => updateStereo({ focalPx: value })} /><Numeric label="Baseline (m)" value={stereo.baselineMeters} min={0.001} step={0.01} onChange={(value) => updateStereo({ baselineMeters: value })} /><Numeric label="Disparity (px)" value={stereo.disparityPx} min={0} onChange={(value) => updateStereo({ disparityPx: value })} /><Numeric label="Reference depth (m)" value={stereo.referenceDepthMeters} min={0.001} step={0.1} onChange={(value) => updateStereo({ referenceDepthMeters: value })} /></div>
          {!stereoResult.valid && <p role="alert">{stereoResult.error}</p>}
          <p className="camera-equation">Z = fB / d · absolute error = |Z − Zref|</p>
          <table aria-label="Stereo results"><tbody><tr><th scope="row">Estimated depth</th><td>{fmt(stereoResult.depthMeters)} m</td></tr><tr><th scope="row">Absolute / relative error</th><td>{fmt(stereoResult.absoluteErrorMeters)} m / {fmt(stereoResult.relativeError === null ? null : stereoResult.relativeError * 100, 2)}%</td></tr></tbody></table>
          <button type="button" onClick={() => updateStereo({ focalPx: 840, baselineMeters: 0.16, disparityPx: 40, referenceDepthMeters: 3.5 })}>Load Stereo example</button>
        </>}
        <button className="camera-reset" type="button" onClick={reset}>Reset {modes.find((item) => item.id === mode)?.label}</button>
      </div>
      {engineer && <aside className="engineer-view" role="region" aria-label="Engineer View"><h4>Engineer View</h4><dl><div><dt>Quality tier</dt><dd>{qualityTier}</dd></div><div><dt>Frame time</dt><dd>On-demand rendering</dd></div><div><dt>Intrinsic matrix K</dt><dd><Matrix value={intrinsicsResult.K} /></dd></div><div><dt>World/object coordinate</dt><dd>{extrinsics.object.join(', ')}</dd></div><div><dt>Projected pixel</dt><dd>{extrinsicsResult.pixel?.map((value) => fmt(value, 2)).join(', ') ?? 'Rejected'}</dd></div></dl></aside>}
    </section>
  );
};

export default CameraLaboratory;
