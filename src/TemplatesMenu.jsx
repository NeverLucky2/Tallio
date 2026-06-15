// src/TemplatesMenu.jsx
// Labeled "Templates ▾" dropdown: click an item to apply, × to delete.
// Reuses the .action-menu-popover / .action-menu-item styling.
import React, { useState, useRef, useEffect } from 'react';

export default function TemplatesMenu({ templates = [], onApply, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (templates.length === 0) return null;

  return (
    <span className="action-menu" ref={ref} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        Templates ▾
      </button>
      {open && (
        <div className="action-menu-popover align-left template-menu" role="menu">
          {templates.map((t) => (
            <div key={t.id} className="template-menu-row">
              <button type="button" role="menuitem" className="action-menu-item template-menu-apply"
                onClick={() => { setOpen(false); onApply(t); }}>
                {t.kind === 'transfer' ? '⇄ ' : ''}{t.name}
              </button>
              <button type="button" className="template-menu-del" aria-label={`Delete template ${t.name}`}
                onClick={() => onDelete(t.id)}>×</button>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
