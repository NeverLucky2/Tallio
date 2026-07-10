// src/QuickCreateAccountType.jsx
// Lightweight nested dialog for creating an account type from within the account
// editor's Type selector. Captures the essentials (label, icon, class); layout and
// group default (compact / Unassigned) and are tuned later in the Account Types screen.
import React, { useState } from 'react';

const CLASS_OPTIONS = [
  { value: 'asset',     label: 'Asset (adds to net worth)' },
  { value: 'liability', label: 'Liability (amount owed)' },
  { value: 'offsheet',  label: 'Off balance sheet (tracker)' },
];

export default function QuickCreateAccountType({ onSubmit, onCancel }) {
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('🏷️');
  const [klass, setKlass] = useState('asset');

  const trimmed = label.trim();
  const submit = () => {
    if (!trimmed) return;
    onSubmit({ label: trimmed, icon: icon.trim() || '🏷️', klass });
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card dialog-card-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">New account type</h2>

        <label className="field"><span>Label</span>
          <input type="text" aria-label="Type label" className="input" autoFocus
            value={label} onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
        </label>

        <label className="field"><span>Icon</span>
          <input type="text" aria-label="Icon" className="input" maxLength={4}
            value={icon} onChange={(e) => setIcon(e.target.value)} />
        </label>

        <label className="field"><span>Class</span>
          <select aria-label="Class" className="select" value={klass} onChange={(e) => setKlass(e.target.value)}>
            {CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!trimmed}>Add</button>
        </div>
      </div>
    </div>
  );
}
