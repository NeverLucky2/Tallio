// src/PayeePicker.jsx
// Searchable payee selector with inline create — CategoryPicker's interaction
// pattern (search, keyboard nav, drop-up, outside-click close) on a flat list.
import { useState, useRef, useEffect, useMemo } from 'react';

export default function PayeePicker({ payees = [], value = null, onChange, onCreate = null, ariaLabel = 'Payee' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const sorted = useMemo(
    () => [...payees].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [payees]
  );
  const q = query.trim();
  const options = useMemo(
    () => (q ? sorted.filter(p => p.name.toLowerCase().includes(q.toLowerCase())) : sorted),
    [sorted, q]
  );
  const selected = payees.find(p => p.id === value) || null;
  const exactExists = sorted.some(p => p.name.trim().toLowerCase() === q.toLowerCase());
  const showCreate = !!onCreate && q !== '' && !exactExists;

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  // Reset the highlighted option whenever the list changes or the popover opens.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setHighlight(0); }, [query, open]);

  // Same drop-direction heuristic as CategoryPicker: flip above the trigger only
  // when there isn't room below and there's more room above.
  const toggleOpen = (e) => {
    if (!open) {
      const r = e.currentTarget.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      const spaceBelow = vh - r.bottom;
      setDropUp(spaceBelow < 320 && r.top > spaceBelow);
    }
    setOpen(o => !o);
  };
  const choose = (id) => { onChange(id); setQuery(''); setOpen(false); };
  const create = () => {
    const id = onCreate(q);
    if (id) choose(id);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[highlight]) choose(options[highlight].id);
      else if (showCreate) create();
    }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className="cat-picker" ref={rootRef}>
      <button type="button" className="cat-picker-trigger select" aria-label={ariaLabel}
        aria-haspopup="listbox" aria-expanded={open} onClick={toggleOpen}>
        <span className="cat-picker-value">{selected ? selected.name : '— No payee —'}</span>
        <span className="cat-picker-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={`cat-picker-popover${dropUp ? ' drop-up' : ''}`}>
          <input ref={inputRef} type="text" role="combobox" className="cat-picker-input input"
            aria-label={`${ariaLabel} search`} aria-expanded="true" placeholder="Type to filter…"
            value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} />
          <ul className="cat-picker-list" role="listbox">
            <li role="option" aria-selected={!selected} className="cat-picker-option cat-picker-none"
              onMouseDown={(e) => e.preventDefault()} onClick={() => choose(null)}>
              — No payee —
            </li>
            {options.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === highlight}
                className={`cat-picker-option${i === highlight ? ' active' : ''}`}
                onMouseEnter={() => setHighlight(i)} onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p.id)}>
                <span className="cat-picker-opt-name">{p.name}</span>
              </li>
            ))}
            {options.length === 0 && <li className="cat-picker-empty">No matches</li>}
          </ul>
          {showCreate && (
            <button type="button" className="cat-picker-create"
              onMouseDown={(e) => e.preventDefault()} onClick={create}>
              ＋ New payee “{q}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
