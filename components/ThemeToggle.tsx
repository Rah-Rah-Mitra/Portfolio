
import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { DeveloperIcon, ShieldIcon } from './icons/ThemeIcons';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'light' ? 'Switch to Cybersecurity Profile' : 'Switch to Software Engineer Profile'}
      className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 dark:focus:ring-offset-gray-900 focus:ring-white transition-colors"
    >
      {theme === 'light' ? (
        <ShieldIcon className="w-6 h-6" />
      ) : (
        <DeveloperIcon className="w-6 h-6" />
      )}
    </button>
  );
};

export default ThemeToggle;