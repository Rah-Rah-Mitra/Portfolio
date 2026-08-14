
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { track, themeToProfile } from '../lib/analytics';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setThemeMode: (nextTheme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const savedLens = localStorage.getItem('profile-lens');
      if (savedLens === 'secure') return 'dark';
      if (savedLens === 'build') return 'light';
      const legacyTheme = localStorage.getItem('theme') as Theme | null;
      return legacyTheme === 'dark' ? 'dark' : 'light';
    }
    return 'light';
  });

  // Track which profile a visitor first lands on (fires once)
  const hasTrackedInitialView = useRef(false);
  useEffect(() => {
    if (hasTrackedInitialView.current) return;
    hasTrackedInitialView.current = true;
    track('profile_viewed', { profile: themeToProfile(theme) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark');
    root.dataset.lens = theme === 'dark' ? 'secure' : 'build';
    localStorage.setItem('profile-lens', theme === 'dark' ? 'secure' : 'build');
  }, [theme]);

  const setThemeMode = (nextTheme: Theme) => {
    setTheme(prevTheme => {
      if (prevTheme === nextTheme) return prevTheme;
      track('profile_switched', { from: themeToProfile(prevTheme), to: themeToProfile(nextTheme) });
      return nextTheme;
    });
  };

  const toggleTheme = () => {
    setThemeMode(theme === 'light' ? 'dark' : 'light');
  };

  const value = { theme, toggleTheme, setThemeMode };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
