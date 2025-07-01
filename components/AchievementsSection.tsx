
import React from 'react';
import { AchievementItem } from '../types';
import AchievementCard from './AchievementCard';
import SectionContainer from './SectionContainer';

interface AchievementsSectionProps {
  id: string;
  achievements: AchievementItem[];
}

const AchievementsSection: React.FC<AchievementsSectionProps> = ({ id, achievements }) => {
  return (
    <SectionContainer 
      id={id} 
      title="My Achievements" 
      subtitle="A showcase of projects I've built, problems I've solved, and milestones I've reached."
      className="bg-gray-800 dark:bg-gray-900"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
        {achievements.map((achievement, index) => (
          <AchievementCard key={achievement.id} achievement={achievement} index={index} />
        ))}
      </div>
    </SectionContainer>
  );
};

export default AchievementsSection;