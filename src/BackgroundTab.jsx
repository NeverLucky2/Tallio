import React from 'react';

export default function BackgroundTab({ appearance }) {
  const { background, updateBackground } = appearance;
  const { effects, intensity } = background;

  const toggle = (key) => updateBackground({ effects: { ...effects, [key]: !effects[key] } });

  return (
    <div className="background-tab">
      <div className="appearance-label">Base background</div>
      <p className="appearance-hint">Solid (your theme). Preset wallpapers and your own photos arrive in the next update.</p>

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
