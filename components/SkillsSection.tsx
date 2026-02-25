import React from 'react';
import { SkillItem } from '../types';
import SectionContainer from './SectionContainer';
import { useCardTilt } from '../hooks/useCardTilt';

interface SkillsSectionProps {
  id: string;
  skills: SkillItem[];
}

const SkillCard: React.FC<{ skill: SkillItem }> = ({ skill }) => {
  const cardRef = useCardTilt(8);
  return (
    <div style={{ perspective: '600px', contain: 'layout style' }}>
      <div
        ref={cardRef}
        className="bg-gray-800 dark:bg-gray-900 p-6 rounded-lg shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-red-500/20 flex flex-col items-center justify-center group"
        style={{
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
          transition: 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.3s ease',
        }}
      >
        {skill.icon && (
          <div
            className="text-blue-400 dark:text-red-400 mb-3"
            style={{ transform: 'translateZ(16px)' }}
          >
            {React.cloneElement(skill.icon as React.ReactElement<React.SVGProps<SVGSVGElement>>, {
              className: 'w-10 h-10 sm:w-12 sm:h-12',
            })}
          </div>
        )}
        <h4
          className="text-sm sm:text-base font-semibold text-gray-200 text-center"
          style={{ transform: 'translateZ(8px)' }}
        >
          {skill.name}
        </h4>
      </div>
    </div>
  );
};

const SkillsSection: React.FC<SkillsSectionProps> = ({ id, skills }) => {
  return (
    <SectionContainer
      id={id}
      title="Core Competencies"
      subtitle="A versatile, depth-first skillset spanning agentic AI, adversarial security, high-performance computing, and systems engineering."
      className="bg-gray-900 dark:bg-black"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-6 md:gap-8 text-center">
        {skills.map((skill) => (
          <SkillCard key={skill.id} skill={skill} />
        ))}
      </div>
    </SectionContainer>
  );
};

export default SkillsSection;
