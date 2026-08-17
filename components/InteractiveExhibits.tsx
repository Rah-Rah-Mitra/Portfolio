import React, { useMemo, useRef, useState } from 'react';
import type { PortfolioWorldEvent } from '../types';
import { resumeProfiles, unifiedPortfolioData } from '../portfolioData';
import { InteractionArbitrator } from '../lib/InteractionArbitrator';
import {
  createFlowShopState,
  FLOW_SHOP_PROCESSING_TIMES,
  FlowShopJobId,
  reorderFlowShopJob,
  resetFlowShopState,
} from '../lib/flowShop';
import {
  createSpatialState,
  moveSpatialMarker,
  resetSpatialState,
  SpatialOverlay,
  toggleSpatialOverlay,
} from '../lib/spatialAllocation';

type WorldEventHandler = (event: PortfolioWorldEvent) => void;

const publishWorldEvent = (event: PortfolioWorldEvent, handler?: WorldEventHandler) => {
  handler?.(event);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<PortfolioWorldEvent>('portfolio:world-event', { detail: event }));
  }
};

const ResetButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button className="exhibit-reset" type="button" onClick={onClick}>{label}</button>
);

export const FlowShopExhibit: React.FC<{ onWorldEvent?: WorldEventHandler }> = ({ onWorldEvent }) => {
  const [state, setState] = useState(createFlowShopState);
  const [message, setMessage] = useState('A-B-C is the reference order. Reorder one job to compare the computed schedule.');
  const [inspectedOperation, setInspectedOperation] = useState(state.schedule.criticalOperationId);
  const dragJob = useRef<FlowShopJobId | null>(null);

  const moveJob = (fromIndex: number, toIndex: number) => {
    const next = reorderFlowShopJob(state, fromIndex, toIndex);
    if (next === state || next.order.join('') === state.order.join('')) return;
    const delta = next.schedule.makespan - state.schedule.makespan;
    setState(next);
    setInspectedOperation(next.schedule.criticalOperationId);
    setMessage(delta === 0
      ? `The order is now ${next.order.join('-')}; the makespan remains ${next.schedule.makespan}.`
      : `The order is now ${next.order.join('-')}; the makespan is ${Math.abs(delta) === 1 ? 'one' : Math.abs(delta)} time unit${Math.abs(delta) === 1 ? '' : 's'} ${delta < 0 ? 'lower' : 'higher'}.`);
    publishWorldEvent({
      type: 'JOB_REORDERED',
      oldMakespan: state.schedule.makespan,
      newMakespan: next.schedule.makespan,
      makespanDelta: delta,
      order: next.order,
    }, onWorldEvent);
  };

  const reset = () => {
    const next = resetFlowShopState(state);
    setState(next);
    setInspectedOperation(next.schedule.criticalOperationId);
    setMessage('The synthetic schedule returned to A-B-C. Makespan and machine idle time were recomputed.');
    publishWorldEvent({ type: 'INTERACTION_RESET', sceneId: 'systems-in-motion', source: 'visitor' }, onWorldEvent);
  };

  const inspected = state.schedule.operations.find((operation) => operation.id === inspectedOperation);

  return (
    <section className="interactive-exhibit flow-shop-exhibit" aria-labelledby="flow-shop-title" role="region">
      <header className="exhibit-heading">
        <div><h4 id="flow-shop-title">Systems in Motion</h4><p>Three jobs · two machines · deterministic permutation flow shop</p></div>
        <ResetButton label="Reset schedule" onClick={reset} />
      </header>
      <p className="exhibit-disclaimer">A miniature model linked to the <a href="#selected-hybrid-flow-shop-digital-twin">Hybrid Flow Shop case study</a>. Processing times and constraints are synthetic; Abbott operating data is not reproduced.</p>
      <p className="exhibit-hint">Drag a job handle, or use Move earlier / Move later. Focus an operation to inspect its precedence.</p>

      <div className="job-order" aria-label="Flow-shop job order">
        {state.order.map((job, index) => (
          <div key={job} className="job-order-row">
            <button
              type="button"
              className="job-drag-handle"
              draggable
              aria-label={`Drag job ${job}`}
              onDragStart={(event) => { dragJob.current = job; event.dataTransfer.setData('text/plain', job); }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const source = (event.dataTransfer.getData('text/plain') || dragJob.current) as FlowShopJobId;
                moveJob(state.order.indexOf(source), index);
                dragJob.current = null;
              }}
            >Job {job}<span>M1 {FLOW_SHOP_PROCESSING_TIMES[job].M1} · M2 {FLOW_SHOP_PROCESSING_TIMES[job].M2}</span></button>
            <div>
              <button type="button" disabled={index === 0} aria-label={`Move job ${job} earlier`} onClick={() => moveJob(index, index - 1)}>Earlier</button>
              <button type="button" disabled={index === state.order.length - 1} aria-label={`Move job ${job} later`} onClick={() => moveJob(index, index + 1)}>Later</button>
            </div>
          </div>
        ))}
      </div>

      <dl className="exhibit-metrics">
        <div><dt>Order</dt><dd>{state.order.join(' → ')}</dd></div>
        <div><dt>Result</dt><dd>Makespan {state.schedule.makespan}</dd></div>
        <div><dt>M1 idle</dt><dd>{state.schedule.machineIdle.M1}</dd></div>
        <div><dt>M2 idle</dt><dd>{state.schedule.machineIdle.M2}</dd></div>
      </dl>

      <div className="gantt-bars" aria-hidden="true" style={{ '--schedule-span': state.schedule.makespan } as React.CSSProperties}>
        {(['M1', 'M2'] as const).map((machine) => (
          <div key={machine} className="gantt-track">
            <span>{machine}</span>
            <div>{state.schedule.operations.filter((operation) => operation.machine === machine).map((operation) => (
              <i key={operation.id} className={operation.critical ? 'is-critical' : ''} style={{ left: `${operation.start / state.schedule.makespan * 100}%`, width: `${operation.duration / state.schedule.makespan * 100}%` }}>{operation.job}</i>
            ))}</div>
          </div>
        ))}
      </div>

      <table className="exhibit-table gantt-table">
        <caption>Accessible two-machine Gantt schedule, in synthetic time units</caption>
        <thead><tr><th scope="col">Job</th><th scope="col">M1 start–end</th><th scope="col">M2 start–end</th></tr></thead>
        <tbody>{state.order.map((job) => {
          const m1 = state.schedule.operations.find((operation) => operation.id === `${job}-M1`)!;
          const m2 = state.schedule.operations.find((operation) => operation.id === `${job}-M2`)!;
          return <tr key={job}><th scope="row">{job}</th>{[m1, m2].map((operation) => <td key={operation.id}><button type="button" onMouseEnter={() => setInspectedOperation(operation.id)} onFocus={() => setInspectedOperation(operation.id)}>{operation.start}–{operation.end}{operation.critical ? ' · critical final' : ''}</button></td>)}</tr>;
        })}</tbody>
      </table>
      <p className="exhibit-inspection">{inspected?.id}: starts at {inspected?.start}, finishes at {inspected?.end}. {inspected?.predecessorIds.length ? `Predecessors: ${inspected.predecessorIds.join(' and ')}.` : 'No predecessor; this begins the schedule.'}</p>
      <p className="exhibit-response" role="status">{message} Courier response: the guide points to {state.schedule.criticalOperationId}, the final bottleneck operation.</p>
    </section>
  );
};

