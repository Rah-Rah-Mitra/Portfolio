import React from 'react';
import { SkillItem } from '../types';
import SectionContainer from './SectionContainer';

interface SkillsSectionProps {
  id: string;
  skills: SkillItem[];
}

const SkillsSection: React.FC<SkillsSectionProps> = ({ id, skills }) => {
  return (
    <SectionContainer 
      id={id} 
      title="Core Competencies"
      subtitle="A versatile skillset honed through diverse projects and continuous learning. I thrive on mastering new technologies and applying them to create innovative solutions."
      className="bg-gray-900 dark:bg-black"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 md:gap-8 text-center">
        {skills.map((skill) => (
          <div 
            key={skill.id} 
            className="bg-gray-800 dark:bg-gray-900 p-6 rounded-lg shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-red-500/20 transform hover:scale-105 transition-all duration-300 flex flex-col items-center justify-center"
          >
            {skill.icon && (
              <div className="text-blue-400 dark:text-red-400 mb-3">
                {React.cloneElement(skill.icon as React.ReactElement<React.SVGProps<SVGSVGElement>>, { 
                  className: 'w-10 h-10 sm:w-12 sm:h-12' 
                })}
              </div>
            )}
            <h4 className="text-sm sm:text-base font-semibold text-gray-200">{skill.name}</h4>
          </div>
        ))}
      </div>
    </SectionContainer>
  );
};

export default SkillsSection;
