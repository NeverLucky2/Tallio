import { useState, useCallback } from 'react';

const KEY_STORAGE = 'billtracker-api-key';
const PROVIDER_STORAGE = 'billtracker-api-provider';
const MODEL_STORAGE = 'billtracker-api-model';

const DEFAULT_PROVIDER = 'anthropic';
const DEFAULT_MODEL_ANTHROPIC = 'claude-haiku-4-5-20251001';
const DEFAULT_MODEL_XAI = 'grok-2-vision-1212';

function loadInitial() {
  if (typeof window === 'undefined') {
    return {
      apiKey: '',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL_ANTHROPIC,
    };
  }
  try {
    const provider = window.localStorage.getItem(PROVIDER_STORAGE) || DEFAULT_PROVIDER;
    const model = window.localStorage.getItem(MODEL_STORAGE) || (provider === 'xai' ? DEFAULT_MODEL_XAI : DEFAULT_MODEL_ANTHROPIC);
    return {
      apiKey: window.localStorage.getItem(KEY_STORAGE) || '',
      provider,
      model,
    };
  } catch {
    return {
      apiKey: '',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL_ANTHROPIC,
    };
  }
}

export default function useSettings() {
  const [state, setState] = useState(loadInitial);

  const save = useCallback(({ apiKey, provider, model } = {}) => {
    setState((prev) => {
      const nextProvider = provider !== undefined ? provider : prev.provider;
      const nextModel = model !== undefined ? model : prev.model;
      const nextApiKey = apiKey !== undefined ? apiKey.trim() : prev.apiKey;

      const next = {
        apiKey: nextApiKey,
        provider: nextProvider,
        model: nextModel,
      };

      try {
        if (apiKey !== undefined) window.localStorage.setItem(KEY_STORAGE, nextApiKey);
        if (provider !== undefined) window.localStorage.setItem(PROVIDER_STORAGE, nextProvider);
        if (model !== undefined) window.localStorage.setItem(MODEL_STORAGE, nextModel);
      } catch {
        // ignore quota / privacy-mode errors; in-memory state still updates
      }
      return next;
    });
  }, []);

  // Determine if API key is valid based on provider
  const hasValidKey = () => {
    if (state.provider === 'anthropic') {
      return state.apiKey.startsWith('sk-ant-');
    } else if (state.provider === 'xai') {
      return state.apiKey.startsWith('xai-');
    }
    return false;
  };

  return {
    apiKey: state.apiKey,
    provider: state.provider,
    model: state.model,
    hasKey: hasValidKey(),
    save,
  };
}