export const SpatialSystemsExhibit: React.FC<{ onWorldEvent?: WorldEventHandler }> = ({ onWorldEvent }) => {
  const [state, setState] = useState(createSpatialState);
  const [message, setMessage] = useState('North is the nearest eligible plot from marker [45, 44].');
  const arbitrator = useRef(new InteractionArbitrator((event) => publishWorldEvent(event, onWorldEvent)));
  const activePointerId = useRef<number | null>(null);

  const updateMarker = (coordinates: [number, number]) => {
    const next = moveSpatialMarker(state, coordinates);
    const distance = next.distances.find(({ plot }) => plot.id === next.nearestEligible.id)?.distance ?? 0;
    setState(next);
    setMessage(`${next.nearestEligible.label} is the nearest eligible plot from marker [${next.marker.join(', ')}], at ${distance.toFixed(2)} units.`);
    publishWorldEvent({ type: 'MAP_MARKER_MOVED', markerId: 'allocation-marker', coordinates: next.marker, selectedPlot: next.nearestEligible.id, distance }, onWorldEvent);
  };

  const changeOverlay = (overlay: SpatialOverlay) => {
    const next = toggleSpatialOverlay(state, overlay);
    setState(next);
    setMessage(`${overlay === 'eligibility' ? 'Eligibility' : 'Capacity'} overlay ${next.overlays[overlay] ? 'shown' : 'hidden'}; route selection still uses eligible plots only.`);
    publishWorldEvent({ type: 'INTERACTION_CHANGED', sceneId: 'spatial-systems', source: 'visitor', detail: `${overlay}:${next.overlays[overlay]}` }, onWorldEvent);
  };

  const reset = () => {
    const next = resetSpatialState(state);
    setState(next);
    setMessage('North is the nearest eligible plot from marker [45, 44]. The overlays are off.');
    arbitrator.current.scrollOut();
    publishWorldEvent({ type: 'INTERACTION_RESET', sceneId: 'spatial-systems', source: 'visitor' }, onWorldEvent);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      if (activePointerId.current !== null && event.currentTarget.hasPointerCapture?.(activePointerId.current)) {
        event.currentTarget.releasePointerCapture?.(activePointerId.current);
      }
      activePointerId.current = null;
      arbitrator.current.escape();
      event.currentTarget.blur();
      return;
    }
    const intent = arbitrator.current.keyboardIntent(event.key, event.shiftKey);
    if (!intent) return;
    event.preventDefault();
    const next: [number, number] = [...state.marker];
    next[intent.axis === 'x' ? 0 : 1] += intent.delta;
    updateMarker(next);
  };

  return (
    <section className="interactive-exhibit spatial-exhibit" aria-labelledby="spatial-systems-title" role="region">
      <header className="exhibit-heading"><div><h4 id="spatial-systems-title">Spatial Systems</h4><p>Marker-to-plot allocation · coordinate field 0–100</p></div><ResetButton label="Reset spatial exhibit" onClick={reset} /></header>
      <p className="exhibit-disclaimer">This is a synthetic allocation illustration inspired by civic spatial reasoning, not Churp’s production algorithm. <a href="#selected-churp">Read the factual Churp case study.</a></p>
      <p className="exhibit-hint">Use the X/Y controls or drag the square marker. Arrow keys move one unit; Shift + Arrow moves ten.</p>
      <div className="spatial-control-grid">
        <div className="spatial-ranges">
          <label>Marker X coordinate <output aria-hidden="true">{state.marker[0]}</output><input aria-label="Marker X coordinate" type="range" min="0" max="100" value={state.marker[0]} onChange={(event) => updateMarker([Number(event.target.value), state.marker[1]])} /></label>
          <label>Marker Y coordinate <output aria-hidden="true">{state.marker[1]}</output><input aria-label="Marker Y coordinate" type="range" min="0" max="100" value={state.marker[1]} onChange={(event) => updateMarker([state.marker[0], Number(event.target.value)])} /></label>
          <div className="overlay-controls">
            {(['eligibility', 'capacity'] as const).map((overlay) => <button key={overlay} type="button" aria-pressed={state.overlays[overlay]} onClick={() => changeOverlay(overlay)}>{state.overlays[overlay] ? 'Hide' : 'Show'} {overlay} overlay</button>)}
          </div>
        </div>
        <div className="spatial-map" data-eligibility={state.overlays.eligibility} data-capacity={state.overlays.capacity}>
          <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <line x1={state.route.from[0]} y1={state.route.from[1]} x2={state.route.to[0]} y2={state.route.to[1]} />
            {state.distances.map(({ plot, nearestEligibleRegion }) => <g key={plot.id} className={`${plot.eligible ? 'is-eligible' : 'is-ineligible'} ${nearestEligibleRegion ? 'is-nearest' : ''}`}><circle cx={plot.coordinate[0]} cy={plot.coordinate[1]} r={state.overlays.capacity ? plot.capacity + 2 : 3} /><text x={plot.coordinate[0]} y={plot.coordinate[1] - 5}>{plot.label}</text></g>)}
          </svg>
          <button
            type="button"
            className="spatial-marker"
            aria-label="Move allocation marker"
            style={{ left: `${state.marker[0]}%`, top: `${state.marker[1]}%` }}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => {
              activePointerId.current = event.pointerId;
              arbitrator.current.pointerDown({ pointerId: event.pointerId, x: event.clientX, y: event.clientY }, 'spatial-systems');
            }}
            onPointerMove={(event) => {
              const intent = arbitrator.current.pointerMove({ pointerId: event.pointerId, x: event.clientX, y: event.clientY });
              if (!intent.preventDefault) return;
              event.preventDefault();
              if (intent.capturePointer && !event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.setPointerCapture?.(event.pointerId);
              const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
              if (bounds?.width && bounds.height) updateMarker([(event.clientX - bounds.left) / bounds.width * 100, (event.clientY - bounds.top) / bounds.height * 100]);
            }}
            onPointerUp={() => { activePointerId.current = null; arbitrator.current.pointerUp(); }}
            onPointerCancel={() => { activePointerId.current = null; arbitrator.current.pointerCancel(); }}
            onBlur={() => arbitrator.current.focusLost()}
          ><span aria-hidden="true" /></button>
        </div>
      </div>
      <table className="exhibit-table spatial-table">
        <caption>Synthetic plot distances and nearest-region relationship</caption>
        <thead><tr><th scope="col">Plot</th><th scope="col">Coordinate</th><th scope="col">Eligible</th><th scope="col">Capacity</th><th scope="col">Distance</th><th scope="col">Region</th></tr></thead>
        <tbody>{state.distances.map(({ plot, distance, nearestEligibleRegion }) => <tr key={plot.id}><th scope="row">{plot.label}</th><td>[{plot.coordinate.join(', ')}]</td><td>{plot.eligible ? 'Yes' : 'No'}</td><td>{plot.capacity}</td><td>{distance.toFixed(2)}</td><td>{nearestEligibleRegion ? 'Nearest eligible' : plot.eligible ? 'Eligible alternative' : 'Excluded'}</td></tr>)}</tbody>
      </table>
      <p className="exhibit-response" role="status">{message} Courier response: the guide inspects the marker and follows the revised straight-line route.</p>
    </section>
  );
};

