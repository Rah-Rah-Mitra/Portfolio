import React, { useEffect, useRef } from 'react';
import { AchievementItem } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { themeToProfile, track } from '../lib/analytics';

interface AchievementCardProps {
  achievement: AchievementItem;
  index: number;
}

const AchievementCard: React.FC<AchievementCardProps> = ({ achievement, index }) => {
  const itemRef = useRef<HTMLElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const item = itemRef.current;
    if (!item) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      track('achievement_viewed', {
        title: achievement.title,
        category: achievement.category ?? 'Uncategorised',
        index,
        profile: themeToProfile(theme),
      });
      observer.disconnect();
    }, { threshold: 0.55 });
    observer.observe(item);
    return () => observer.disconnect();
  }, [achievement.category, achievement.title, index, theme]);

  return (
    <article ref={itemRef} className="proof-entry">
      {achievement.imageUrl && (
        <img src={achievement.imageUrl} alt="" loading="lazy" decoding="async" className="proof-image" />
      )}
      <div className="proof-copy">
        <div className="proof-meta">
          <span>{achievement.category ?? 'Evidence'}</span>
          <time>{achievement.date}</time>
        </div>
        <h3>{achievement.title}</h3>
        <p>{achievement.description}</p>
        {achievement.tags?.length ? (
          <div className="proof-tags" aria-label="Related methods">
            {achievement.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        ) : null}
        {achievement.proofUrl && (
          <a
            href={achievement.proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('achievement_proof_opened', { title: achievement.title })}
          >
            {achievement.proofLabel ?? 'Open supporting evidence'}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </article>
  );
};

export default AchievementCard;
