// src/TransferEditor.jsx
import React, { useState } from 'react';
import { nanoid } from 'nanoid';
import { iconGlyph } from './iconValue.js';
import { groupAccounts, suggestTransferCategoryId, DEFAULT_ACCOUNT_TYPES, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';
import SplitsEditor from './SplitsEditor.jsx';
import UndoButton from './UndoButton.jsx';
import { makeTransferDraft } from './entryDrafts.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TransferEditor({ accounts = [], categories = [], fromAccountId = null, toAccountId = null, initialAmount = null, transfer = null, prefill = null, types = DEFAULT_ACCOUNT_TYPES, typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, onSave, onDelete, onClose, onUndo, undoCount = 0, onSaveAsTemplate = null }) {
  const groups = groupAccounts(accounts, types, typesById);
  const isEdit = !!transfer;
  const [fromId, setFromId] = useState(transfer ? transfer.fromLeg.accountId : (prefill?.fromId || fromAccountId || (accounts[0] && accounts[0].id) || ''));
  const [toId, setToId]     = useState(transfer ? transfer.toLeg.accountId : (prefill?.toId || toAccountId || ''));
  const [date, setDate]     = useState(transfer ? (transfer.fromLeg.date || todayISO()) : (prefill?.date || todayISO()));
  const [magnitude, setMagnitude]     = useState(transfer ? Math.abs(transfer.fromLeg.amount) : (prefill ? String(prefill.amount) : (initialAmount != null ? String(initialAmount) : '')));
  const [description, setDescription] = useState(transfer ? (transfer.fromLeg.description || '') : (prefill?.description || ''));
  const transferCats = (categories || [])
    .filter(c => c && c.flow === 'transfer')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const [categoryId, setCategoryId] = useState(
    transfer
      ? (transfer.fromLeg.categoryId || '')
      : (prefill?.categoryId || suggestTransferCategoryId(accounts.find(a => a.id === (toAccountId || '')), transferCats) || '')
  );
  const [typeTouched, setTypeTouched] = useState(false);
  const [splits, setSplits] = useState(transfer?.fromLeg?.splits ?? prefill?.splits ?? null);
  const [splitTargets, setSplitTargets] = useState(prefill?.splitTargets instanceof Map ? prefill.splitTargets : new Map());
  const [splitsOpen, setSplitsOpen] = useState(false);

  const hasSplits = Array.isArray(splits) && splits.length > 0;

  const onToChange = (e) => {
    const next = e.target.value;
    setToId(next);
    if (!isEdit && !typeTouched) {
      setCategoryId(suggestTransferCategoryId(accounts.find(a => a.id === next), transferCats) || '');
    }
  };
  const onTypeChange = (e) => { setTypeTouched(true); setCategoryId(e.target.value); };

  const splitSum = hasSplits ? splits.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0) : 0;
  const mag = hasSplits ? Math.abs(splitSum) : Math.abs(parseFloat(magnitude) || 0);
  const sameAccount = !!fromId && !!toId && fromId === toId;
  const valid = !!fromId && !!toId && !sameAccount && mag > 0;

  const sourceAmount = -1 * mag;

  const openSplits = () => {
    if (!hasSplits) {
      const fallbackCat = categoryId || (categories[0] && categories[0].id) || '';
      setSplits([
        { id: nanoid(8), amount: sourceAmount, categoryId: fallbackCat, description: '' },
        { id: nanoid(8), amount: 0,            categoryId: fallbackCat, description: '' },
      ]);
    }
    setSplitsOpen(true);
  };

  const save = () => {
    if (!valid) return;
    onSave({
      ...(transfer ? { transferId: transfer.transferId } : {}),
      fromId, toId, amount: mag, date, description: description.trim(),
      categoryId: categoryId || null,
      ...(hasSplits ? { splits, splitTargets } : {}),
    });
  };

  const buildTemplateDraft = () => makeTransferDraft({
    fromId, toId, amount: mag, categoryId: categoryId || null, description: description.trim(),
    splits: hasSplits ? splits : null,
  }, splitTargets);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">{isEdit ? 'Edit transfer' : 'New transfer'}</h2>

        <label className="field"><span>From</span>
          <select aria-label="From account" value={fromId} onChange={(e) => setFromId(e.target.value)} className="select">
            {groups.map(({ group, accounts: list }) => (
              <optgroup key={group} label={group}>
                {list.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="field"><span>To</span>
          <select aria-label="To account" value={toId} onChange={onToChange} className="select">
            <option value="">Select account…</option>
            {groups.map(({ group, accounts: list }) => (
              <optgroup key={group} label={group}>
                {list.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="field"><span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </label>

        <label className="field"><span>Amount</span>
          <input type="number" step="0.01" aria-label="Amount" value={hasSplits ? Math.abs(splitSum) : magnitude} onChange={(e) => setMagnitude(e.target.value)} disabled={hasSplits} className="input" />
        </label>

        <label className="field"><span>Notes</span>
          <input type="text" aria-label="Notes" value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
        </label>

        <label className="field"><span>Type</span>
          <select aria-label="Type" value={categoryId} onChange={onTypeChange} className="select">
            <option value="">— None —</option>
            {transferCats.map(c => <option key={c.id} value={c.id}>{iconGlyph(c.icon)} {c.name}</option>)}
          </select>
        </label>

        {hasSplits ? (
          <div className="field">
            <span>Source leg</span>
            <span className="split-summary">▼ {splits.length} split lines</span>
            <button type="button" className="btn" onClick={openSplits}>Edit splits…</button>
          </div>
        ) : (
          <div className="field">
            <button type="button" className="btn" onClick={openSplits}>Split source leg…</button>
          </div>
        )}

        {sameAccount && <p className="field-error">From and To must be different accounts.</p>}

        <div className="dialog-actions">
          <UndoButton count={undoCount} onUndo={onUndo} />
          {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(transfer.transferId)}>Delete</button>}
          {onSaveAsTemplate && <button type="button" className="btn" onClick={() => onSaveAsTemplate(buildTemplateDraft())}>Save as template…</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!valid}>Save</button>
        </div>

        {splitsOpen && (
          <SplitsEditor
            parentAccountId={fromId}
            parentAmount={hasSplits ? splits.reduce((s, l) => s + l.amount, 0) : sourceAmount}
            parentPayee=""
            parentDate={date}
            categories={categories}
            accounts={accounts}
            initialSplits={splits || []}
            initialSplitTargets={splitTargets}
            onDone={({ splits: ns, splitTargets: nt }) => { setSplits(ns); if (nt) setSplitTargets(nt); setSplitsOpen(false); }}
            onCancel={() => setSplitsOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