const flowShopStages = [
  { id: 'operating-constraints', label: 'Operating constraints', explanation: 'Frame machine sequence, processing windows, and the decisions the schedule must support.' },
  { id: 'simpy-event-model', label: 'SimPy event model', explanation: 'Represent events and resource interactions in a discrete-event simulation.' },
  { id: 'cp-sat-schedule', label: 'CP-SAT schedule', explanation: 'Solve the encoded scheduling problem and inspect the selected assignment.' },
  { id: 'validation-outputs', label: 'Validation outputs', explanation: 'Compare schedule outputs with simulation evidence and operational checks.' },
  { id: 'decision-ready-schedule', label: 'Decision-ready schedule', explanation: 'Package the result for human review and operational decision-making.' },
] as const;

const onTheSpectrumLayers = [
  { id: 'blender-glbs', label: 'Blender-authored/generated GLBs', explanation: 'Prepare authored and generated scene assets with controlled geometry.' },
  { id: 'python-orchestration', label: 'Python orchestration and metadata', explanation: 'Coordinate processing, scene metadata, and asset relationships.' },
  { id: 'optimized-previews', label: 'Optimized previews/assets', explanation: 'Produce lighter previews and delivery-ready assets for the web.' },
  { id: 'threejs-qa', label: 'Three.js playable-world QA', explanation: 'Validate the interactive world, browser behavior, and scene integrity.' },
] as const;

