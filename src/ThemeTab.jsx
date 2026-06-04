import React from 'react';
import { PRESETS, essentialsForTheme, contrastRatio } from './themes.js';

const CHANNELS = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Card surface' },
  { key: 'text', label: 'Text' },
  { key: 'accent', label: 'Accent' },
  { key: 'income', label: 'Income (green)' },
  { key: 'expense', label: 'Expense (red)' },
];

const MIN_CONTRAST = 4.5;

export default function ThemeTab({ appearance }) {
  const { themeId, customTheme, setTheme, updateCustom, resetCustomToPreset } = appearance;
  const essentials = essentialsForTheme(themeId, customTheme);
  const isCustom = themeId === 'custom';
  const sourcePreset = isCustom ? PRESETS[0].id : themeId;

  const lowText = contrastRatio(essentials.text, essentials.bg) < MIN_CONTRAST;
  const lowSurface = contrastRatio(essentials.text, essentials.surface) < MIN_CONTRAST;

  return (
    <div className="theme-tab">
      <div className="appearance-label">Preset themes</div>
      <div className="theme-swatches" role="radiogroup" aria-label="Preset themes">
        {PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={themeId === p.id}
            aria-label={p.name}
            className={`theme-swatch${themeId === p.id ? ' selected' : ''}`}
            style={{ background: p.essentials.bg, color: p.essentials.text }}
            onClick={() => setTheme(p.id)}
          >
            <span className="theme-swatch-dot" style={{ background: p.essentials.accent }} />
            {p.name}
          </button>
        ))}
      </div>

      <div className="appearance-label">My Theme — start from a preset, tweak</div>
      <div className="theme-editor">
        {CHANNELS.map(c => (
          <label key={c.key} className="theme-channel">
            <input
              type="color"
              aria-label={c.label}
              value={essentials[c.key]}
              onChange={(e) => updateCustom({ [c.key]: e.target.value })}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </div>

      {(lowText || lowSurface) && (
        <p className="theme-warning" role="status">⚠ Hard to read here — text and background are low contrast.</p>
      )}

      <button type="button" className="btn" onClick={() => resetCustomToPreset(sourcePreset)}>
        Reset to preset
      </button>
    </div>
  );
}
