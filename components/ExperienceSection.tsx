
import React from 'react';
import { ExperienceItem } from '../types';
import SectionContainer from './SectionContainer';
import { BriefcaseIcon, CalendarDaysIcon } from './icons/GenericIcons';
import BreakableText from './BreakableText';

interface ExperienceSectionProps {
  id: string;
  experiences: ExperienceItem[];
}

const ExperienceItemCard: React.FC<{ item: ExperienceItem }> = ({ item }) => {
  return (
    <div className="relative pl-12 md:pl-16 pb-10 border-l-2 border-emerald-500 last:border-l-transparent last:pb-0">
      {/* Timeline Dot */}
      <div className="absolute -left-[9px] top-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-gray-900"></div>
      
      <div className="flex items-start mb-2">
        {item.logoUrl && (
          <img src={item.logoUrl} alt={`${item.company} logo`} className="w-10 h-10 rounded-full mr-4 object-contain bg-white p-0.5" />
        )}
        <div>
          <h3 className="text-xl font-semibold text-white"><BreakableText text={item.role}/></h3>
          <p className="text-emerald-400 font-medium"><BreakableText text={item.company}/></p>
        </div>
      </div>
      
      <p className="text-sm text-gray-400 mb-3 flex items-center">
        <CalendarDaysIcon className="w-4 h-4 mr-1.5" />
        {item.duration}
      </p>
      
      <ul className="list-disc list-outside pl-5 space-y-1.5 text-gray-300 text-sm">
        {item.responsibilities.map((resp, index) => (
          <li key={index}><BreakableText text={resp}/></li>
        ))}
      </ul>
    </div>
  );
};


const ExperienceSection: React.FC<ExperienceSectionProps> = ({ id, experiences }) => {
  return (
    <SectionContainer 
      id={id} 
      title="Career Journey"
      subtitle="Tracing my professional path, highlighting key roles and contributions that have shaped my expertise."
      className="bg-gray-800"
    >
      <div className="max-w-3xl mx-auto">
        {experiences.map((exp) => (
          <ExperienceItemCard key={exp.id} item={exp} />
        ))}
      </div>
    </SectionContainer>
  );
};

export default ExperienceSection;