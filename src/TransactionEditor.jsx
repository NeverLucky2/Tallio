// src/TransactionEditor.jsx
import React, { useState } from 'react';
import { layoutFor, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TransactionEditor({ account, transaction, categories, typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, onSave, onDelete, onClose }) {
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

  const isBank = layoutFor(account.type, typesById) === 'bank';

  const save = () => {
    const mag = Math.abs(parseFloat(magnitude) || 0);
    const amount = direction === 'in' ? mag : -mag;
    onSave({
      ...(transaction || {}),
      accountId: account.id,
      date,
      amount,
      categoryId,
      description: description.trim(),
      payee: isBank ? (payee.trim() || null) : null,
      checkNumber: isBank ? (checkNumber.trim() || null) : null,
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

        <label className="field"><span>Category</span>
          <select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="select">
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </label>

        <div className="field">
          <span>Amount</span>
          <div className="amount-row">
            <div className="dir-toggle" role="group" aria-label="Direction">
              <button type="button" className={`dir-btn${direction === 'out' ? ' active' : ''}`} aria-label="Money out" onClick={() => setDirection('out')}>− Out</button>
              <button type="button" className={`dir-btn${direction === 'in' ? ' active' : ''}`} aria-label="Money in" onClick={() => setDirection('in')}>+ In</button>
            </div>
            <input type="number" step="0.01" aria-label="Amount" value={magnitude} onChange={(e) => setMagnitude(e.target.value)} className="input" />
          </div>
        </div>

        <div className="dialog-actions">
          {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(transaction.id)}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
