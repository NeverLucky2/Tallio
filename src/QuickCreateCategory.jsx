// src/QuickCreateCategory.jsx
// Lightweight nested dialog for creating a category from within a selector,
// without leaving the task. Captures only the essentials (name, icon, flow);
// advanced fields (color, keywords, sub-categories) stay in Manage Categories.
import React, { useState } from 'react';

const FLOWS = [
  { value: 'income',  label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'savings', label: 'Savings' },
];

export default function QuickCreateCategory({ initialName = '', flow = 'expense', lockFlow = false, onSubmit, onCancel }) {
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState('📋');
  const [flowValue, setFlowValue] = useState(
    ['income', 'expense', 'savings'].includes(flow) ? flow : 'expense'
  );

  const trimmed = name.trim();
  const submit = () => {
    if (!trimmed) return;
    onSubmit({ name: trimmed, icon: icon.trim() || '📋', flow: lockFlow ? flow : flowValue });
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card dialog-card-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">New category</h2>

        <label className="field"><span>Name</span>
          <input type="text" aria-label="Category name" className="input" autoFocus
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
        </label>

        <label className="field"><span>Icon</span>
          <input type="text" aria-label="Icon" className="input" maxLength={4}
            value={icon} onChange={(e) => setIcon(e.target.value)} />
        </label>

        {!lockFlow && (
          <label className="field"><span>Type</span>
            <select aria-label="Flow" className="select" value={flowValue} onChange={(e) => setFlowValue(e.target.value)}>
              {FLOWS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!trimmed}>Add</button>
        </div>
      </div>
    </div>
  );
}
