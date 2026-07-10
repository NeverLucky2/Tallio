// src/TransactionEditor.jsx
import React, { useState } from 'react';
import { nanoid } from 'nanoid';
import { layoutFor, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';
import SplitsEditor from './SplitsEditor.jsx';
import UndoButton from './UndoButton.jsx';
import CategoryPicker from './CategoryPicker.jsx';
import { makeTransactionDraft } from './entryDrafts.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TransactionEditor({ account, transaction, categories, accounts = [], typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, prefill = null, onSave, onDelete, onClose, onUndo, undoCount = 0, onSaveAsTemplate = null, onAddCategory = null, onAddSub = null }) {
  const isEdit = !!transaction;
  const seed = transaction || prefill || null;
  const initialAmount = seed ? Math.abs(seed.amount) : '';
  const initialDir = seed ? (seed.amount >= 0 ? 'in' : 'out') : 'out';

  const [date, setDate] = useState(seed?.date || todayISO());
  const [description, setDescription] = useState(seed?.description || '');
  const [magnitude, setMagnitude] = useState(initialAmount);
  const [direction, setDirection] = useState(initialDir);
  const [categoryId, setCategoryId] = useState(seed?.categoryId || (categories[0] && categories[0].id) || '');
  const [subId, setSubId] = useState(seed?.subId ?? null);
  const [payee, setPayee] = useState(seed?.payee || '');
  const [checkNumber, setCheckNumber] = useState(seed?.checkNumber || '');
  const [splits, setSplits] = useState(seed?.splits ?? null);
  const [splitTargets, setSplitTargets] = useState(prefill?.splitTargets instanceof Map ? prefill.splitTargets : new Map());
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
      subId: subId || null, // explicit null so editing away a sub clears it (ledger drops null subId)
      description: description.trim(),
      payee: isBank ? (payee.trim() || null) : null,
      checkNumber: isBank ? (checkNumber.trim() || null) : null,
      splits: hasSplits ? splits : null,
      ...(hasSplits ? { splitTargets } : {}),
    });
  };

  const buildTemplateDraft = () => makeTransactionDraft({
    description: description.trim(),
    amount: parentAmount,
    categoryId, subId,
    payee: isBank ? (payee.trim() || null) : null,
    checkNumber: isBank ? (checkNumber.trim() || null) : null,
    splits: hasSplits ? splits : null,
  }, splitTargets);

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
          <CategoryPicker categories={categories} value={{ categoryId, subId }}
            onChange={({ categoryId: c, subId: s }) => { setCategoryId(c); setSubId(s); }} ariaLabel="Category"
            onCreateCategory={onAddCategory} onCreateSub={onAddSub}
            createFlow={direction === 'in' ? 'income' : 'expense'} />
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
          <div className="dialog-actions-secondary">
            <UndoButton count={undoCount} onUndo={onUndo} />
            {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(transaction.id)}>Delete</button>}
            {onSaveAsTemplate && <button type="button" className="btn" onClick={() => onSaveAsTemplate(buildTemplateDraft())}>Save as template…</button>}
          </div>
          <div className="dialog-actions-primary">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save}>Save</button>
          </div>
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
