
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { track, themeToProfile } from '../lib/analytics';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (nextTheme: Theme) => void;
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
      const savedTheme = localStorage.getItem('theme') as Theme;
      return savedTheme || 'light';
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
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => {
      const next = prevTheme === 'light' ? 'dark' : 'light';
      track('profile_switched', { from: themeToProfile(prevTheme), to: themeToProfile(next) });
      return next;
    });
  };

  const setThemeExplicit = (nextTheme: Theme) => {
    setTheme((prevTheme) => {
      if (prevTheme === nextTheme) return prevTheme;
      track('profile_switched', { from: themeToProfile(prevTheme), to: themeToProfile(nextTheme) });
      return nextTheme;
    });
  };

  const value = { theme, toggleTheme, setTheme: setThemeExplicit };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
