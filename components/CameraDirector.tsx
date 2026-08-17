import React, { useState } from 'react';
import type { CameraShotDefinition } from '../types';
import { validateCameraShotDefinitions } from '../world/narrativeManifest';

const CameraDirector: React.FC<{ shot: CameraShotDefinition; onChange: (shot: CameraShotDefinition) => void }> = ({ shot, onChange }) => {
  const [message, setMessage] = useState('Development-only authoring surface');
  const exportJson = JSON.stringify(shot, null, 2);
  const copy = async () => {
    if (!validateCameraShotDefinitions([shot]).valid) { setMessage('Shot is invalid; correct it before export.'); return; }
    await navigator.clipboard.writeText(exportJson); setMessage('Validated shot copied.');
  };
  const download = () => {
    if (!validateCameraShotDefinitions([shot]).valid) { setMessage('Shot is invalid; correct it before export.'); return; }
    const url = URL.createObjectURL(new Blob([exportJson], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${shot.id}.camera-shot.json`; anchor.click(); URL.revokeObjectURL(url); setMessage('Validated shot downloaded.');
  };
  const number = (label: string, value: number, update: (value: number) => void, options?: { min?: number; max?: number; step?: number }) => <label>{label}<input type="number" value={value} min={options?.min} max={options?.max} step={options?.step ?? .01} onChange={(event) => update(Number(event.target.value))} /></label>;
  const vector = (label: string, value: [number, number, number], key: 'position' | 'target') => <fieldset><legend>{label}</legend>{(['X', 'Y', 'Z'] as const).map((axis, index) => number(axis, value[index], (next) => { const changed = [...value] as [number, number, number]; changed[index] = next; onChange({ ...shot, [key]: changed }); }))}</fieldset>;
  const lighting = shot.lighting ?? { key: 3, fill: 2.1, environment: 1, keyColor: '#ffffff', fillColor: '#ffffff' };
  const framing = shot.characterFraming ?? { scale: 1, offset: [0, 0, 0] as [number, number, number] };
  const orbit = shot.orbitLimits ?? { azimuth: [-.6, .6] as [number, number], polar: [.6, 1.5] as [number, number], distance: [4, 10] as [number, number] };
  return <aside className="camera-director" aria-label="Development camera director"><strong>Camera Director · DEV</strong>
    {vector('Position', shot.position, 'position')}{vector('Look-at target', shot.target, 'target')}
    {number('FOV', shot.fov, (value) => onChange({ ...shot, fov: value }), { min: 6, max: 119 })}{number('Near', shot.near, (value) => onChange({ ...shot, near: value }), { min: .001 })}{number('Far', shot.far, (value) => onChange({ ...shot, far: value }), { min: 1 })}
    {number('Roll', shot.roll ?? 0, (value) => onChange({ ...shot, roll: value }))}{number('Focus distance', shot.focusDistance ?? 6, (value) => onChange({ ...shot, focusDistance: value }), { min: .01 })}{number('Dolly distance', shot.dollyDistance ?? 6, (value) => onChange({ ...shot, dollyDistance: value }), { min: .01 })}{number('Exposure', shot.exposure ?? 1, (value) => onChange({ ...shot, exposure: value }), { min: 0 })}
    {number('Scroll start', shot.scrollRange[0], (value) => onChange({ ...shot, scrollRange: [value, shot.scrollRange[1]] }), { min: 0, max: 1 })}{number('Scroll end', shot.scrollRange[1], (value) => onChange({ ...shot, scrollRange: [shot.scrollRange[0], value] }), { min: 0, max: 1 })}
    {number('Transition seconds', shot.transition.duration, (value) => onChange({ ...shot, transition: { ...shot.transition, duration: value } }), { min: 0, max: .45 })}<label>Transition easing<input value={shot.transition.easing} onChange={(event) => onChange({ ...shot, transition: { ...shot.transition, easing: event.target.value } })} /></label>
    {number('Key light', lighting.key, (value) => onChange({ ...shot, lighting: { ...lighting, key: value } }), { min: 0 })}<label>Key light color<input type="color" value={lighting.keyColor ?? '#ffffff'} onChange={(event) => onChange({ ...shot, lighting: { ...lighting, keyColor: event.target.value } })} /></label>
    {number('Fill light', lighting.fill, (value) => onChange({ ...shot, lighting: { ...lighting, fill: value } }), { min: 0 })}<label>Fill light color<input type="color" value={lighting.fillColor ?? '#ffffff'} onChange={(event) => onChange({ ...shot, lighting: { ...lighting, fillColor: event.target.value } })} /></label>
    {number('Environment', lighting.environment, (value) => onChange({ ...shot, lighting: { ...lighting, environment: value } }), { min: 0 })}
    {number('Character scale', framing.scale, (value) => onChange({ ...shot, characterFraming: { ...framing, scale: value } }), { min: .1 })}
    {(['X', 'Y', 'Z'] as const).map((axis, index) => number(`Character offset ${axis}`, framing.offset[index], (value) => { const offset = [...framing.offset] as [number, number, number]; offset[index] = value; onChange({ ...shot, characterFraming: { ...framing, offset } }); }))}
    {number('Orbit azimuth min', orbit.azimuth[0], (value) => onChange({ ...shot, orbitLimits: { ...orbit, azimuth: [value, orbit.azimuth[1]] } }))}{number('Orbit azimuth max', orbit.azimuth[1], (value) => onChange({ ...shot, orbitLimits: { ...orbit, azimuth: [orbit.azimuth[0], value] } }))}
    {number('Orbit polar min', orbit.polar[0], (value) => onChange({ ...shot, orbitLimits: { ...orbit, polar: [value, orbit.polar[1]] } }))}{number('Orbit polar max', orbit.polar[1], (value) => onChange({ ...shot, orbitLimits: { ...orbit, polar: [orbit.polar[0], value] } }))}
    {number('Orbit distance min', orbit.distance[0], (value) => onChange({ ...shot, orbitLimits: { ...orbit, distance: [value, orbit.distance[1]] } }), { min: .1 })}{number('Orbit distance max', orbit.distance[1], (value) => onChange({ ...shot, orbitLimits: { ...orbit, distance: [orbit.distance[0], value] } }), { min: .1 })}
    <label>Safe text region IDs<input value={(shot.safeTextRegionIds ?? []).join(', ')} onChange={(event) => onChange({ ...shot, safeTextRegionIds: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label>
    <details><summary>Responsive overrides</summary><textarea rows={5} defaultValue={JSON.stringify(shot.responsive ?? {}, null, 2)} aria-label="Responsive override JSON" onBlur={(event) => { try { const candidate = { ...shot, responsive: JSON.parse(event.target.value) }; if (!validateCameraShotDefinitions([candidate]).valid) { setMessage('Responsive override is invalid.'); return; } onChange(candidate); setMessage('Responsive overrides parsed.'); } catch { setMessage('Responsive override JSON is invalid.'); } }} /></details>
    <button type="button" onClick={copy}>Copy shot JSON</button><button type="button" onClick={download}>Download shot JSON</button><output>{message}</output></aside>;
};

export default CameraDirector;
