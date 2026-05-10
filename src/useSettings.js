import { useState, useCallback } from 'react';

const KEY_STORAGE = 'billtracker-anthropic-key';
const MODEL_STORAGE = 'billtracker-anthropic-model';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

function loadInitial() {
  if (typeof window === 'undefined') return { apiKey: '', model: DEFAULT_MODEL };
  try {
    return {
      apiKey: window.localStorage.getItem(KEY_STORAGE) || '',
      model: window.localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL,
    };
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL };
  }
}

export default function useSettings() {
  const [state, setState] = useState(loadInitial);

  const save = useCallback(({ apiKey, model } = {}) => {
    setState((prev) => {
      const next = {
        apiKey: apiKey !== undefined ? apiKey : prev.apiKey,
        model: model !== undefined ? model : prev.model,
      };
      try {
        if (apiKey !== undefined) window.localStorage.setItem(KEY_STORAGE, next.apiKey);
        if (model !== undefined) window.localStorage.setItem(MODEL_STORAGE, next.model);
      } catch {
        // ignore quota / privacy-mode errors; in-memory state still updates
      }
      return next;
    });
  }, []);

  return {
    apiKey: state.apiKey,
    model: state.model,
    hasKey: state.apiKey.startsWith('sk-ant-'),
    save,
  };
}
