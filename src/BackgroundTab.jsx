import React from 'react';
import { WALLPAPERS } from './wallpapers.js';

const BASES = [
  { id: 'solid', label: 'Solid' },
  { id: 'preset', label: 'Wallpaper' },
  { id: 'photos', label: 'Your photos' },
];

export default function BackgroundTab({ appearance }) {
  const { background, updateBackground } = appearance;
  const { base, presetId, effects, intensity } = background;

  const toggle = (key) => updateBackground({ effects: { ...effects, [key]: !effects[key] } });

  return (
    <div className="background-tab">
      <div className="appearance-label">Base background</div>
      <div className="bg-base-selector" role="group" aria-label="Base background">
        {BASES.map(b => (
          <button
            key={b.id} type="button"
            className={`bg-base-btn${base === b.id ? ' on' : ''}`}
            aria-pressed={base === b.id}
            onClick={() => updateBackground({ base: b.id })}
          >
            {b.label}
          </button>
        ))}
      </div>

      {base === 'preset' && (
        <div className="bg-wallpaper-grid">
          {WALLPAPERS.map(w => (
            <button
              key={w.id} type="button"
              className={`bg-wallpaper-swatch${presetId === w.id ? ' selected' : ''}`}
              aria-label={w.name}
              style={{ background: w.css }}
              onClick={() => updateBackground({ presetId: w.id })}
            >
              <span className="bg-wallpaper-name">{w.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="appearance-label">Effects — gentle motion behind your data</div>
      <div className="bg-effect-toggles">
        <button
          type="button" role="switch" aria-checked={effects.aurora} aria-label="Aurora drift"
          className={`bg-toggle${effects.aurora ? ' on' : ''}`} onClick={() => toggle('aurora')}
        >
          <span className="bg-toggle-knob" /> Aurora drift
        </button>
        <button
          type="button" role="switch" aria-checked={effects.pulse} aria-label="Nocturne pulse"
          className={`bg-toggle${effects.pulse ? ' on' : ''}`} onClick={() => toggle('pulse')}
        >
          <span className="bg-toggle-knob" /> Nocturne pulse
        </button>
      </div>

      <label className="appearance-label" htmlFor="bg-intensity">Intensity — readable ↔ immersive</label>
      <input
        id="bg-intensity" type="range" min="0" max="100" className="bg-intensity"
        aria-label="Background intensity"
        value={intensity}
        onChange={(e) => updateBackground({ intensity: Number(e.target.value) })}
      />
    </div>
  );
}
