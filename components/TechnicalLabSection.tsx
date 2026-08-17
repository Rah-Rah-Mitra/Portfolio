import React from 'react';
import CameraLaboratory from './CameraLaboratory';
import type { PortfolioWorldEvent } from '../types';

const emitWorldEvent = (event: PortfolioWorldEvent) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('portfolio:world-event', { detail: event }));
};

const TechnicalLabSection: React.FC = () => (
  <section id="technical-lab" className="evidence-section technical-lab" aria-labelledby="technical-lab-title">
    <header className="evidence-heading" id="technical-lab-copy">
      <h2 id="technical-lab-title">Camera Laboratory — Synthetic Geometry Study</h2>
      <p>An interactive portfolio-site experiment, not a professional project claim.</p>
      <p>The launch study is a deterministic, local camera-geometry instrument. The separate SLAM/RADIO benchmark remains unpublished until its reproducibility and evidence gates pass.</p>
    </header>
    <CameraLaboratory onWorldEvent={emitWorldEvent} />
  </section>
);

export default TechnicalLabSection;
