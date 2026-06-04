import React from 'react';
import { WALLPAPERS } from './wallpapers.js';
import { togglePhotoSelection } from './backgroundPhotos.js';

const BASES = [
  { id: 'solid', label: 'Solid' },
  { id: 'preset', label: 'Wallpaper' },
  { id: 'photos', label: 'Your photos' },
];

export default function BackgroundTab({ appearance, images = [], onUpload }) {
  const { background, updateBackground } = appearance;
  const { base, presetId, effects, intensity } = background;

  const toggle = (key) => updateBackground({ effects: { ...effects, [key]: !effects[key] } });

  const photoIds = background.photoIds || [];
  const togglePhoto = (id) => updateBackground({ photoIds: togglePhotoSelection(photoIds, id, background.mode) });
  const groups = Array.from(new Set(images.map(i => i.group).filter(Boolean)));

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

      {base === 'photos' && (
        <div className="bg-photos">
          <label className="bg-upload-btn">
            ↑ Upload photo
            <input
              type="file" accept="image/*" aria-label="Upload photo" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files[0]; if (f && onUpload) onUpload(f); e.target.value = ''; }}
            />
          </label>

          {images.length === 0 ? (
            <p className="appearance-hint">No photos yet — upload one to get started.</p>
          ) : (
            <div className="bg-photo-gallery">
              {images.map(img => (
                <button
                  key={img.id} type="button"
                  aria-label={`select ${img.name}`}
                  className={`bg-photo-cell${photoIds.includes(img.id) ? ' selected' : ''}`}
                  onClick={() => togglePhoto(img.id)}
                >
                  {img.name}
                </button>
              ))}
            </div>
          )}

          <div className="bg-mode-toggles">
            <button
              type="button" className={`bg-mode-btn${background.mode === 'single' ? ' on' : ''}`}
              aria-pressed={background.mode === 'single'} onClick={() => updateBackground({ mode: 'single' })}
            >Single</button>
            <button
              type="button" className={`bg-mode-btn${background.mode === 'slideshow' ? ' on' : ''}`}
              aria-pressed={background.mode === 'slideshow'} onClick={() => updateBackground({ mode: 'slideshow' })}
            >Slideshow</button>
          </div>

          {background.mode === 'slideshow' && (
            <label className="appearance-label" htmlFor="bg-interval">
              Interval
              <input
                id="bg-interval" type="number" min="5" max="600" className="bg-interval-input"
                aria-label="Slideshow interval (seconds)" value={background.intervalSec}
                onChange={(e) => updateBackground({ intervalSec: Number(e.target.value) })}
              />
            </label>
          )}

          <label className="appearance-label" htmlFor="bg-group">
            Use a group as the slideshow source
            <select
              id="bg-group" className="bg-group-select" aria-label="Slideshow group source"
              value={background.photoGroup || ''}
              onChange={(e) => updateBackground({ photoGroup: e.target.value || null })}
            >
              <option value="">None (use selected photos)</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
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
