// src/ActionMenu.jsx
// Shared kebab (⋮) menu used by the Image Icons tab and Background photo cells.
import React, { useState, useRef, useEffect } from 'react';

export default function ActionMenu({ label, items = [] }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState('left');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Default: open to the right (left-aligned popover). Flip to opening left
  // (right-aligned) only when a right-opening menu would run past the right
  // viewport edge — i.e. the rightmost icon. Decided at open time from the
  // trigger's position (no set-state-in-effect).
  const toggle = (e) => {
    if (!open) {
      const r = e.currentTarget.getBoundingClientRect();
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      setAlign(r.left + 180 > vw - 8 ? 'right' : 'left');
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
