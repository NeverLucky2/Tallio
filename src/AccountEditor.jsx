// src/AccountEditor.jsx
import React, { useState } from 'react';
import { DEFAULT_ACCOUNT_TYPES } from './accountsModel.js';
import UndoButton from './UndoButton.jsx';
import IconPicker from './IconPicker.jsx';
import QuickCreateAccountType from './QuickCreateAccountType.jsx';

export default function AccountEditor({ account, types = DEFAULT_ACCOUNT_TYPES, onSave, onDelete, onClose, onUndo, undoCount = 0, onAddType = null, initialName = '' }) {
  const isEdit = !!account;
  const [name, setName] = useState(account?.name || initialName || '');
  const [type, setType] = useState(account?.type || 'untyped');
  const [icon, setIcon] = useState(account?.icon || '🏦');
  const [openingBalance, setOpeningBalance] = useState(account?.openingBalance ?? 0);
  const [creatingType, setCreatingType] = useState(false);

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

        <div className="field"><span>Icon</span>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        <label className="field"><span>Name</span>
          <input type="text" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </label>
        <label className="field"><span>Type</span>
          <select aria-label="Type" value={type}
            onChange={(e) => {
              if (e.target.value === '__new_type__') setCreatingType(true);
              else setType(e.target.value);
            }} className="select">
            {types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            {onAddType && <option value="__new_type__">＋ New type…</option>}
          </select>
        </label>
        <label className="field"><span>Opening balance</span>
          <input type="number" step="0.01" aria-label="Opening balance" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="input" />
        </label>
        <p className="dialog-hint">For a credit card or loan, enter the amount owed as a negative number.</p>

        <div className="dialog-actions">
          <div className="dialog-actions-secondary">
            <UndoButton count={undoCount} onUndo={onUndo} />
            {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(account.id)}>Delete</button>}
          </div>
          <div className="dialog-actions-primary">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save}>Save</button>
          </div>
        </div>

        {creatingType && (
          <QuickCreateAccountType
            onSubmit={(p) => { const id = onAddType(p); setCreatingType(false); setType(id); }}
            onCancel={() => setCreatingType(false)} />
        )}
      </div>
    </div>
  );
}
