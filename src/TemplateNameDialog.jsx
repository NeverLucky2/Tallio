// src/TemplateNameDialog.jsx
import React, { useState } from 'react';

export default function TemplateNameDialog({ defaultName = '', onSave, onCancel }) {
  const [name, setName] = useState(defaultName);
  const save = () => { const n = name.trim(); if (n) onSave(n); };
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card dialog-card-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">Save as template</h2>
        <label className="field"><span>Template name</span>
          <input type="text" autoFocus aria-label="Template name" className="input" value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!name.trim()}>Save template</button>
        </div>
      </div>
    </div>
  );
}
