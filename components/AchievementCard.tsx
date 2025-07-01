
import React from 'react';
import { AchievementItem } from '../types';
import { CalendarDaysIcon, TagIcon } from './icons/GenericIcons';
import BreakableText from './BreakableText';

interface AchievementCardProps {
  achievement: AchievementItem;
  index: number;
}

const AchievementCard: React.FC<AchievementCardProps> = ({ achievement, index }) => {
  const { title, description, date, imageUrl, category, tags } = achievement;

  return (
    <div 
      className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300 hover:shadow-emerald-500/30 hover:transform hover:-translate-y-2 group"
      style={{ animationDelay: `${index * 100}ms` }} // Staggered animation
    >
      {imageUrl && (
        <div className="w-full h-56 overflow-hidden">
          <img 
            src={imageUrl} 
            alt={title} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
          />
        </div>
      )}
      <div className="p-6 flex flex-col flex-grow">
        {category && (
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center">
            <TagIcon className="w-4 h-4 mr-1.5" />
            {category}
          </p>
        )}
        <h3 className="text-xl lg:text-2xl font-semibold text-white mb-3"><BreakableText text={title} /></h3>
        <div className="text-gray-400 text-sm leading-relaxed mb-4 flex-grow"><BreakableText text={description}/></div>
        
        {tags && tags.length > 0 && (
          <div className="mb-4">
            {tags.map(tag => (
              <span key={tag} className="inline-block bg-gray-700 text-gray-300 text-xs font-medium mr-2 mb-2 px-2.5 py-1 rounded-full">
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
  );
};

export default AchievementCard;