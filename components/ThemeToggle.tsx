
import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { DeveloperIcon, ShieldIcon } from './icons/ThemeIcons';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isSoftware = theme === 'light';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isSoftware ? 'Switch to Cyber Profile' : 'Switch to Software Profile'}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 dark:focus:ring-offset-gray-900 ${
        isSoftware
          ? 'border-red-500/50 bg-red-500/10 text-red-200 hover:border-red-300 hover:bg-red-500/20'
          : 'border-cyan-400/50 bg-cyan-400/10 text-cyan-100 hover:border-cyan-300 hover:bg-cyan-400/20'
      }`}
    >
      {isSoftware ? (
        <>
          <ShieldIcon className="h-5 w-5" />
          <span>Cyber Profile</span>
        </>
      ) : (
        <>
          <DeveloperIcon className="h-5 w-5" />
          <span>Software Profile</span>
        </>
      )}
    </button>
  );
};

export default ThemeToggle;
