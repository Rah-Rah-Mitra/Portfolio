
import React from 'react';
import { Theme, useTheme } from '../contexts/ThemeContext';
import { DeveloperIcon, ShieldIcon } from './icons/ThemeIcons';

const ThemeToggle: React.FC = () => {
  const { theme, setThemeMode } = useTheme();
  const options: Array<{ theme: Theme; label: string; shortLabel: string; Icon: typeof DeveloperIcon }> = [
    { theme: 'light', label: 'Software Profile', shortLabel: 'Software', Icon: DeveloperIcon },
    { theme: 'dark', label: 'Cyber Profile', shortLabel: 'Cyber', Icon: ShieldIcon },
  ];

  return (
    <div
      role="group"
      aria-label="Profile mode"
      className="inline-flex items-center rounded-md border border-white/15 bg-black/30 p-1 shadow-lg shadow-black/20 backdrop-blur-md"
    >
      {options.map(({ theme: optionTheme, label, shortLabel, Icon }) => {
        const isActive = theme === optionTheme;
        return (
          <button
            key={optionTheme}
            type="button"
            onClick={() => setThemeMode(optionTheme)}
            aria-pressed={isActive}
            aria-label={`${label}${isActive ? ' active' : ''}`}
            className={`inline-flex h-9 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 sm:text-sm ${
              isActive
                ? optionTheme === 'light'
                  ? 'bg-cyan-400 text-gray-950 shadow-sm shadow-cyan-400/30'
                  : 'bg-red-500 text-white shadow-sm shadow-red-500/30'
                : 'text-gray-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden xl:inline">{label}</span>
            <span className="xl:hidden">{shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ThemeToggle;
