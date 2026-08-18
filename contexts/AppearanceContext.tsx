import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import type {
  AccentId,
  AppearancePreferenceAction,
  AppearancePreferences,
  BackgroundThemeId,
  ColorSchemePreference,
  FluidPreferences,
  NBodyPreferences,
  AppearancePanelTab,
  PreferenceOpenSource,
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
  preferencesOpen: boolean;
  preferencesTab: AppearancePanelTab;
  openPreferences: (source: PreferenceOpenSource, tab?: AppearancePanelTab) => void;
  closePreferences: () => void;
  setPreferencesTab: (tab: AppearancePanelTab) => void;
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

export const useOptionalAppearance = () => useContext(AppearanceContext);

export const AppearanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, dispatch] = useReducer(appearanceReducer, undefined, initialPreferences);
  const [systemDark, setSystemDark] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  ));
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferencesTab, setPreferencesTab] = useState<AppearancePanelTab>('appearance');
  const preferenceOpener = React.useRef<HTMLElement | null>(null);
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
  const openPreferences = useCallback((_source: PreferenceOpenSource, tab: AppearancePanelTab = 'appearance') => {
    preferenceOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPreferencesTab(tab);
    setPreferencesOpen(true);
  }, []);
  const closePreferences = useCallback(() => {
    setPreferencesOpen(false);
    window.setTimeout(() => preferenceOpener.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const openFromEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: PreferenceOpenSource; tab?: AppearancePanelTab }>).detail;
      openPreferences(detail?.source ?? 'header', detail?.tab);
    };
    const openFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === ',' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        openPreferences('keyboard');
      }
    };
    window.addEventListener('portfolio:openPreferences', openFromEvent);
    window.addEventListener('keydown', openFromKeyboard);
    return () => {
      window.removeEventListener('portfolio:openPreferences', openFromEvent);
      window.removeEventListener('keydown', openFromKeyboard);
    };
  }, [openPreferences]);

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
    preferencesOpen,
    preferencesTab,
    openPreferences,
    closePreferences,
    setPreferencesTab,
  }), [preferences, resolvedScheme, setScheme, setAccent, setBackgroundTheme, setBackgroundPaused, patchNBody, patchFluid, resetBackground, resetAllPreferences, preferencesOpen, preferencesTab, openPreferences, closePreferences]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
};
