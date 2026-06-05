// src/FramingEditor.jsx
// Drag-to-pan + zoom framing editor, extracted from BackgroundTab so the icon
// crop modal and the background framing share one WYSIWYG editor. Manages its
// own preview object URL (jsdom throws on createObjectURL — guarded). The parent
// owns/clamps the framing; this emits patches.
import React, { useState, useEffect, useRef } from 'react';
import { clampFraming, panFraming } from './backgroundPhotos.js';

export default function FramingEditor({ blob, framing, onChange, aspect = 'free' }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u = null;
    if (blob) { try { u = URL.createObjectURL(blob); } catch { u = null; } }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => { if (u) { try { URL.revokeObjectURL(u); } catch { /* ignore */ } } };
  }, [blob]);

  const f = clampFraming(framing);
  const dragRef = useRef(null);

  const onKey = (e) => {
    const step = 2;
    const map = {
      ArrowLeft: { posX: f.posX - step }, ArrowRight: { posX: f.posX + step },
      ArrowUp: { posY: f.posY - step }, ArrowDown: { posY: f.posY + step },
    };
    if (map[e.key]) { e.preventDefault(); onChange(map[e.key]); }
  };
  const onDown = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { x: e.clientX, y: e.clientY, start: f, w: rect.width, h: rect.height };
    if (e.currentTarget.setPointerCapture) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    onChange(panFraming(d.start, e.clientX - d.x, e.clientY - d.y, d.w, d.h));
  };
  const onUp = () => { dragRef.current = null; };

  return (
    <div className={`bg-framing-editor${aspect === 'square' ? ' framing-square' : ''}`}>
      <div
        className="bg-framing-clip"
        role="slider" tabIndex={0}
        aria-label="Focal point — drag or use arrow keys"
        aria-valuetext={`${f.posX}% ${f.posY}%`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        onKeyDown={onKey}
      >
        <div
          className="bg-framing-img"
          style={url ? {
            backgroundImage: `url(${url})`,
            backgroundPosition: `${f.posX}% ${f.posY}%`,
            transform: `scale(${f.zoom})`,
            transformOrigin: `${f.posX}% ${f.posY}%`,
          } : undefined}
        />
      </div>
      <label className="appearance-label" htmlFor="framing-zoom">
        Zoom
        <input
          id="framing-zoom" type="range" min="1" max="3" step="0.1" className="bg-intensity"
          aria-label="Zoom" value={f.zoom}
          onChange={(e) => onChange({ zoom: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
