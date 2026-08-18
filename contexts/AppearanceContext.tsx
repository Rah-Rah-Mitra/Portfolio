import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import type {
  AccentId,
  AppearancePreferenceAction,
  AppearancePreferences,
  BackgroundThemeId,
  ColorSchemePreference,
  FluidPreferences,
  NBodyPreferences,
  ResolvedColorScheme,
} from '../types';
import {
  APPEARANCE_STORAGE_KEY,
  appearanceReducer,
  applyAppearanceToDocument,
  defaultAppearancePreferences,
  parseAppearancePreferences,
  resolveColorScheme,
} from '../lib/appearance';

type AppearanceContextValue = {
  preferences: AppearancePreferences;
  resolvedScheme: ResolvedColorScheme;
  dispatch: React.Dispatch<AppearancePreferenceAction>;
  setScheme: (scheme: ColorSchemePreference) => void;
  setAccent: (accent: AccentId) => void;
  setBackgroundTheme: (background: BackgroundThemeId) => void;
  setBackgroundPaused: (paused: boolean) => void;
  patchNBody: (patch: Partial<NBodyPreferences>) => void;
  patchFluid: (patch: Partial<FluidPreferences>) => void;
  resetBackground: () => void;
  resetAllPreferences: () => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const initialPreferences = () => {
  if (typeof window === 'undefined') return defaultAppearancePreferences;
  return parseAppearancePreferences(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
};

export const useAppearance = () => {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance must be used within AppearanceProvider');
  return value;
};

export const AppearanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, dispatch] = useReducer(appearanceReducer, undefined, initialPreferences);
  const [systemDark, setSystemDark] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  ));
  const resolvedScheme = resolveColorScheme(preferences.scheme, systemDark);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = (event: MediaQueryListEvent | MediaQueryList) => setSystemDark(event.matches);
    update(query);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preferences));
    applyAppearanceToDocument(
      document.documentElement,
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]'),
      preferences,
      resolvedScheme,
    );
  }, [preferences, resolvedScheme]);

  const setScheme = useCallback((scheme: ColorSchemePreference) => dispatch({ type: 'SET_SCHEME', scheme }), []);
  const setAccent = useCallback((accent: AccentId) => dispatch({ type: 'SET_ACCENT', accent }), []);
  const setBackgroundTheme = useCallback((background: BackgroundThemeId) => dispatch({ type: 'SET_BACKGROUND', background }), []);
  const setBackgroundPaused = useCallback((paused: boolean) => dispatch({ type: 'SET_BACKGROUND_PAUSED', paused }), []);
  const patchNBody = useCallback((patch: Partial<NBodyPreferences>) => dispatch({ type: 'PATCH_NBODY', patch }), []);
  const patchFluid = useCallback((patch: Partial<FluidPreferences>) => dispatch({ type: 'PATCH_FLUID', patch }), []);
  const resetBackground = useCallback(() => dispatch({ type: 'RESET_BACKGROUND' }), []);
  const resetAllPreferences = useCallback(() => dispatch({ type: 'RESET_ALL' }), []);

  const value = useMemo<AppearanceContextValue>(() => ({
    preferences,
    resolvedScheme,
    dispatch,
    setScheme,
    setAccent,
    setBackgroundTheme,
    setBackgroundPaused,
    patchNBody,
    patchFluid,
    resetBackground,
    resetAllPreferences,
  }), [preferences, resolvedScheme, setScheme, setAccent, setBackgroundTheme, setBackgroundPaused, patchNBody, patchFluid, resetBackground, resetAllPreferences]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
};
