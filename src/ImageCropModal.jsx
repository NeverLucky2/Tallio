// src/ImageCropModal.jsx
// Square crop/zoom modal over an uploaded blob. Wraps the shared FramingEditor;
// on Done returns the chosen {posX,posY,zoom} for the caller to bake a thumb.
import React, { useState } from 'react';
import FramingEditor from './FramingEditor.jsx';
import { clampFraming } from './backgroundPhotos.js';

export default function ImageCropModal({ blob, initialFraming, onDone, onCancel }) {
  const [framing, setFraming] = useState(() => clampFraming(initialFraming));
  const patch = (p) => setFraming(prev => clampFraming({ ...prev, ...p }));

  return (
    <div
      className="modal-overlay" role="dialog" aria-modal="true" aria-label="Crop image"
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div className="modal crop-modal">
        <h3 className="modal-title">Position your image</h3>
        <FramingEditor blob={blob} framing={framing} onChange={patch} aspect="square" />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => onDone(framing)}>Done</button>
        </div>
      </div>
    </div>
  );
}
