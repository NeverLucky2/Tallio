import { useState, useCallback } from 'react';

const KEY_STORAGE = 'tallio-anthropic-key';
const MODEL_STORAGE = 'tallio-anthropic-model';
const UI_SCALE_STORAGE = 'tallio-ui-scale';
const SEASONAL_STORAGE = 'tallio-seasonal-effects';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export const DEFAULT_UI_SCALE = 1.1;
export const UI_SCALE_MIN = 0.9;
export const UI_SCALE_MAX = 1.5;
export const UI_SCALE_STEP = 0.05;

// Round to the nearest 5% (integer math avoids float drift), then clamp to range.
export function clampUiScale(n) {
  if (!Number.isFinite(n)) return DEFAULT_UI_SCALE;
  const rounded = Math.round(n * 20) / 20;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, rounded));
}

function loadInitial() {
  if (typeof window === 'undefined') return { apiKey: '', model: DEFAULT_MODEL, uiScale: DEFAULT_UI_SCALE, seasonalEffects: true };
  try {
    return {
      apiKey: window.localStorage.getItem(KEY_STORAGE) || '',
      model: window.localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL,
      uiScale: clampUiScale(parseFloat(window.localStorage.getItem(UI_SCALE_STORAGE))),
      seasonalEffects: window.localStorage.getItem(SEASONAL_STORAGE) !== 'false',
    };
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL, uiScale: DEFAULT_UI_SCALE, seasonalEffects: true };
  }
}

export default function useSettings() {
  const [state, setState] = useState(loadInitial);

  const save = useCallback(({ apiKey, model, uiScale, seasonalEffects } = {}) => {
    setState((prev) => {
      const next = {
        apiKey: apiKey !== undefined ? apiKey.trim() : prev.apiKey,
        model: model !== undefined ? (model || DEFAULT_MODEL) : prev.model,
        uiScale: uiScale !== undefined ? clampUiScale(uiScale) : prev.uiScale,
        seasonalEffects: seasonalEffects !== undefined ? !!seasonalEffects : prev.seasonalEffects,
      };
      try {
        if (apiKey !== undefined) window.localStorage.setItem(KEY_STORAGE, next.apiKey);
        if (model !== undefined) window.localStorage.setItem(MODEL_STORAGE, next.model);
        if (uiScale !== undefined) window.localStorage.setItem(UI_SCALE_STORAGE, String(next.uiScale));
        if (seasonalEffects !== undefined) window.localStorage.setItem(SEASONAL_STORAGE, String(next.seasonalEffects));
      } catch {
        // ignore quota / privacy-mode errors; in-memory state still updates
      }
      return next;
    });
  }, []);

  return {
    apiKey: state.apiKey,
    model: state.model,
    uiScale: state.uiScale,
    seasonalEffects: state.seasonalEffects,
    hasKey: state.apiKey.startsWith('sk-ant-'),
    save,
  };
}
