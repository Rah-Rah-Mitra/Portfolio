import React, { useMemo, useState } from 'react';
import { AchievementItem } from '../types';
import AchievementCard from './AchievementCard';
import SectionContainer from './SectionContainer';

interface AchievementsSectionProps {
  id: string;
  achievements: AchievementItem[];
}

const AchievementsSection: React.FC<AchievementsSectionProps> = ({ id, achievements }) => {
  const [expanded, setExpanded] = useState(false);
  const uniqueAchievements = useMemo(() => achievements.filter((achievement, index, all) => (
    all.findIndex((candidate) => candidate.title === achievement.title) === index
  )), [achievements]);
  const visible = expanded ? uniqueAchievements : uniqueAchievements.slice(0, 5);

  return (
    <SectionContainer
      id={id}
      title="Achievements and proof"
      subtitle="Distinctions, responsible security work, open-source maintenance, and competition evidence — presented as a verifiable record, not a trophy wall."
      className="proof-section"
    >
      <div className="proof-ledger">
        {visible.map((achievement, index) => (
          <AchievementCard key={`${achievement.category}-${achievement.id}-${achievement.title}`} achievement={achievement} index={index} />
        ))}
      </div>
      {uniqueAchievements.length > 5 && (
        <button type="button" className="ledger-more" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
          {expanded ? 'Show the concise proof record' : `Open ${uniqueAchievements.length - 5} more achievements`}
        </button>
      )}
    </SectionContainer>
  );
};

export default AchievementsSection;
