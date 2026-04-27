import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isSecurity = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isSecurity}
      aria-label={isSecurity ? 'Switch to Engineering profile' : 'Switch to Security profile'}
      className="group inline-flex items-center gap-2 rounded-full border border-white/20 bg-gray-900/70 px-2 py-1 text-xs font-medium text-white shadow-sm transition-colors duration-200 hover:bg-gray-800/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <span className="sr-only">Identity Dial</span>
      <span className="text-[11px] uppercase tracking-wide text-blue-200 dark:text-red-200">
        {isSecurity ? 'Security' : 'Engineering'}
      </span>

      <span className="relative inline-flex h-6 w-11 items-center rounded-full bg-gradient-to-r from-blue-500/80 to-red-500/80 p-0.5">
        <span
          aria-hidden="true"
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-out motion-reduce:transition-none ${
            isSecurity ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
        <span
          aria-hidden="true"
          className={`h-full w-full rounded-full ring-1 ring-inset transition-colors duration-200 motion-reduce:transition-none ${
            isSecurity ? 'ring-red-200/50' : 'ring-blue-200/50'
          }`}
        />
      </span>
    </button>
  );
};

export default ThemeToggle;
