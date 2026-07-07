import { useState, useRef, useEffect, useMemo } from 'react';
import { iconGlyph } from './iconValue.js';
import { flattenForPicker, filterOptions } from './categoriesSearch.js';
import QuickCreateCategory from './QuickCreateCategory.jsx';

const FLOW_LABELS = { income: 'Income', expense: 'Expense', savings: 'Savings', transfer: 'Transfer' };

export default function CategoryPicker({ categories, value, onChange, ariaLabel = 'Category',
  onCreateCategory = null, createFlow = 'expense', lockCreateFlow = false, onCreateSub = null,
  allowNone = false, noneLabel = '— None —', createLabel = 'New category' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);
  const [subFor, setSubFor] = useState(null);   // parent categoryId whose sub-form is open
  const [subName, setSubName] = useState('');
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const allOptions = useMemo(() => flattenForPicker(categories), [categories]);
  const options = useMemo(() => filterOptions(allOptions, query), [allOptions, query]);

  const selected =
    allOptions.find(o => value && o.categoryId === value.categoryId && (o.subId || null) === (value.subId || null)) ||
    allOptions.find(o => value && o.kind === 'category' && o.categoryId === value.categoryId) || null;

  const q = query.trim();
  const exactExists = allOptions.some(o => o.kind === 'category' && (o.name || '').trim().toLowerCase() === q.toLowerCase());
  const showCreate = !!onCreateCategory && q !== '' && !exactExists;

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

  // Decide drop direction at open time from the trigger's viewport position, the way
  // ActionMenu decides horizontal alignment. The popover can be ~330px tall (search +
  // list + create footer); flip above the trigger only when there isn't room below and
  // there's more room above — keeps it on-screen inside centered, non-scrolling dialogs.
  const toggleOpen = (e) => {
    if (!open) {
      const r = e.currentTarget.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      const spaceBelow = vh - r.bottom;
      setDropUp(spaceBelow < 320 && r.top > spaceBelow);
    }
    setOpen(o => !o);
  };
  const choose = (opt) => {
    onChange({ categoryId: opt.categoryId, subId: opt.kind === 'sub' ? opt.subId : null });
    setQuery('');
    setOpen(false);
  };
  const createCategory = (payload) => {
    const id = onCreateCategory(payload);
    setCreating(false);
    setQuery('');
    setOpen(false);
    onChange({ categoryId: id, subId: null });
  };
  const commitSub = (parentId) => {
    const nm = subName.trim();
    if (!nm) return;
    const subId = onCreateSub(parentId, { name: nm });
    setSubFor(null);
    setSubName('');
    setQuery('');
    setOpen(false);
    onChange({ categoryId: parentId, subId });
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[highlight]) choose(options[highlight]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  const triggerLabel = selected
    ? `${iconGlyph(selected.icon)} ${selected.path}`
    : (allowNone ? noneLabel : 'Select category…');
  const showGroups = query.trim() === '';
  // Header shown before each option when not searching: the flow label at each
  // flow boundary. Derived by index (no render-time mutation) to stay immutable.
  const groupHeaders = options.map((o, i) =>
    showGroups && (i === 0 || options[i - 1].flow !== o.flow) ? (FLOW_LABELS[o.flow] || o.flow) : null);

  return (
    <div className="cat-picker" ref={rootRef}>
      <button type="button" className="cat-picker-trigger select" aria-label={ariaLabel}
        aria-haspopup="listbox" aria-expanded={open} onClick={toggleOpen}>
        <span className="cat-picker-value">{triggerLabel}</span>
        <span className="cat-picker-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={`cat-picker-popover${dropUp ? ' drop-up' : ''}`}>
          <input ref={inputRef} type="text" role="combobox" className="cat-picker-input input"
            aria-label={`${ariaLabel} search`} aria-expanded="true" placeholder="Type to filter…"
            value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} />
          <ul className="cat-picker-list" role="listbox">
            {allowNone && (
              <li role="option" aria-selected={!selected} className="cat-picker-option cat-picker-none"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange({ categoryId: null, subId: null }); setQuery(''); setOpen(false); }}>
                {noneLabel}
              </li>
            )}
            {options.map((o, i) => {
              const header = groupHeaders[i];
              return (
                <span key={o.subId ? `${o.categoryId}:${o.subId}` : o.categoryId}>
                  {header && <li className="cat-picker-group" aria-hidden="true">{header}</li>}
                  <li role="option" aria-selected={i === highlight}
                    className={`cat-picker-option${o.kind === 'sub' ? ' is-sub' : ''}${i === highlight ? ' active' : ''}`}
                    onMouseEnter={() => setHighlight(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}>
                    <span className="cat-picker-opt-icon" aria-hidden="true">{iconGlyph(o.icon)}</span>
                    <span className="cat-picker-opt-name">{o.name}</span>
                    {onCreateSub && o.kind === 'category' && (
                      <button type="button" className="cat-picker-subadd"
                        aria-label={`Add sub-category to ${o.name}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => { e.stopPropagation(); setSubFor(o.categoryId); setSubName(''); }}>
                        ＋ sub
                      </button>
                    )}
                  </li>
                  {onCreateSub && subFor === o.categoryId && o.kind === 'category' && (
                    <li className="cat-picker-subform">
                      <input type="text" className="input" aria-label={`New sub-category under ${o.name}`}
                        value={subName} autoFocus
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => setSubName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitSub(o.categoryId); }
                          else if (e.key === 'Escape') { e.preventDefault(); setSubFor(null); }
                        }} />
                      <button type="button" className="btn btn-small"
                        onMouseDown={(e) => e.preventDefault()} onClick={() => commitSub(o.categoryId)}>Add</button>
                    </li>
                  )}
                </span>
              );
            })}
            {options.length === 0 && <li className="cat-picker-empty">No matches</li>}
          </ul>
          {showCreate && (
            <button type="button" className="cat-picker-create"
              onMouseDown={(e) => e.preventDefault()} onClick={() => setCreating(true)}>
              ＋ {createLabel} “{q}”
            </button>
          )}
          {creating && (
            <QuickCreateCategory initialName={q} flow={createFlow} lockFlow={lockCreateFlow}
              onSubmit={createCategory} onCancel={() => setCreating(false)} />
          )}
        </div>
      )}
    </div>
  );
}
