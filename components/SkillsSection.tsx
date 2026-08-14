import React, { useMemo } from 'react';
import { CompetencyCluster } from '../types';
import { SECTION_IDS } from '../constants';
import SectionContainer from './SectionContainer';
import { useTheme } from '../contexts/ThemeContext';

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
  const orderedClusters = useMemo(() => {
    const priority = theme === 'dark'
      ? ['cybersecurity', 'software-systems', 'solution-architecture', 'ai-engineering', 'operations-research', 'data-product']
      : ['software-systems', 'ai-engineering', 'operations-research', 'solution-architecture', 'data-product', 'cybersecurity'];
    return [...clusters].sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id));
  }, [clusters, theme]);

  return (
    <SectionContainer
      id={id}
      title="Engineering across the intelligent-systems stack"
      subtitle="A connected capability map: mathematical modeling and perception foundations inform optimization; software, architecture, and security turn those decisions into operating systems."
      className="domains-section"
    >
      <div className="domain-map">
        <div className="domain-spine" aria-hidden="true">
          <span>observe</span><i /><span>model</span><i /><span>decide</span><i /><span>build</span><i /><span>secure</span>
        </div>
        <div className="domain-list">
          {orderedClusters.map((cluster, index) => (
            <article key={cluster.id} data-domain={cluster.id}>
              <span className="domain-coordinate" aria-hidden="true">D{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>{cluster.title}</h3>
                <p>{cluster.summary}</p>
              </div>
              <dl>
                <div><dt>Methods</dt><dd>{cluster.tools.join(' · ')}</dd></div>
                <div><dt>Evidence</dt><dd>{cluster.proof.join(' · ')}</dd></div>
              </dl>
            </article>
          ))}
        </div>
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
