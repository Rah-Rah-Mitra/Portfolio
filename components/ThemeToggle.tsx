import React, { useEffect, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { DeveloperIcon, ShieldIcon } from './icons/ThemeIcons';

interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();
  const [liveMessage, setLiveMessage] = useState('');

  const currentProfile = theme === 'light' ? 'Software Engineer' : 'Cybersecurity';
  const nextProfile = theme === 'light' ? 'Cybersecurity' : 'Software Engineer';

  useEffect(() => {
    setLiveMessage(`Switched to ${currentProfile} profile`);
  }, [currentProfile]);

  return (
    <>
      <button
        onClick={toggleTheme}
        type="button"
        aria-label={`Profile switcher. Current profile: ${currentProfile}. Activate to switch to ${nextProfile} profile.`}
        aria-pressed={theme === 'dark'}
        className={`p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 dark:focus:ring-offset-gray-900 focus:ring-white transition-colors ${className}`.trim()}
      >
        <span className="sr-only">Current profile: {currentProfile}</span>
        {theme === 'light' ? (
          <ShieldIcon className="w-6 h-6" />
        ) : (
          <DeveloperIcon className="w-6 h-6" />
        )}
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>
    </>
  );
};

export default ThemeToggle;
