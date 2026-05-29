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
            {lines.map((line) => (
              <tr key={line.id} className="split-line-row">
                <td>{line.transferId ? 'Transfer' : 'Category'}</td>
                <td>
                  {line.transferId
                    ? (accounts.find(a => a.id === targets.get(line.id))?.name || '—')
                    : (categories.find(c => c.id === line.categoryId)?.name || '—')}
                </td>
                <td>{line.description}</td>
                <td className="right">{Number(line.amount).toFixed(2)}</td>
                <td></td>
              </tr>
            ))}
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
