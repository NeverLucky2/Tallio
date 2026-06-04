// src/TransactionEditor.jsx
import React, { useState } from 'react';
import { nanoid } from 'nanoid';
import { layoutFor, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';
import SplitsEditor from './SplitsEditor.jsx';
import UndoButton from './UndoButton.jsx';
import { groupCategoriesByFlow } from './categoriesView.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TransactionEditor({ account, transaction, categories, accounts = [], typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, onSave, onDelete, onClose, onUndo, undoCount = 0 }) {
  const isEdit = !!transaction;
  const initialAmount = transaction ? Math.abs(transaction.amount) : '';
  const initialDir = transaction ? (transaction.amount >= 0 ? 'in' : 'out') : 'out';

  const [date, setDate] = useState(transaction?.date || todayISO());
  const [description, setDescription] = useState(transaction?.description || '');
  const [magnitude, setMagnitude] = useState(initialAmount);
  const [direction, setDirection] = useState(initialDir);
  const [categoryId, setCategoryId] = useState(transaction?.categoryId || (categories[0] && categories[0].id) || '');
  const [payee, setPayee] = useState(transaction?.payee || '');
  const [checkNumber, setCheckNumber] = useState(transaction?.checkNumber || '');
  const [splits, setSplits] = useState(transaction?.splits ?? null);
  const [splitTargets, setSplitTargets] = useState(new Map());
  const [splitsOpen, setSplitsOpen] = useState(false);
  const [pendingSeed, setPendingSeed] = useState(null);

  const hasSplits = Array.isArray(splits) && splits.length > 0;
  const isBank = layoutFor(account.type, typesById) === 'bank';

  const parentAmount = (() => {
    if (hasSplits) return splits.reduce((s, l) => s + l.amount, 0);
    const mag = Math.abs(parseFloat(magnitude) || 0);
    return direction === 'in' ? mag : -mag;
  })();

  const openSplits = () => {
    setPendingSeed(hasSplits ? null : [
      { id: nanoid(8), amount: parentAmount || 0, categoryId, description: '' },
    ]);
    setSplitsOpen(true);
  };

  const onSplitsDone = ({ splits: nextSplits, splitTargets: nextTargets, categoryId: promotedCategoryId }) => {
    setPendingSeed(null);
    if (nextSplits === null) {
      setSplits(null);
      setSplitTargets(new Map());
      if (promotedCategoryId) setCategoryId(promotedCategoryId);
    } else {
      setSplits(nextSplits);
      if (nextTargets) setSplitTargets(nextTargets);
    }
    setSplitsOpen(false);
  };

  const save = () => {
    const amount = hasSplits ? splits.reduce((s, l) => s + l.amount, 0) : parentAmount;
    onSave({
      ...(transaction || {}),
      accountId: account.id,
      date,
      amount,
      categoryId: categoryId || null,
      description: description.trim(),
      payee: isBank ? (payee.trim() || null) : null,
      checkNumber: isBank ? (checkNumber.trim() || null) : null,
      splits: hasSplits ? splits : null,
      ...(hasSplits ? { splitTargets } : {}),
    });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">{isEdit ? 'Edit transaction' : 'New transaction'} · {account.name}</h2>

        <label className="field"><span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </label>

        <label className="field"><span>Description</span>
          <input type="text" aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
        </label>

        {isBank && (
          <>
            <label className="field"><span>Payee</span>
              <input type="text" aria-label="Payee" value={payee} onChange={(e) => setPayee(e.target.value)} className="input" />
            </label>
            <label className="field"><span>Check #</span>
              <input type="text" aria-label="Check number" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className="input" />
            </label>
          </>
        )}

        <div className="field">
          <span>Category</span>
          <select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="select">
            {groupCategoriesByFlow(categories).map(group => (
              <optgroup key={group.flow} label={group.label}>
                {group.items.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </optgroup>
            ))}
          </select>
          {hasSplits ? (
            <>
              <span className="split-summary">▼ {splits.length} split lines</span>
              <button type="button" className="btn" onClick={openSplits}>Edit splits…</button>
            </>
          ) : (
            <button type="button" className="btn" onClick={openSplits}>Split…</button>
          )}
        </div>

        <div className="field">
          <span>Amount</span>
          <div className="amount-row">
            <div className="dir-toggle" role="group" aria-label="Direction">
              <button type="button" className={`dir-btn${direction === 'out' ? ' active' : ''}`} aria-label="Money out" disabled={hasSplits} onClick={() => setDirection('out')}>− Out</button>
              <button type="button" className={`dir-btn${direction === 'in' ? ' active' : ''}`} aria-label="Money in" disabled={hasSplits} onClick={() => setDirection('in')}>+ In</button>
            </div>
            <input type="number" step="0.01" aria-label="Amount" value={hasSplits ? Math.abs(splits.reduce((s, l) => s + l.amount, 0)) : magnitude} onChange={(e) => setMagnitude(e.target.value)} disabled={hasSplits} className="input" />
          </div>
        </div>

        <div className="dialog-actions">
          <UndoButton count={undoCount} onUndo={onUndo} />
          {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(transaction.id)}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        </div>

        {splitsOpen && (
          <SplitsEditor
            parentAccountId={account.id}
            parentAmount={parentAmount}
            parentPayee={payee}
            parentDate={date}
            categories={categories}
            accounts={accounts}
            initialSplits={splits || pendingSeed || []}
            initialSplitTargets={splitTargets}
            onDone={onSplitsDone}
            onCancel={() => setSplitsOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
