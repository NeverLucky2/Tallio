// src/ActionMenu.jsx
// Shared kebab (⋮) menu used by the Image Icons tab and Background photo cells.
import React, { useState, useRef, useEffect } from 'react';

export default function ActionMenu({ label, items = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <span className="action-menu" ref={ref} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <button
        type="button" className="action-menu-trigger"
        aria-haspopup="menu" aria-expanded={open} aria-label={label}
        onClick={() => setOpen(o => !o)}
      >⋮</button>
      {open && (
        <div className="action-menu-popover" role="menu">
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
