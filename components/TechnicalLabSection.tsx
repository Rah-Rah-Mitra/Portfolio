import React, { useEffect, useMemo, useState } from 'react';
import { technicalDemo } from '../fieldTestData';
import { TechnicalDemoLayer } from '../types';
import { track } from '../lib/analytics';

interface StudyPayload {
  frameCount: number;
  detectedObjects: number;
  trackedKeypoints: number;
  poseInliers: number;
  medianReprojectionPx: number;
  trajectoryErrorPercent: number;
  knownTrajectory: number[][];
  estimatedTrajectory: number[][];
  methods: string[];
}

const layerAssets: Partial<Record<TechnicalDemoLayer['id'], string>> = {
  rgb: '/lab/rgb.webp',
  detection: '/lab/detection.webp',
  segmentation: '/lab/segmentation.webp',
  features: '/lab/dense-flow.webp',
  matches: '/lab/matches.webp',
};

const trajectoryPath = (points: number[][], width: number, height: number) => {
  if (points.length === 0) return '';
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.025, maxY - minY);
  return points.map((point, index) => {
    const x = 40 + ((point[0] - minX) / spanX) * (width - 80);
    const y = height / 2 - ((point[1] - minY) / spanY - 0.5) * (height - 90);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
};

const TechnicalLabSection: React.FC = () => {
  const [activeLayerId, setActiveLayerId] = useState<TechnicalDemoLayer['id']>('rgb');
  const [study, setStudy] = useState<StudyPayload | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/lab/study.json')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Study data unavailable')))
      .then((payload: StudyPayload) => { if (active) setStudy(payload); })
      .catch(() => { /* The static explanatory fallback remains complete. */ });
    return () => { active = false; };
  }, []);

  const activeLayer = technicalDemo.layers.find((layer) => layer.id === activeLayerId) ?? technicalDemo.layers[0];
  const metrics = useMemo(() => study ? [
    { label: 'Synthetic frames', value: String(study.frameCount) },
    { label: 'ORB matches', value: study.trackedKeypoints.toLocaleString() },
    { label: 'Median reprojection', value: `${study.medianReprojectionPx.toFixed(2)} px` },
    { label: 'Trajectory error', value: `${study.trajectoryErrorPercent.toFixed(2)}%` },
  ] : technicalDemo.metrics, [study]);

  const selectLayer = (layer: TechnicalDemoLayer) => {
    setActiveLayerId(layer.id);
    track('technical_layer_changed', { layer: layer.id, method: layer.method });
  };

  return (
    <section id="technical-lab" className="evidence-section technical-lab" aria-labelledby="technical-lab-title">
      <header className="evidence-heading">
        <h2 id="technical-lab-title">{technicalDemo.title}</h2>
        <p>{technicalDemo.disclaimer}</p>
      </header>

      <div className="lab-console">
        <div className="lab-layer-tabs" role="tablist" aria-label="Technical study layers">
          {technicalDemo.layers.map((layer) => (
            <button
              key={layer.id}
              type="button"
              role="tab"
              aria-selected={layer.id === activeLayer.id}
              aria-controls="technical-layer-panel"
              onClick={() => selectLayer(layer)}
            >
              <span>{layer.label}</span>
              <small>{layer.method}</small>
            </button>
          ))}
        </div>

        <div id="technical-layer-panel" className="lab-viewport" role="tabpanel">
          {layerAssets[activeLayer.id] ? (
            <img
              src={layerAssets[activeLayer.id]}
              alt={`${activeLayer.label} output from the synthetic calibration study`}
              width="960"
              height="540"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <svg viewBox="0 0 720 360" role="img" aria-label="Known and estimated synthetic camera trajectories">
              <defs>
                <pattern id="lab-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                  <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#dfe5e3" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="720" height="360" fill="#f8faf9" />
              <rect width="720" height="360" fill="url(#lab-grid)" />
              <path d={trajectoryPath(study?.knownTrajectory ?? [], 720, 360)} fill="none" stroke="#263432" strokeWidth="4" />
              <path d={trajectoryPath(study?.estimatedTrajectory ?? [], 720, 360)} fill="none" stroke="#167a72" strokeWidth="3" strokeDasharray="8 7" />
              <text x="34" y="42" fill="#263432" fontSize="16">KNOWN POSE</text>
              <text x="34" y="68" fill="#167a72" fontSize="16">ESTIMATED POSE</text>
            </svg>
          )}
          <div className="lab-layer-copy">
            <strong>{activeLayer.method}</strong>
            <p>{activeLayer.description}</p>
          </div>
        </div>
      </div>

      <dl className="lab-metrics">
        {metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
      </dl>

      <div className="lab-provenance">
        <p>{technicalDemo.provenance}</p>
        <p><strong>Current implementation:</strong> OpenCV contour detection, HSV segmentation, ORB, RANSAC essential-matrix recovery, triangulation, and dense optical flow. C-RADIOv4-SO400M remains a separately benchmarked enhancement, not a claimed output.</p>
      </div>
    </section>
  );
};

export default TechnicalLabSection;
