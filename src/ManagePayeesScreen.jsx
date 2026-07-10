// src/ManagePayeesScreen.jsx
// Payee maintenance: searchable list with usage counts, rename / set-default /
// merge / delete via a per-row ⋮ menu. Reuses the manage-* screen chrome.
import { useState, useMemo } from 'react';
import ActionMenu from './ActionMenu.jsx';
import CategoryPicker from './CategoryPicker.jsx';
import PayeePicker from './PayeePicker.jsx';
import UndoButton from './UndoButton.jsx';
import { iconGlyph } from './iconValue.js';

export default function ManagePayeesScreen({
  payees = [], transactions = [], categories = [],
  onClose, onRename, onSetDefaultCategory, onMerge, onDelete,
  onUndo, undoCount = 0,
}) {
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState(null);
  const [defaultForId, setDefaultForId] = useState(null);
  const [mergeSourceId, setMergeSourceId] = useState(null);
  const [mergeTargetId, setMergeTargetId] = useState(null);

  const usageCounts = useMemo(() => {
    const counts = new Map();
    for (const t of transactions) {
      if (t && t.payeeId) counts.set(t.payeeId, (counts.get(t.payeeId) || 0) + 1);
    }
    return counts;
  }, [transactions]);

  const defaultChip = (p) => {
    if (!p.defaultCategoryId) return null;
    const cat = categories.find(c => c.id === p.defaultCategoryId);
    if (!cat) return null;
    const sub = p.defaultSubcategoryId
      ? (cat.subcategories || []).find(s => s.id === p.defaultSubcategoryId)
      : null;
    return `${iconGlyph(cat.icon)} ${cat.name}${sub ? ` › ${sub.name}` : ''}`;
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? payees.filter(p => p.name.toLowerCase().includes(q)) : payees;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [payees, query]);

  const startRename = (p) => { setRenamingId(p.id); setRenameValue(p.name); setRenameError(null); };
  const commitRename = () => {
    const res = onRename(renamingId, renameValue);
    if (res && res.ok) { setRenamingId(null); setRenameError(null); }
    else if (res && res.reason === 'duplicate') setRenameError('That name already exists — use Merge instead.');
    else setRenameError('Enter a name.');
  };

  const commitMerge = () => {
    if (mergeSourceId && mergeTargetId) onMerge(mergeSourceId, mergeTargetId);
    setMergeSourceId(null);
    setMergeTargetId(null);
  };

  const confirmDelete = (p) => {
    const n = usageCounts.get(p.id) || 0;
    if (window.confirm(`Delete "${p.name}"? ${n} transaction${n === 1 ? '' : 's'} will lose this payee.`)) {
      onDelete(p.id);
    }
  };

  const mergeSource = payees.find(p => p.id === mergeSourceId) || null;
  const mergeCount = mergeSource ? (usageCounts.get(mergeSource.id) || 0) : 0;

  return (
    <div className="manage-screen">
      <header className="manage-header">
        <button type="button" className="btn" onClick={onClose}>‹ Back</button>
        <h1 className="manage-title">Manage Payees</h1>
        <UndoButton count={undoCount} onUndo={onUndo} />
      </header>

      <div className="manage-body">
        <div className="manage-list manage-payees-list">
          <input type="text" className="input" aria-label="Search payees" placeholder="Search payees…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className="manage-payees-items">
            {visible.map(p => {
              const n = usageCounts.get(p.id) || 0;
              return (
                <li key={p.id} className="manage-list-row manage-payee-row">
                  {renamingId === p.id ? (
                    <span className="manage-payee-rename">
                      <input type="text" className="input" aria-label="Rename payee" autoFocus
                        value={renameValue}
                        onChange={(e) => { setRenameValue(e.target.value); setRenameError(null); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                          else if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); }
                        }} />
                      <button type="button" className="btn" onClick={commitRename}>Save</button>
                      {renameError && <span className="manage-payee-error" role="alert">{renameError}</span>}
                    </span>
                  ) : (
                    <>
                      <span className="manage-list-name">{p.name}</span>
                      <span className="manage-list-count">{n} {n === 1 ? 'use' : 'uses'}</span>
                      {defaultChip(p) && <span className="manage-payee-chip">{defaultChip(p)}</span>}
                    </>
                  )}
                  {defaultForId === p.id && (
                    <CategoryPicker categories={categories} value={{ categoryId: p.defaultCategoryId, subId: p.defaultSubcategoryId }}
                      allowNone noneLabel="— No default —" ariaLabel={`Default category for ${p.name}`}
                      onChange={({ categoryId, subId }) => { onSetDefaultCategory(p.id, categoryId, subId); setDefaultForId(null); }} />
                  )}
                  <ActionMenu label={`Payee actions for ${p.name}`} items={[
                    { label: 'Rename', onSelect: () => startRename(p) },
                    { label: 'Set default category', onSelect: () => setDefaultForId(defaultForId === p.id ? null : p.id) },
                    { label: 'Merge into…', onSelect: () => { setMergeSourceId(p.id); setMergeTargetId(null); } },
                    { label: 'Delete', danger: true, onSelect: () => confirmDelete(p) },
                  ]} />
                </li>
              );
            })}
            {visible.length === 0 && <li className="manage-empty">No payees.</li>}
          </ul>
        </div>
      </div>

      {mergeSource && (
        <div className="dialog-overlay" onClick={() => setMergeSourceId(null)}>
          <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="dialog-title">Merge “{mergeSource.name}” into…</h2>
            <p className="manage-payee-merge-note">
              {mergeCount} transaction{mergeCount === 1 ? '' : 's'} will move to the target payee.
              The target keeps its own default category.
            </p>
            <PayeePicker ariaLabel="Merge target"
              payees={payees.filter(p => p.id !== mergeSource.id)}
              value={mergeTargetId} onChange={setMergeTargetId} />
            <div className="dialog-actions">
              <div className="dialog-actions-primary">
                <button type="button" className="btn" onClick={() => setMergeSourceId(null)}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={!mergeTargetId} onClick={commitMerge}>Merge</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
