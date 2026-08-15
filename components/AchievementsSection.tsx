import React, { useEffect, useMemo, useState } from 'react';
import { AchievementItem } from '../types';
import AchievementCard from './AchievementCard';
import SectionContainer from './SectionContainer';
import CameraGlyph from './CameraGlyph';

interface AchievementsSectionProps {
  id: string;
  achievements: AchievementItem[];
}

const AchievementsSection: React.FC<AchievementsSectionProps> = ({ id, achievements }) => {
  const [activeAchievementId, setActiveAchievementId] = useState('');
  const uniqueAchievements = useMemo(() => achievements.filter((achievement, index, all) => (
    all.findIndex((candidate) => candidate.title === achievement.title) === index
  )), [achievements]);
  const activeAchievement = uniqueAchievements.find((achievement) => `${achievement.category}-${achievement.id}` === activeAchievementId) ?? uniqueAchievements[0];
  const activeIndex = Math.max(0, uniqueAchievements.findIndex((achievement) => achievement === activeAchievement));

  useEffect(() => {
    if (!activeAchievement) return;
    const key = `${activeAchievement.category}-${activeAchievement.id}`;
    if (key !== activeAchievementId) setActiveAchievementId(key);
  }, [activeAchievement, activeAchievementId]);

  return (
    <SectionContainer
      id={id}
      title="Achievements and proof"
      subtitle="Distinctions, responsible security work, open-source maintenance, and competition evidence — presented as a verifiable record, not a trophy wall."
      className="proof-section"
    >
      <div className="proof-viewer">
        <div className="proof-camera-strip" role="tablist" aria-label="Achievement and evidence viewpoints">
          {uniqueAchievements.map((achievement, index) => {
            const key = `${achievement.category}-${achievement.id}`;
            return (
              <button
                key={`${key}-${achievement.title}`}
                id={`proof-tab-${index}`}
                type="button"
                role="tab"
                aria-selected={achievement === activeAchievement}
                aria-controls="active-proof-panel"
                onClick={() => setActiveAchievementId(key)}
              >
                <CameraGlyph angle={(index % 5 - 2) * 5} />
                <span>{achievement.title}</span>
                <small>{achievement.date}</small>
              </button>
            );
          })}
        </div>
        {activeAchievement && (
          <div key={`${activeAchievement.category}-${activeAchievement.id}`} id="active-proof-panel" className="active-proof-panel" role="tabpanel" aria-labelledby={`proof-tab-${activeIndex}`}>
            <p className="proof-readout">Evidence view {String(activeIndex + 1).padStart(2, '0')} / {String(uniqueAchievements.length).padStart(2, '0')}</p>
            <AchievementCard achievement={activeAchievement} index={activeIndex} />
          </div>
        )}
      </div>
    </SectionContainer>
  );
};

export default AchievementsSection;
