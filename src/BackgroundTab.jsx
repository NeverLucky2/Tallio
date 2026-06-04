import React, { useState, useEffect, useRef } from 'react';
import { WALLPAPERS } from './wallpapers.js';
import { togglePhotoSelection, clampFraming, panFraming, pruneDeletedPhoto } from './backgroundPhotos.js';

const BASES = [
  { id: 'solid', label: 'Solid' },
  { id: 'preset', label: 'Wallpaper' },
  { id: 'photos', label: 'Your photos' },
];

export default function BackgroundTab({ appearance, images = [], onUpload, onRename, onDelete }) {
  const { background, updateBackground } = appearance;
  const { base, presetId, effects, intensity } = background;

  const toggle = (key) => updateBackground({ effects: { ...effects, [key]: !effects[key] } });
  const anyEffect = effects.aurora || effects.pulse;

  const photoIds = background.photoIds || [];
  const togglePhoto = (id) => updateBackground({ photoIds: togglePhotoSelection(photoIds, id, background.mode) });
  const groups = Array.from(new Set(images.map(i => i.group).filter(Boolean)));

  const framing = background.framing || {};
  const [editingId, setEditingId] = useState(null);
  const [editUrl, setEditUrl] = useState(null);

  const setFraming = (id, patch) => {
    const next = clampFraming({ ...framing[id], ...patch });
    updateBackground({ framing: { ...framing, [id]: next } });
  };

  // Object URL for the editor preview: created when the editor opens, revoked on
  // change/close (jsdom throws on createObjectURL — guard it). setState-in-effect
  // is intentional here — the URL is an external resource tied to this lifecycle.
  useEffect(() => {
    const img = editingId ? images.find(i => i.id === editingId) : null;
    let url = null;
    if (img && img.blob) { try { url = URL.createObjectURL(img.blob); } catch { url = null; } }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditUrl(url);
    return () => { if (url) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } } };
  }, [editingId, images]);

  const onFocalKey = (e) => {
    const f = clampFraming(framing[editingId]);
    const step = 2;
    const map = {
      ArrowLeft: { posX: f.posX - step }, ArrowRight: { posX: f.posX + step },
      ArrowUp: { posY: f.posY - step }, ArrowDown: { posY: f.posY + step },
    };
    if (map[e.key]) { e.preventDefault(); setFraming(editingId, map[e.key]); }
  };

  // Drag the image to pan it (grab-and-move): record the start, then pan by delta.
  const dragRef = useRef(null);
  const onDragStart = (e) => {
    if (!editingId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { x: e.clientX, y: e.clientY, start: clampFraming(framing[editingId]), w: rect.width, h: rect.height };
    if (e.currentTarget.setPointerCapture) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
  };
  const onDragMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setFraming(editingId, panFraming(d.start, e.clientX - d.x, e.clientY - d.y, d.w, d.h));
  };
  const onDragEnd = () => { dragRef.current = null; };

  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const commitRename = (id) => {
    if (onRename && renameDraft.trim()) onRename(id, renameDraft.trim());
    setRenamingId(null);
  };
  const doDelete = (id) => {
    if (onDelete) onDelete(id);
    updateBackground(pruneDeletedPhoto(background, id));
    setConfirmDeleteId(null);
    if (editingId === id) setEditingId(null);
  };

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
                <div key={img.id} className="bg-photo-item">
                  {confirmDeleteId === img.id ? (
                    <div className="bg-photo-confirm">
                      <button type="button" className="bg-photo-action danger" aria-label={`confirm delete ${img.name}`} onClick={() => doDelete(img.id)}>Delete</button>
                      <button type="button" className="bg-photo-action" aria-label={`cancel delete ${img.name}`} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      type="button" className="bg-photo-delete" aria-label={`delete ${img.name}`}
                      onClick={() => setConfirmDeleteId(img.id)}
                    >×</button>
                  )}
                  {renamingId === img.id ? (
                    <input
                      className="bg-photo-rename" aria-label={`Name for ${img.name}`}
                      autoFocus value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => commitRename(img.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(img.id); }}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-label={`select ${img.name}`}
                      className={`bg-photo-cell${photoIds.includes(img.id) ? ' selected' : ''}`}
                      onClick={() => togglePhoto(img.id)}
                    >
                      {img.name}
                    </button>
                  )}
                  <div className="bg-photo-actions">
                    {photoIds.includes(img.id) && (
                      <button
                        type="button" className="bg-photo-action" aria-label={`adjust ${img.name}`}
                        onClick={() => setEditingId(editingId === img.id ? null : img.id)}
                      >Adjust</button>
                    )}
                    <button
                      type="button" className="bg-photo-action" aria-label={`rename ${img.name}`}
                      onClick={() => { setRenamingId(img.id); setRenameDraft(img.name); }}
                    >Rename</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {editingId && (() => {
            const f = clampFraming(framing[editingId]);
            return (
              <div className="bg-framing-editor">
                <div
                  className="bg-framing-clip"
                  role="slider"
                  tabIndex={0}
                  aria-label="Focal point — drag or use arrow keys"
                  aria-valuetext={`${f.posX}% ${f.posY}%`}
                  onPointerDown={onDragStart}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragEnd}
                  onPointerLeave={onDragEnd}
                  onKeyDown={onFocalKey}
                >
                  {/* Inner image uses the SAME technique as BackgroundLayer (cover + position + scale) for WYSIWYG. */}
                  <div
                    className="bg-framing-img"
                    style={editUrl ? {
                      backgroundImage: `url(${editUrl})`,
                      backgroundPosition: `${f.posX}% ${f.posY}%`,
                      transform: `scale(${f.zoom})`,
                      transformOrigin: `${f.posX}% ${f.posY}%`,
                    } : undefined}
                  />
                </div>
                <label className="appearance-label" htmlFor="bg-zoom">
                  Zoom
                  <input
                    id="bg-zoom" type="range" min="1" max="3" step="0.1" className="bg-intensity"
                    aria-label="Zoom" value={f.zoom}
                    onChange={(e) => setFraming(editingId, { zoom: Number(e.target.value) })}
                  />
                </label>
                <button type="button" className="bg-mode-btn" onClick={() => setEditingId(null)}>Done</button>
              </div>
            );
          })()}

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

      {anyEffect && (
        <>
          <label className="appearance-label" htmlFor="bg-effect-strength">Effect strength — subtle ↔ vivid</label>
          <input
            id="bg-effect-strength" type="range" min="0" max="100" className="bg-intensity"
            aria-label="Effect strength"
            value={background.effectStrength ?? 50}
            onChange={(e) => updateBackground({ effectStrength: Number(e.target.value) })}
          />
        </>
      )}
    </div>
  );
}
