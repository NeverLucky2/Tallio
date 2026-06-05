// src/AccountTypesScreen.jsx
import React, { useState, useMemo } from 'react';
import Icon from './Icon.jsx';
import AccountTypeEditor from './AccountTypeEditor.jsx';
import UndoButton from './UndoButton.jsx';

export default function AccountTypesScreen({ types, accounts, onClose, onSaveType, onDeleteType, onUndo, undoCount = 0 }) {
  const [editing, setEditing] = useState(null);          // { type } | { type: null } | null
  const [pendingDelete, setPendingDelete] = useState(null); // { type, count }
  const [reassignTo, setReassignTo] = useState('');

  const existingGroups = useMemo(
    () => [...new Set(types.map(t => t.group).filter(Boolean))],
    [types]
  );
  const usageCount = (typeId) => (accounts || []).filter(a => a.type === typeId).length;

  const requestDelete = (type) => {
    const count = usageCount(type.id);
    setEditing(null);
    if (count === 0) { onDeleteType(type.id, null); return; }
    const fallback = types.find(t => t.id !== type.id);
    setReassignTo(fallback ? fallback.id : '');
    setPendingDelete({ type, count });
  };

  return (
    <div className="screen-overlay">
      <div className="screen">
        <div className="screen-header">
          <h2 className="screen-title">Account Types</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <UndoButton count={undoCount} onUndo={onUndo} />
            <button type="button" className="btn" onClick={onClose}>Done</button>
          </div>
        </div>

        <div className="type-list">
          {types.map(t => (
            <div key={t.id} className="type-row">
              <Icon value={t.icon} className="type-row-icon" />
              <span className="type-row-label">{t.label}</span>
              <span className="type-row-meta">{t.klass} · {t.layout} · {t.group}</span>
              <button type="button" className="btn" onClick={() => setEditing({ type: t })}>Edit</button>
            </div>
          ))}
        </div>

        <button type="button" className="btn btn-primary type-add" onClick={() => setEditing({ type: null })}>+ New type</button>

        {editing && (
          <AccountTypeEditor
            type={editing.type}
            existingGroups={existingGroups}
            onSave={(data) => { onSaveType(data); setEditing(null); }}
            onDelete={(id) => { const t = types.find(x => x.id === id); if (t) requestDelete(t); }}
            onClose={() => setEditing(null)}
          />
        )}

        {pendingDelete && (
          <div className="dialog-overlay" onClick={() => setPendingDelete(null)}>
            <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
              <h2 className="dialog-title">Delete “{pendingDelete.type.label}”?</h2>
              <p className="dialog-body">{pendingDelete.count} account{pendingDelete.count === 1 ? '' : 's'} uses this type. Move {pendingDelete.count === 1 ? 'it' : 'them'} to:</p>
              <select aria-label="Reassign to" className="select" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                {types.filter(t => t.id !== pendingDelete.type.id).map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <div className="dialog-actions">
                <button type="button" className="btn" onClick={() => setPendingDelete(null)}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={() => { onDeleteType(pendingDelete.type.id, reassignTo); setPendingDelete(null); }}>Delete &amp; reassign</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
