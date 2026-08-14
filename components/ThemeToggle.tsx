
import React from 'react';
import { Theme, useTheme } from '../contexts/ThemeContext';
import { DeveloperIcon, ShieldIcon } from './icons/ThemeIcons';

const ThemeToggle: React.FC = () => {
  const { theme, setThemeMode } = useTheme();
  const options: Array<{ theme: Theme; label: string; shortLabel: string; Icon: typeof DeveloperIcon }> = [
    { theme: 'light', label: 'Build lens', shortLabel: 'Build', Icon: DeveloperIcon },
    { theme: 'dark', label: 'Secure lens', shortLabel: 'Secure', Icon: ShieldIcon },
  ];

  return (
    <div
      role="group"
      aria-label="Profile mode"
      className="lens-switch"
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
            className={`lens-option ${isActive ? 'is-active' : ''}`}
          >
            <Icon className="h-4 w-4" />
            <span className="lens-label-long">{label}</span>
            <span className="lens-label-short">{shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ThemeToggle;
