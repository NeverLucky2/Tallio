import React, { useEffect, useState } from 'react';

const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', cost: '~$0.005/receipt' },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6', cost: '~$0.025/receipt' },
  { id: 'claude-opus-4-7',           label: 'Opus 4.7',   cost: '~$0.10/receipt' },
];

const XAI_MODELS = [
  { id: 'grok-2-vision-1212',        label: 'Grok 2 Vision', cost: '~$0.002/receipt' },
];

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)', keyPrefix: 'sk-ant-', helpUrl: 'console.anthropic.com' },
  { id: 'xai',       label: 'xAI (Grok)',        keyPrefix: 'xai-',    helpUrl: 'console.x.ai' },
];

function maskKey(key) {
  if (!key) return '';
  if (key.length < 8) return key;
  const tail = key.slice(-4);
  return `${key.slice(0, 6)}•••••…${tail}`;
}

function getModelsForProvider(provider) {
  return provider === 'xai' ? XAI_MODELS : ANTHROPIC_MODELS;
}

function getKeyPrefixForProvider(provider) {
  const p = PROVIDERS.find(prov => prov.id === provider);
  return p ? p.keyPrefix : 'sk-ant-';
}

function getHelpUrlForProvider(provider) {
  const p = PROVIDERS.find(prov => prov.id === provider);
  return p ? p.helpUrl : 'console.anthropic.com';
}

export default function SettingsPanel({ settings, onClose, banner }) {
  const { apiKey, provider, model, save } = settings;
  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftProvider, setDraftProvider] = useState(provider);
  const [draftModel, setDraftModel] = useState(model);
  const [editing, setEditing] = useState(!apiKey);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // When provider changes, update model to the first model of that provider
  const handleProviderChange = (newProvider) => {
    setDraftProvider(newProvider);
    const models = getModelsForProvider(newProvider);
    setDraftModel(models[0].id);
  };

  const keyPrefix = getKeyPrefixForProvider(draftProvider);
  const isValid = draftKey.startsWith(keyPrefix);
  const dirty = draftKey !== apiKey || draftProvider !== provider || draftModel !== model;

  const handleSave = () => {
    save({ apiKey: draftKey, provider: draftProvider, model: draftModel });
    onClose();
  };

  const availableModels = getModelsForProvider(draftProvider);
  const helpUrl = getHelpUrlForProvider(draftProvider);

  return (
    <div className="pair-overlay" onClick={onClose}>
      <div
        className="pair-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pair-header">
          <h2 id="settings-title" className="pair-title">Settings</h2>
          <button className="pair-close" aria-label="Close settings" onClick={onClose}>×</button>
        </div>

        <div className="pair-body settings-body">
          {banner && <div className="settings-banner">{banner}</div>}

          <label className="settings-label" htmlFor="settings-provider">AI Provider</label>
          <select
            id="settings-provider"
            value={draftProvider}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="settings-select"
          >
            {PROVIDERS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <p className="settings-help">
            Choose which AI provider to use for bill extraction.
          </p>

          <label className="settings-label" htmlFor="settings-key">
            {draftProvider === 'anthropic' ? 'Anthropic API Key' : 'xAI API Key'}
          </label>
          {editing ? (
            <input
              id="settings-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder={keyPrefix + '...'}
              className="settings-input"
            />
          ) : (
            <div className="settings-key-row">
              <code className="settings-key-mask">{maskKey(apiKey)}</code>
              <button className="btn" onClick={() => { setDraftKey(''); setEditing(true); }}>Edit</button>
            </div>
          )}
          <p className="settings-help">
            Get a key at {helpUrl} → Settings → API Keys
          </p>

          <label className="settings-label" htmlFor="settings-model">Model</label>
          <select
            id="settings-model"
            value={draftModel}
            onChange={(e) => setDraftModel(e.target.value)}
            className="settings-select"
          >
            {availableModels.map(m => (
              <option key={m.id} value={m.id}>{m.label} — {m.cost}</option>
            ))}
          </select>

          <p className="settings-privacy">
            Key is stored only in this browser. Never sent to BillTracker servers.
          </p>
        </div>

        <div className="pair-footer">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!isValid || !dirty}
          >
            Save
          </button>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
