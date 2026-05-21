// src/AccountTypeEditor.jsx
import React, { useState } from 'react';

const CLASS_OPTIONS = [
  { value: 'asset',     label: 'Asset (adds to net worth)' },
  { value: 'liability', label: 'Liability (amount owed)' },
  { value: 'offsheet',  label: 'Off balance sheet (tracker)' },
];

export default function AccountTypeEditor({ type, existingGroups = [], onSave, onDelete, onClose }) {
  const isEdit = !!type;
  const [icon, setIcon] = useState(type?.icon || '🏷️');
  const [label, setLabel] = useState(type?.label || '');
  const [klass, setKlass] = useState(type?.klass || 'offsheet');
  const [layout, setLayout] = useState(type?.layout || 'compact');
  const [group, setGroup] = useState(type?.group || '');

  const save = () => {
    onSave({
      ...(type || {}),
      label: label.trim() || 'Untitled',
      klass,
      layout,
      group: group.trim() || 'Unassigned',
      icon: icon || '🏷️',
    });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">{isEdit ? 'Edit account type' : 'New account type'}</h2>

        <label className="field"><span>Icon</span>
          <input type="text" aria-label="Icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="input" maxLength={4} />
        </label>
        <label className="field"><span>Label</span>
          <input type="text" aria-label="Label" value={label} onChange={(e) => setLabel(e.target.value)} className="input" />
        </label>
        <label className="field"><span>Class</span>
          <select aria-label="Class" value={klass} onChange={(e) => setKlass(e.target.value)} className="select">
            {CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="field"><span>Register layout</span>
          <select aria-label="Layout" value={layout} onChange={(e) => setLayout(e.target.value)} className="select">
            <option value="compact">Compact</option>
            <option value="bank">Bank (8-column)</option>
          </select>
        </label>
        <label className="field"><span>Group</span>
          <input type="text" aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value)} className="input" list="account-type-groups" />
          <datalist id="account-type-groups">
            {existingGroups.map(g => <option key={g} value={g} />)}
          </datalist>
        </label>

        <div className="dialog-actions">
          {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(type.id)}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
