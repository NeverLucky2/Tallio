// src/AccountEditor.jsx
import React, { useState } from 'react';
import { ACCOUNT_TYPES } from './accountsModel.js';

const TYPE_OPTIONS = ['bank', 'investment', 'credit_card', 'loan', 'mortgage', 'person', 'untyped'];

export default function AccountEditor({ account, onSave, onDelete, onClose }) {
  const isEdit = !!account;
  const [name, setName] = useState(account?.name || '');
  const [type, setType] = useState(account?.type || 'untyped');
  const [icon, setIcon] = useState(account?.icon || '🏦');
  const [openingBalance, setOpeningBalance] = useState(account?.openingBalance ?? 0);

  const save = () => {
    onSave({
      ...(account || {}),
      name: name.trim() || 'Unnamed',
      type,
      icon: icon || '🏦',
      openingBalance: Number(openingBalance) || 0,
    });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">{isEdit ? 'Edit account' : 'New account'}</h2>

        <label className="field"><span>Icon</span>
          <input type="text" aria-label="Icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="input" maxLength={4} />
        </label>
        <label className="field"><span>Name</span>
          <input type="text" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </label>
        <label className="field"><span>Type</span>
          <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className="select">
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{ACCOUNT_TYPES[t].label}</option>)}
          </select>
        </label>
        <label className="field"><span>Opening balance</span>
          <input type="number" step="0.01" aria-label="Opening balance" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="input" />
        </label>
        <p className="dialog-hint">For a credit card or loan, enter the amount owed as a negative number.</p>

        <div className="dialog-actions">
          {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(account.id)}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
