// src/SplitsEditor.jsx
import React, { useState } from 'react';

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

  const sum = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0);
  const sumOk = Math.round(sum * 100) === Math.round(parentAmount * 100);

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
                  <td></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className={`split-sum ${sumOk ? 'ok' : 'mismatch'}`}>
          Sum of lines: {sum.toFixed(2)} · Bank impact: {parentAmount.toFixed(2)}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => onDone({ splits: lines, splitTargets: targets })}>Done</button>
        </div>
      </div>
    </div>
  );
}
