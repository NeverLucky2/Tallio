// src/TransferEditor.jsx
import React, { useState } from 'react';
import { groupAccounts, DEFAULT_ACCOUNT_TYPES, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TransferEditor({ accounts = [], fromAccountId = null, transfer = null, types = DEFAULT_ACCOUNT_TYPES, typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, onSave, onDelete, onClose }) {
  const groups = groupAccounts(accounts, types, typesById);
  const isEdit = !!transfer;
  const [fromId, setFromId] = useState(transfer ? transfer.fromLeg.accountId : (fromAccountId || (accounts[0] && accounts[0].id) || ''));
  const [toId, setToId]     = useState(transfer ? transfer.toLeg.accountId : '');
  const [date, setDate]     = useState(transfer ? (transfer.fromLeg.date || todayISO()) : todayISO());
  const [magnitude, setMagnitude]     = useState(transfer ? Math.abs(transfer.fromLeg.amount) : '');
  const [description, setDescription] = useState(transfer ? (transfer.fromLeg.description || '') : '');

  const mag = Math.abs(parseFloat(magnitude) || 0);
  const sameAccount = !!fromId && !!toId && fromId === toId;
  const valid = !!fromId && !!toId && !sameAccount && mag > 0;

  const save = () => {
    if (!valid) return;
    onSave({
      ...(transfer ? { transferId: transfer.transferId } : {}),
      fromId, toId, amount: mag, date, description: description.trim(),
    });
  };

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
          <select aria-label="To account" value={toId} onChange={(e) => setToId(e.target.value)} className="select">
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
          <input type="number" step="0.01" aria-label="Amount" value={magnitude} onChange={(e) => setMagnitude(e.target.value)} className="input" />
        </label>

        <label className="field"><span>Notes</span>
          <input type="text" aria-label="Notes" value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
        </label>

        {sameAccount && <p className="field-error">From and To must be different accounts.</p>}

        <div className="dialog-actions">
          {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(transfer.transferId)}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!valid}>Save transfer</button>
        </div>
      </div>
    </div>
  );
}
