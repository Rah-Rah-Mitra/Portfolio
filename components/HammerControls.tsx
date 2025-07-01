import React from 'react';
import { usePhysics } from '../contexts/PhysicsContext';
import { HammerIcon } from './icons/HammerIcon';
import { RestoreIcon } from './icons/RestoreIcon';

const HammerControls: React.FC = () => {
  const { isHammerMode, toggleHammerMode, restoreAll } = usePhysics();

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      <div className="relative group flex items-center">
        <button
          onClick={restoreAll}
          aria-label="Restore text"
          className="p-3 bg-gray-700 hover:bg-emerald-500 text-white rounded-full shadow-lg transition-all transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-emerald-400"
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
          onClick={toggleHammerMode}
          aria-label={isHammerMode ? 'Deactivate hammer mode' : 'Activate hammer mode'}
          className={`p-3 ${
            isHammerMode ? 'bg-emerald-500' : 'bg-gray-700'
          } hover:bg-emerald-600 text-white rounded-full shadow-lg transition-all transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-emerald-400`}
        >
          <HammerIcon className="w-6 h-6" />
        </button>
        <div
          className="absolute right-full top-1/2 -translate-y-1/2 mr-3 whitespace-nowrap px-3 py-1.5 bg-gray-600 text-white text-sm font-medium rounded-md shadow-lg opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none"
          role="tooltip"
        >
          {isHammerMode ? 'Deactivate Smash' : 'Activate Smash'}
        </div>
      </div>
    </div>
  );
};

export default HammerControls;