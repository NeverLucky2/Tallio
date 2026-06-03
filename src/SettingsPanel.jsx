import React, { useEffect, useState } from 'react';
import { clampUiScale, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_STEP } from './useSettings.js';

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', cost: '~$0.005/receipt' },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6', cost: '~$0.025/receipt' },
  { id: 'claude-opus-4-7',           label: 'Opus 4.7',   cost: '~$0.10/receipt' },
];

function maskKey(key) {
  if (!key) return '';
  if (key.length < 8) return key;
  const tail = key.slice(-4);
  return `sk-ant-•••••…${tail}`;
}

export default function SettingsPanel({ settings, onClose, banner }) {
  const { apiKey, model, uiScale, save } = settings;
  const pct = Math.round(uiScale * 100);
  const stepScale = (delta) => save({ uiScale: clampUiScale(uiScale + delta) });
  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftModel, setDraftModel] = useState(model);
  const [editing, setEditing] = useState(!apiKey);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isValid = draftKey.startsWith('sk-ant-');
  const dirty = draftKey !== apiKey || draftModel !== model;

  // Save commits the draft AND closes. Done closes without committing.
  const handleSave = () => {
    save({ apiKey: draftKey, model: draftModel });
    onClose();
  };

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

          <label className="settings-label" htmlFor="settings-key">Anthropic API Key</label>
          {editing ? (
            <input
              id="settings-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="sk-ant-..."
              className="settings-input"
            />
          ) : (
            <div className="settings-key-row">
              <code className="settings-key-mask">{maskKey(apiKey)}</code>
              <button className="btn" onClick={() => { setDraftKey(''); setEditing(true); }}>Edit</button>
            </div>
          )}
          <p className="settings-help">
            Get a key at console.anthropic.com → Settings → API Keys
          </p>

          <label className="settings-label" htmlFor="settings-model">Model</label>
          <select
            id="settings-model"
            value={draftModel}
            onChange={(e) => setDraftModel(e.target.value)}
            className="settings-select"
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.label} — {m.cost}</option>
            ))}
          </select>

          <label className="settings-label">Display size</label>
          <div className="settings-stepper">
            <button
              type="button"
              className="settings-step-btn"
              aria-label="Decrease display size"
              onClick={() => stepScale(-UI_SCALE_STEP)}
              disabled={uiScale <= UI_SCALE_MIN}
            ><span aria-hidden="true">−</span></button>
            <span className="settings-step-value">{pct}%</span>
            <button
              type="button"
              className="settings-step-btn"
              aria-label="Increase display size"
              onClick={() => stepScale(UI_SCALE_STEP)}
              disabled={uiScale >= UI_SCALE_MAX}
            ><span aria-hidden="true">+</span></button>
          </div>

          <p className="settings-privacy">
            Key is stored only in this browser. Never sent to Tallio servers.
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
