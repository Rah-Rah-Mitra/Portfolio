import React, { useRef, useCallback } from 'react';
import { AchievementItem } from '../types';
import { CalendarDaysIcon, TagIcon } from './icons/GenericIcons';
import BreakableText from './BreakableText';
import { useCardTilt } from '../hooks/useCardTilt';

interface AchievementCardProps {
  achievement: AchievementItem;
  index: number;
}

const AchievementCard: React.FC<AchievementCardProps> = ({ achievement, index }) => {
  const { title, description, date, imageUrl, category, tags } = achievement;
  const cardRef = useCardTilt(10);

  return (
    /*
     * transform-style: preserve-3d  lets child elements live at different Z depths.
     * contain: layout style          tells the browser card repaints stay isolated.
     * The outer wrapper holds the perspective; cardRef gets the actual 3D rotation.
     */
    <div
      className="card-3d-wrapper"
      style={{ perspective: '900px', contain: 'layout style' }}
    >
      <div
        ref={cardRef}
        className="card-3d bg-gray-800 dark:bg-gray-800/50 rounded-xl shadow-2xl overflow-hidden flex flex-col group"
        style={{
          animationDelay: `${index * 100}ms`,
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
          transition: 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.3s ease',
        }}
      >
        {/* Shimmer highlight overlay — tracks mouse via CSS vars set by the tilt hook parent */}
        <div
          className="card-3d-sheen pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 z-10"
          style={{
            background: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.08) 0%, transparent 60%)',
            transition: 'opacity 0.3s ease',
          }}
          aria-hidden="true"
        />

        {imageUrl && (
          <div className="w-full h-56 overflow-hidden" style={{ transform: 'translateZ(20px)' }}>
            <img
              src={imageUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>
        )}

        <div className="p-6 flex flex-col flex-grow relative" style={{ transform: 'translateZ(5px)' }}>
          {category && (
            <p className="text-xs font-semibold text-blue-400 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center">
              <TagIcon className="w-4 h-4 mr-1.5" />
              {category}
            </p>
          )}
          <h3 className="text-xl lg:text-2xl font-semibold text-white mb-3">
            <BreakableText text={title} />
          </h3>
          <div className="text-gray-400 text-sm leading-relaxed mb-4 flex-grow">
            <BreakableText text={description} />
          </div>

          {tags && tags.length > 0 && (
            <div className="mb-4">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-block bg-gray-700 text-gray-300 text-xs font-medium mr-2 mb-2 px-2.5 py-1 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 flex items-center">
              <CalendarDaysIcon className="w-4 h-4 mr-1.5" />
              {date}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AchievementCard;
