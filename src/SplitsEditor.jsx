// src/SplitsEditor.jsx
import React, { useState } from 'react';
import { nanoid } from 'nanoid';
import { validateSplits } from './accountsModel.js';
import CategoryPicker from './CategoryPicker.jsx';

export default function SplitsEditor({
  parentAccountId,
  parentAmount,
  parentPayee = '',
  parentDate = '',
  categories = [],
  accounts = [],
  initialSplits = [],
  initialSplitTargets = new Map(),
  onDone,
  onCancel,
}) {
  const [lines, setLines] = useState(initialSplits);
  const [targets, setTargets] = useState(new Map(initialSplitTargets));
  const [error, setError] = useState(null);
  const [dirs, setDirs] = useState(new Map());
  const dirOf = (line) => dirs.get(line.id) ?? (line.amount < 0 ? 'out' : line.amount > 0 ? 'in' : 'out');

  const parentCents = Math.round(parentAmount * 100);
  const sumCents = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? Math.round(l.amount * 100) : 0), 0);

  const tryDone = () => {
    setError(null);
    if (lines.length < 2) {
      // A single line isn't a split — collapse back to a normal category.
      onDone({ splits: null, categoryId: lines[0]?.categoryId });
      return;
    }
    try {
      // The sum IS the amount, so the equality check is trivially satisfied;
      // this still enforces the structural invariants (≥2 lines, finite amounts,
      // exactly one of categoryId/transferId, unique ids).
      validateSplits({ amount: sumCents / 100, splits: lines });
    } catch (e) {
      setError(e.message);
      return;
    }
    onDone({ splits: lines, splitTargets: targets });
  };

  const categoryLines = lines.filter(l => l.categoryId);
  const canUnsplit = categoryLines.length > 0;
  const doUnsplit = () => {
    if (!canUnsplit) return;
    if (!window.confirm('Turn this back into a single-category transaction? Transfer lines and their counterparts will be deleted.')) return;
    const biggest = [...categoryLines].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    onDone({ splits: null, categoryId: biggest.categoryId });
  };

  return (
    <div className="dialog-overlay split-editor" onClick={onCancel}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">Edit splits — {parentPayee || parentDate} · {parentDate}</h2>
        <table className="split-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Category / Account</th>
              <th>Description</th>
              <th className="right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const isTransfer = !!line.transferId;
              const updateLine = (patch) => setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
              const setTarget = (accId) => setTargets(prev => { const next = new Map(prev); next.set(line.id, accId); return next; });
              const toggleType = () => {
                if (isTransfer) {
                  updateLine({ transferId: undefined, categoryId: categories[0]?.id || '' });
                } else {
                  updateLine({ categoryId: undefined, subId: undefined, transferId: line.transferId || `tr_${line.id}` });
                }
              };
              const setLineMagnitude = (mag) => updateLine({ amount: (dirOf(line) === 'in' ? 1 : -1) * Math.abs(mag) });
              const setLineDir = (dir) => {
                setDirs(prev => new Map(prev).set(line.id, dir));
                updateLine({ amount: (dir === 'in' ? 1 : -1) * Math.abs(line.amount) });
              };
              return (
                <tr key={line.id} className="split-line-row">
                  <td>
                    <button type="button" className={`dir-btn${!isTransfer ? ' active' : ''}`} onClick={() => isTransfer && toggleType()}>Category</button>
                    <button type="button" className={`dir-btn${isTransfer ? ' active' : ''}`} onClick={() => !isTransfer && toggleType()}>Transfer</button>
                  </td>
                  <td>
                    {isTransfer ? (
                      <select aria-label="Target account" className="select" value={targets.get(line.id) || ''} onChange={(e) => setTarget(e.target.value)}>
                        <option value="">Select account…</option>
                        {accounts.filter(a => a.id !== parentAccountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    ) : (
                      <CategoryPicker categories={categories} value={{ categoryId: line.categoryId, subId: line.subId || null }}
                        onChange={({ categoryId, subId }) => updateLine({ categoryId, subId })} ariaLabel="Category" />
                    )}
                  </td>
                  <td>
                    <input type="text" aria-label="Line description" className="input" value={line.description || ''} onChange={(e) => updateLine({ description: e.target.value })} />
                  </td>
                  <td className="right">
                    <span className="dir-toggle" role="group" aria-label="Line direction">
                      <button type="button" className={`dir-btn${dirOf(line) === 'out' ? ' active' : ''}`} aria-label="Line out" onClick={() => setLineDir('out')}>− Out</button>
                      <button type="button" className={`dir-btn${dirOf(line) === 'in' ? ' active' : ''}`} aria-label="Line in" onClick={() => setLineDir('in')}>+ In</button>
                    </span>
                    <input type="number" step="0.01" min="0" aria-label="Line amount" className="input" value={Math.abs(line.amount)} onChange={(e) => setLineMagnitude(parseFloat(e.target.value) || 0)} />
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label="Delete line"
                      className="btn-icon"
                      disabled={lines.length <= 1}
                      onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                    >×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div>
          <button type="button" className="btn" onClick={() => {
            setLines(prev => [...prev, { id: nanoid(8), amount: 0, categoryId: categories[0]?.id || '', description: '' }]);
          }}>+ Add line</button>
        </div>
        <div className="split-total">
          <span className="split-total-label">Total: {(sumCents / 100).toFixed(2)}</span>
          {parentCents !== sumCents && (
            <span className="split-total-note">updates amount from {(parentCents / 100).toFixed(2)}</span>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={doUnsplit} disabled={!canUnsplit}>Unsplit</button>
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={tryDone}>Done</button>
        </div>
        {error && <p className="field-error">{error}</p>}
      </div>
    </div>
  );
}