export const ProjectSystemInspector: React.FC<{
  kind: 'flow-shop' | 'on-the-spectrum';
  onWorldEvent?: WorldEventHandler;
}> = ({ kind, onWorldEvent }) => {
  const items = kind === 'flow-shop' ? flowShopStages : onTheSpectrumLayers;
  const projectId = kind === 'flow-shop' ? 'hybrid-flow-shop-digital-twin' : 'on-the-spectrum';
  const title = kind === 'flow-shop' ? 'Hybrid Flow Shop pipeline' : 'OnTheSpectrum architecture';
  const [selectedIndex, setSelectedIndex] = useState(0);

  const select = (index: number) => {
    setSelectedIndex(index);
    publishWorldEvent({ type: 'PROJECT_OPENED', projectId, selectedId: items[index].id, selectedIndex: index }, onWorldEvent);
  };

  return (
    <section className="project-system-inspector" aria-label={title}>
      <header><h4>{title}</h4><ResetButton label="Reset project diagram" onClick={() => { select(0); publishWorldEvent({ type: 'INTERACTION_RESET', sceneId: 'selected-work', source: 'visitor' }, onWorldEvent); }} /></header>
      <p className="exhibit-hint">Inspect a stage; the complete factual sequence stays visible.</p>
      <label>{kind === 'flow-shop' ? 'Pipeline stage' : 'Explode depth'}
        <input type="range" min="0" max={items.length - 1} value={selectedIndex} onChange={(event) => select(Number(event.target.value))} />
      </label>
      <div className="project-inspector-tabs" aria-label={`${title} stages`}>{items.map((item, index) => <button key={item.id} type="button" aria-pressed={selectedIndex === index} onClick={() => select(index)}>Inspect {item.label}</button>)}</div>
      <ol>{items.map((item, index) => <li key={item.id} className={selectedIndex === index ? 'is-active' : ''}><strong>{item.label}</strong><span>{item.explanation}</span></li>)}</ol>
      <p className="exhibit-response" role="status">{items[selectedIndex].label}: {items[selectedIndex].explanation} Courier response: the guide points to the active {kind === 'flow-shop' ? 'decision stage' : 'system layer'}.</p>
    </section>
  );
};

