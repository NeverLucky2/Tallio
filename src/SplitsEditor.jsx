// src/SplitsEditor.jsx
import React, { useState } from 'react';
import { nanoid } from 'nanoid';
import { validateSplits } from './accountsModel.js';
import { OTHER_CATEGORY_NAME } from './categoriesDefaults.js';

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
  const [pendingRemainder, setPendingRemainder] = useState(false);

  const parentCents = Math.round(parentAmount * 100);
  const sumCents = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? Math.round(l.amount * 100) : 0), 0);
  const remainingCents = parentCents - sumCents;
  const balanced = remainingCents === 0;

  const otherCategoryId = (categories.find(c => c.name === OTHER_CATEGORY_NAME) || categories[0] || {}).id;
  const fmtSigned = (cents) => (cents > 0 ? '+' : '') + (cents / 100).toFixed(2);
  const makeRemainderLine = () => ({ id: nanoid(8), amount: remainingCents / 100, categoryId: otherCategoryId, description: '' });
  const addRemainderLine = () => setLines(prev => [...prev, makeRemainderLine()]);

  const tryDone = () => {
    setError(null);
    if (!balanced) { setPendingRemainder(true); return; }
    try {
      validateSplits({ amount: parentAmount, splits: lines });
    } catch (e) {
      setError(e.message);
      return;
    }
    onDone({ splits: lines, splitTargets: targets });
  };

  const confirmRemainder = () => {
    setPendingRemainder(false);
    onDone({ splits: [...lines, makeRemainderLine()], splitTargets: targets });
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
                  updateLine({ categoryId: undefined, transferId: line.transferId || `tr_${line.id}` });
                }
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
                      <select aria-label="Category" className="select" value={line.categoryId || ''} onChange={(e) => updateLine({ categoryId: e.target.value })}>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td>
                    <input type="text" aria-label="Line description" className="input" value={line.description || ''} onChange={(e) => updateLine({ description: e.target.value })} />
                  </td>
                  <td className="right">
                    <input type="number" step="0.01" aria-label="Line amount" className="input" value={line.amount} onChange={(e) => updateLine({ amount: parseFloat(e.target.value) || 0 })} />
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label="Delete line"
                      className="btn-icon"
                      disabled={lines.length <= 2}
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
        <div className={`split-remaining ${balanced ? 'ok' : 'mismatch'}`}>
          {balanced ? (
            <>
              <span className="split-balanced">✓ Balanced</span>
              <span className="split-remaining-detail">Lines: {(sumCents / 100).toFixed(2)} · Bank: {parentAmount.toFixed(2)}</span>
            </>
          ) : (
            <>
              <span className="split-remaining-label">Remaining to allocate: {fmtSigned(remainingCents)}</span>
              <button type="button" className="btn btn-small" onClick={addRemainderLine}>+ Add remainder as line</button>
            </>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={doUnsplit} disabled={!canUnsplit}>Unsplit</button>
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={tryDone}>Done</button>
        </div>
        {pendingRemainder && (
          <div className="split-confirm" role="alertdialog" aria-label="Unallocated remainder">
            <p className="split-confirm-msg">
              The remaining {fmtSigned(remainingCents)} will be added as an “Other” line so the split balances the bank deposit. Continue?
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setPendingRemainder(false)}>Go back to edit</button>
              <button type="button" className="btn btn-primary" onClick={confirmRemainder}>OK, add it</button>
            </div>
          </div>
        )}
        {error && <p className="field-error">{error}</p>}
      </div>
    </div>
  );
}
