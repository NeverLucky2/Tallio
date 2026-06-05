// src/ActionMenu.jsx
// Shared kebab (⋮) menu used by the Image Icons tab and Background photo cells.
import React, { useState, useRef, useEffect } from 'react';

export default function ActionMenu({ label, items = [] }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState('right');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Right-aligned by default (popover extends left). Near the left viewport edge
  // that would clip off-screen, so flip to left-aligned. Decided at open time
  // from the trigger's position (no set-state-in-effect).
  const toggle = (e) => {
    if (!open) {
      const r = e.currentTarget.getBoundingClientRect();
      setAlign(r.left < 180 ? 'left' : 'right');
    }
    setOpen(o => !o);
  };

  return (
    <span className="action-menu" ref={ref} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <button
        type="button" className="action-menu-trigger"
        aria-haspopup="menu" aria-expanded={open} aria-label={label}
        onClick={toggle}
      >⋮</button>
      {open && (
        <div className={`action-menu-popover${align === 'left' ? ' align-left' : ''}`} role="menu">
          {items.map((it) => (
            <button
              key={it.label} type="button" role="menuitem"
              className={`action-menu-item${it.danger ? ' danger' : ''}`}
              onClick={() => { setOpen(false); it.onSelect(); }}
            >{it.label}</button>
          ))}
        </div>
      )}
    </span>
  );
}
