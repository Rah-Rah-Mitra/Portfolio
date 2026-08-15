import React, { useEffect, useMemo, useState } from 'react';
import { CompetencyCluster } from '../types';
import { SECTION_IDS } from '../constants';
import SectionContainer from './SectionContainer';
import { useTheme } from '../contexts/ThemeContext';
import CameraGlyph from './CameraGlyph';

interface SkillsSectionProps {
  id: string;
  clusters: CompetencyCluster[];
}

const visionSequence = [
  'Projective geometry', 'Camera models', 'Epipolar geometry', 'Absolute pose',
  'Structure from motion', 'Bundle adjustment', 'Two-view & multi-view stereo',
];

const optimizationSequence = [
  'Operational system', 'Objectives & constraints', 'Simulation / digital twin',
  'Constraint programming', 'Graph / network optimization', 'Decision support',
];

const MethodTrajectory: React.FC<{ title: string; items: string[]; note: string; variant: 'vision' | 'optimization' }> = ({ title, items, note, variant }) => (
  <article className="method-trajectory" data-variant={variant}>
    <div className="trajectory-heading">
      <h3>{title}</h3>
      <p>{note}</p>
    </div>
    <ol>
      {items.map((item, index) => (
        <li key={item}>
          <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <strong>{item}</strong>
        </li>
      ))}
    </ol>
  </article>
);

const SkillsSection: React.FC<SkillsSectionProps> = ({ id, clusters }) => {
  const { theme } = useTheme();
  const [activeDomainId, setActiveDomainId] = useState('');
  const orderedClusters = useMemo(() => {
    const priority = theme === 'dark'
      ? ['cybersecurity', 'software-systems', 'solution-architecture', 'ai-engineering', 'operations-research', 'data-product']
      : ['software-systems', 'ai-engineering', 'operations-research', 'solution-architecture', 'data-product', 'cybersecurity'];
    return [...clusters].sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id));
  }, [clusters, theme]);
  const activeDomain = orderedClusters.find((cluster) => cluster.id === activeDomainId) ?? orderedClusters[0];
  const activeDomainIndex = Math.max(0, orderedClusters.findIndex((cluster) => cluster.id === activeDomain?.id));

  useEffect(() => {
    if (activeDomain && activeDomain.id !== activeDomainId) setActiveDomainId(activeDomain.id);
  }, [activeDomain, activeDomainId]);

  return (
    <SectionContainer
      id={id}
      title="Engineering across the intelligent-systems stack"
      subtitle="A connected capability map: mathematical modeling and perception foundations inform optimization; software, architecture, and security turn those decisions into operating systems."
      className="domains-section"
    >
      <div className="domain-observatory">
        <div className="domain-spine" aria-hidden="true">
          <span>observe</span><i /><span>model</span><i /><span>decide</span><i /><span>build</span><i /><span>secure</span>
        </div>
        <div className="domain-camera-array" role="tablist" aria-label="Engineering capability viewpoints">
          {orderedClusters.map((cluster, index) => (
            <button
              key={cluster.id}
              id={`domain-tab-${cluster.id}`}
              type="button"
              role="tab"
              aria-selected={cluster.id === activeDomain?.id}
              aria-controls="domain-panel"
              onClick={() => setActiveDomainId(cluster.id)}
            >
              <CameraGlyph angle={(index - 2.5) * 4} />
              <span>{cluster.title}</span>
            </button>
          ))}
        </div>
        {activeDomain && (
          <article
            key={activeDomain.id}
            id="domain-panel"
            className="domain-focus-view"
            data-domain={activeDomain.id}
            role="tabpanel"
            aria-labelledby={`domain-tab-${activeDomain.id}`}
          >
            <div className="domain-focus-heading">
              <span>Observation D{String(activeDomainIndex + 1).padStart(2, '0')}</span>
              <h3>{activeDomain.title}</h3>
              <p>{activeDomain.summary}</p>
            </div>
            <dl>
              <div><dt>Methods</dt><dd>{activeDomain.tools.join(' · ')}</dd></div>
              <div><dt>Evidence</dt><dd>{activeDomain.proof.join(' · ')}</dd></div>
            </dl>
          </article>
        )}
      </div>

      <div id={SECTION_IDS.SKILLS} className="foundation-bridges" aria-label="Technical methods and mathematical foundations">
        <MethodTrajectory
          title="3D vision → spatial intelligence"
          items={visionSequence}
          variant="vision"
          note="NUS CS4277 foundations, recognized with the Certificate of Outstanding Performance as top student in a class of 24. These foundations motivate Rahul's interest in localisation, mapping, uncertainty, and spatial computing; they are not presented as professional SLAM delivery."
        />
        <MethodTrajectory
          title="Operations research → operating decisions"
          items={optimizationSequence}
          variant="optimization"
          note="Constraint programming, hybrid flow-shop scheduling, simulation, graph optimization, and digital twins connect mathematical structure to deployment-oriented decision support."
        />
      </div>
    </SectionContainer>
  );
};

export default SkillsSection;
