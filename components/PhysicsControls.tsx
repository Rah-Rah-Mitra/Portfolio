
import React from 'react';
import { usePhysics } from '../contexts/PhysicsContext';
import { useTheme } from '../contexts/ThemeContext';
import { HammerIcon } from './icons/HammerIcon';
import { RestoreIcon } from './icons/RestoreIcon';
import { GravityIcon } from './icons/GravityIcon';

const PhysicsControls: React.FC = () => {
  const { isInteractionActive, toggleInteraction, restoreAll } = usePhysics();
  const { theme } = useTheme();

  const isLightMode = theme === 'light';

  const interactionButtonLabel = isLightMode
    ? (isInteractionActive ? 'Deactivate hammer mode' : 'Activate hammer mode')
    : (isInteractionActive ? 'Deactivate gravity mode' : 'Activate gravity mode');
    
  const interactionTooltipText = isLightMode
    ? (isInteractionActive ? 'Deactivate Smash' : 'Activate Smash')
    : (isInteractionActive ? 'Deactivate Gravity Well' : 'Activate Gravity Well');

  const interactionButtonRing = isLightMode
    ? 'focus:ring-blue-400'
    : 'focus:ring-red-500';

  const interactionButtonBg = isInteractionActive
    ? (isLightMode ? 'bg-blue-500' : 'bg-red-500')
    : 'bg-gray-700';
    
  const interactionButtonHoverBg = isInteractionActive
    ? (isLightMode ? 'hover:bg-blue-700' : 'hover:bg-red-700')
    : (isLightMode ? 'hover:bg-blue-600' : 'hover:bg-red-600');


  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      <div className="relative group flex items-center">
        <button
          onClick={restoreAll}
          aria-label="Restore text"
          className={`p-3 bg-gray-700 ${isLightMode ? 'hover:bg-blue-500' : 'hover:bg-red-500'} text-white rounded-full shadow-lg transition-all transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${interactionButtonRing}`}
        >
          <RestoreIcon className="w-6 h-6" />
        </button>
        <div
          className="absolute right-full top-1/2 -translate-y-1/2 mr-3 whitespace-nowrap px-3 py-1.5 bg-gray-600 text-white text-sm font-medium rounded-md shadow-lg opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none"
          role="tooltip"
        >
          Restore Text
        </div>
      </div>

      <div className="relative group flex items-center">
        <button
          onClick={toggleInteraction}
          aria-label={interactionButtonLabel}
          className={`p-3 ${interactionButtonBg} ${interactionButtonHoverBg} text-white rounded-full shadow-lg transition-all transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${interactionButtonRing}`}
        >
          {isLightMode ? <HammerIcon className="w-6 h-6" /> : <GravityIcon className="w-6 h-6" />}
        </button>
        <div
          className="absolute right-full top-1/2 -translate-y-1/2 mr-3 whitespace-nowrap px-3 py-1.5 bg-gray-600 text-white text-sm font-medium rounded-md shadow-lg opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none"
          role="tooltip"
        >
          {interactionTooltipText}
        </div>
      </div>
    </div>
  );
};

export default PhysicsControls;