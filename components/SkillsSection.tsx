import React from 'react';
import { CompetencyCluster } from '../types';
import SectionContainer from './SectionContainer';
import { useCardTilt } from '../hooks/useCardTilt';
import { AcademicCapIcon, CodeBracketIcon, CommandLineIcon, DevicePhoneMobileIcon, ServerStackIcon } from './icons/TechIcons';

interface SkillsSectionProps {
  id: string;
  clusters: CompetencyCluster[];
}

const accentClasses: Record<CompetencyCluster['accent'], { border: string; text: string; bg: string }> = {
  cyan: { border: 'border-cyan-400/40 hover:border-cyan-300', text: 'text-cyan-300', bg: 'bg-cyan-300/10' },
  red: { border: 'border-red-500/40 hover:border-red-400', text: 'text-red-300', bg: 'bg-red-500/10' },
  violet: { border: 'border-violet-400/40 hover:border-violet-300', text: 'text-violet-300', bg: 'bg-violet-400/10' },
  green: { border: 'border-emerald-400/40 hover:border-emerald-300', text: 'text-emerald-300', bg: 'bg-emerald-400/10' },
  amber: { border: 'border-amber-400/40 hover:border-amber-300', text: 'text-amber-300', bg: 'bg-amber-400/10' },
  blue: { border: 'border-blue-400/40 hover:border-blue-300', text: 'text-blue-300', bg: 'bg-blue-400/10' },
};

const iconByCluster: Record<string, React.ReactNode> = {
  'software-systems': <CodeBracketIcon />,
  'solution-architecture': <ServerStackIcon />,
  'ai-engineering': <AcademicCapIcon />,
  'operations-research': <CommandLineIcon />,
  cybersecurity: <DevicePhoneMobileIcon />,
  'data-product': <ServerStackIcon />,
};

const CompetencyCard: React.FC<{ cluster: CompetencyCluster }> = ({ cluster }) => {
  const cardRef = useCardTilt(8);
  const accent = accentClasses[cluster.accent];
  const icon = iconByCluster[cluster.id] ?? <CodeBracketIcon />;

  return (
    <div style={{ perspective: '600px', contain: 'layout style' }}>
      <div
        ref={cardRef}
        className={`group flex h-full flex-col rounded-lg border bg-gray-950/80 p-5 text-left shadow-2xl backdrop-blur transition-all duration-300 hover:shadow-blue-500/20 dark:hover:shadow-red-500/20 ${accent.border}`}
        style={{
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
          transition: 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.3s ease',
        }}
      >
        <div className="mb-4 flex items-start gap-3" style={{ transform: 'translateZ(14px)' }}>
          <div className={`flex h-11 w-11 flex-none items-center justify-center rounded-md border border-current/35 ${accent.bg} ${accent.text}`}>
            {React.cloneElement(icon as React.ReactElement<React.SVGProps<SVGSVGElement>>, {
              className: 'h-6 w-6',
            })}
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${accent.text}`}>Core lane</p>
            <h3 className="mt-1 text-xl font-bold leading-tight text-white">{cluster.title}</h3>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-gray-300" style={{ transform: 'translateZ(8px)' }}>
          {cluster.summary}
        </p>
        <div className="mt-5" style={{ transform: 'translateZ(6px)' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Toolkit</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {cluster.tools.map((tool) => (
              <span key={tool} className="rounded border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-300">
                {tool}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-5" style={{ transform: 'translateZ(6px)' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Proof</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {cluster.proof.map((item) => (
              <span key={item} className={`rounded border border-current/25 px-2.5 py-1 text-xs font-semibold ${accent.text} ${accent.bg}`}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const SkillsSection: React.FC<SkillsSectionProps> = ({ id, clusters }) => {
  return (
    <SectionContainer
      id={id}
      title="Core Competencies"
      subtitle="A broader map of the portfolio: software systems, cloud architecture, applied AI, operations research, security, and product analytics."
      className="bg-gray-900 dark:bg-black"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {clusters.map((cluster) => (
          <CompetencyCard key={cluster.id} cluster={cluster} />
        ))}
      </div>
    </SectionContainer>
  );
};

export default SkillsSection;
