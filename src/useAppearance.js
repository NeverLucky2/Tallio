import { useState, useCallback, useEffect } from 'react';
import { PRESETS, deriveTheme, essentialsForTheme } from './themes.js';

const STORAGE = 'tallio-appearance';

const DEFAULT_BACKGROUND = {
  base: 'solid', presetId: null, photoIds: [], photoGroup: null,
  mode: 'single', intervalSec: 30, intensity: 25, effects: { aurora: false, pulse: false },
  framing: {}, effectStrength: 50,
};

function defaults() {
  return { themeId: 'nocturne', customTheme: null, background: { ...DEFAULT_BACKGROUND }, appIcons: {} };
}

function loadInitial() {
  if (typeof window === 'undefined') return defaults();
  try {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    return {
      ...defaults(),
      ...parsed,
      background: { ...DEFAULT_BACKGROUND, ...(parsed.background || {}) },
    };
  } catch {
    return defaults();
  }
}

function resolveTokens(themeId, customTheme) {
  if (themeId === 'custom' && customTheme) {
    return deriveTheme(customTheme);
  }
  const preset = PRESETS.find(p => p.id === themeId) || PRESETS[0];
  return deriveTheme(preset.essentials, preset.overrides);
}

export default function useAppearance() {
  const [state, setState] = useState(loadInitial);

  // Apply the active theme to :root whenever it changes (free live preview).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const tokens = resolveTokens(state.themeId, state.customTheme);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v);
  }, [state.themeId, state.customTheme]);

  const persist = useCallback((next) => {
    try { window.localStorage.setItem(STORAGE, JSON.stringify(next)); } catch { /* ignore quota */ }
    return next;
  }, []);

  const setTheme = useCallback((id) => {
    setState(prev => persist({ ...prev, themeId: id }));
  }, [persist]);

  const updateCustom = useCallback((partial) => {
    setState(prev => {
      const base = prev.customTheme || essentialsForTheme(prev.themeId, null);
      return persist({ ...prev, themeId: 'custom', customTheme: { ...base, ...partial } });
    });
  }, [persist]);

  const resetCustomToPreset = useCallback((id) => {
    setState(prev => persist({ ...prev, themeId: id, customTheme: null }));
  }, [persist]);

  const updateBackground = useCallback((partial) => {
    setState(prev => persist({ ...prev, background: { ...prev.background, ...partial } }));
  }, [persist]);

  const snapshot = useCallback(() => JSON.parse(JSON.stringify({
    themeId: state.themeId,
    customTheme: state.customTheme,
    background: state.background,
    appIcons: state.appIcons,
  })), [state]);

  const restore = useCallback((snap) => {
    if (!snap) return;
    setState(prev => persist({
      ...prev,
      themeId: snap.themeId,
      customTheme: snap.customTheme ?? null,
      background: { ...DEFAULT_BACKGROUND, ...(snap.background || {}) },
      appIcons: snap.appIcons || {},
    }));
  }, [persist]);

  const setAppIcon = useCallback((slot, value) => {
    setState(prev => {
      const appIcons = { ...prev.appIcons };
      if (value) appIcons[slot] = value; else delete appIcons[slot];
      return persist({ ...prev, appIcons });
    });
  }, [persist]);

  return {
    themeId: state.themeId,
    customTheme: state.customTheme,
    background: state.background,
    appIcons: state.appIcons,
    setTheme,
    updateCustom,
    resetCustomToPreset,
    updateBackground,
    snapshot,
    restore,
    setAppIcon,
  };
}
