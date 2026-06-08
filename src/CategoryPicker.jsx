import { useState, useRef, useEffect, useMemo } from 'react';
import { iconGlyph } from './iconValue.js';
import { flattenForPicker, filterOptions } from './categoriesSearch.js';

const FLOW_LABELS = { income: 'Income', expense: 'Expense', savings: 'Savings', transfer: 'Transfer' };

export default function CategoryPicker({ categories, value, onChange, ariaLabel = 'Category' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const allOptions = useMemo(() => flattenForPicker(categories), [categories]);
  const options = useMemo(() => filterOptions(allOptions, query), [allOptions, query]);

  const selected =
    allOptions.find(o => value && o.categoryId === value.categoryId && (o.subId || null) === (value.subId || null)) ||
    allOptions.find(o => value && o.kind === 'category' && o.categoryId === value.categoryId) || null;

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setHighlight(0); }, [query, open]);

  const choose = (opt) => {
    onChange({ categoryId: opt.categoryId, subId: opt.kind === 'sub' ? opt.subId : null });
    setQuery('');
    setOpen(false);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[highlight]) choose(options[highlight]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  const triggerLabel = selected ? `${iconGlyph(selected.icon)} ${selected.path}` : 'Select category…';
  const showGroups = query.trim() === '';
  let lastFlow = null;

  return (
    <div className="cat-picker" ref={rootRef}>
      <button type="button" className="cat-picker-trigger select" aria-label={ariaLabel}
        aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="cat-picker-value">{triggerLabel}</span>
        <span className="cat-picker-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="cat-picker-popover">
          <input ref={inputRef} type="text" role="combobox" className="cat-picker-input input"
            aria-label={`${ariaLabel} search`} aria-expanded="true" placeholder="Type to filter…"
            value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} />
          <ul className="cat-picker-list" role="listbox">
            {options.map((o, i) => {
              const header = showGroups && o.flow !== lastFlow ? (lastFlow = o.flow, FLOW_LABELS[o.flow] || o.flow) : null;
              return (
                <span key={o.subId ? `${o.categoryId}:${o.subId}` : o.categoryId}>
                  {header && <li className="cat-picker-group" aria-hidden="true">{header}</li>}
                  <li role="option" aria-selected={i === highlight}
                    className={`cat-picker-option${o.kind === 'sub' ? ' is-sub' : ''}${i === highlight ? ' active' : ''}`}
                    onMouseEnter={() => setHighlight(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}>
                    <span className="cat-picker-opt-icon" aria-hidden="true">{iconGlyph(o.icon)}</span>
                    <span className="cat-picker-opt-name">{o.name}</span>
                  </li>
                </span>
              );
            })}
            {options.length === 0 && <li className="cat-picker-empty">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