type IrisState = 'open' | 'closed' | 'calibrated';

export const DepartureIris: React.FC<{ onWorldEvent?: WorldEventHandler }> = ({ onWorldEvent }) => {
  const [state, setState] = useState<IrisState>('open');
  const generalResume = useMemo(() => resumeProfiles.find((resume) => resume.id === 'general'), []);
  const update = (next: IrisState) => {
    setState(next);
    if (next === 'closed' || next === 'calibrated') publishWorldEvent({ type: 'DEPARTURE_COMPLETED', state: next }, onWorldEvent);
  };
  const reset = () => {
    setState('open');
    publishWorldEvent({ type: 'LAB_RESET', sceneId: 'departure' }, onWorldEvent);
  };

  return (
    <section className="departure-iris" aria-labelledby="departure-iris-title">
      <div className="departure-mechanism">
        <div><h3 id="departure-iris-title">Departure calibration</h3><p>Complete the optional optical handoff or use any contact action immediately.</p></div>
        <svg viewBox="0 0 120 120" role="img" aria-label={`Six-blade optical iris, ${state}`} data-state={state}>
          <circle cx="60" cy="60" r="49" />
          {[0, 1, 2, 3, 4, 5].map((blade) => <path key={blade} data-testid="iris-blade" style={{ '--blade-index': blade } as React.CSSProperties} d="M60 18 L91 45 L62 62 L38 47 Z" />)}
          <circle className="iris-aperture" cx="60" cy="60" r={state === 'closed' ? 6 : state === 'calibrated' ? 15 : 23} />
        </svg>
      </div>
      <div className="iris-controls" aria-label="Optical iris controls">
        <button type="button" aria-pressed={state === 'open'} onClick={() => update('open')}>Open iris</button>
        <button type="button" aria-pressed={state === 'closed'} onClick={() => update('closed')}>Close iris</button>
        <button type="button" aria-pressed={state === 'calibrated'} onClick={() => update('calibrated')}>Calibrate iris</button>
        <ResetButton label="Reset iris" onClick={reset} />
      </div>
      <p className="exhibit-response" role="status">Calibration state: {state}. {state === 'calibrated' ? 'The optical signal is calibrated; the guide indicates the contact path.' : state === 'closed' ? 'The mechanism is closed; contact remains available.' : 'The mechanism is open and ready.'}</p>
      <nav className="departure-actions" aria-label="Departure contact and résumé actions">
        <a href={`mailto:${unifiedPortfolioData.contactEmail}`}>Email Rahul</a>
        {unifiedPortfolioData.githubUrl && <a href={unifiedPortfolioData.githubUrl} target="_blank" rel="noreferrer">GitHub</a>}
        {unifiedPortfolioData.linkedinUrl && <a href={unifiedPortfolioData.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn</a>}
        <a href={generalResume?.pdfUrl ?? '/resume/generated/rahul-mitra-general.pdf'} target="_blank" rel="noreferrer">General résumé</a>
      </nav>
    </section>
  );
};
