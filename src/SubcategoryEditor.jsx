import { useState, useEffect } from 'react';
import ChipEditor from './ChipEditor.jsx';

export default function SubcategoryEditor({
  category,
  sub,
  creating = false,
  onBack,
  onUpdate,
  onCreate,
  onCancel,
  onAddKeyword,
  onRemoveKeyword,
  onDelete,
}) {
  const [name, setName] = useState(creating ? '' : sub.name);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (creating) return;
    // Re-sync the local draft when the edited sub changes (switching subs / undo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(sub.name);
    setNameError('');
  }, [creating, sub?.id, sub?.name]);

  const trimmed = name.trim();

  // ---- Create mode: the sub is added only on Save ----
  if (creating) {
    const canSave = trimmed.length > 0;
    const cancel = () => {
      if (trimmed && !window.confirm('Discard new sub-category?')) return;
      onCancel();
    };
    const save = () => {
      if (!canSave) { setNameError('Name required'); return; }
      onCreate(trimmed);
    };
    return (
      <div className="cat-editor">
        <div style={{ marginBottom: 8 }}>
          <button type="button" className="btn" onClick={cancel}>‹ Back to {category.name}</button>
        </div>
        <div className="cat-editor-header">
          <span className="cat-editor-title">{category.name} › (new sub-category)</span>
        </div>
        <div className="cat-editor-fields">
          <label className="cat-editor-field">
            <span className="cat-editor-label">Name</span>
            <input
              type="text"
              aria-label="Name"
              className="cat-editor-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {nameError && <span className="cat-editor-error">{nameError}</span>}
          </label>
        </div>
        <div className="sub-save-row">
          <button type="button" className="btn" onClick={cancel}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save}>Save</button>
        </div>
      </div>
    );
  }

  // ---- Edit mode: explicit Save + ✓ Saved, with blur as a silent safety net ----
  const dirty = trimmed.length > 0 && trimmed !== sub.name;
  const commitName = () => {
    const v = name.trim();
    if (!v) { setNameError('Name required'); return; }
    setNameError('');
    if (v !== sub.name) onUpdate({ name: v });
  };

  return (
    <div className="cat-editor">
      <div style={{ marginBottom: 8 }}>
        <button type="button" className="btn" onClick={onBack}>‹ Back to {category.name}</button>
      </div>
      <div className="cat-editor-header">
        <span className="cat-editor-title">{category.name} › {sub.name}</span>
      </div>

      <div className="cat-editor-fields">
        <label className="cat-editor-field">
          <span className="cat-editor-label">Name</span>
          <input
            type="text"
            aria-label="Name"
            className="cat-editor-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
          />
          {nameError && <span className="cat-editor-error">{nameError}</span>}
        </label>
        <div className="sub-save-row">
          {dirty ? (
            <>
              <span className="sub-saved-indicator unsaved">Unsaved changes</span>
              <button type="button" className="btn btn-primary" onClick={commitName}>Save</button>
            </>
          ) : (
            <span className="sub-saved-indicator">✓ Saved</span>
          )}
        </div>
      </div>

      <div className="cat-editor-section">
        <div className="cat-editor-section-title">
          Auto-categorize keywords <span className="cat-editor-section-hint">(longest match wins)</span>
        </div>
        <ChipEditor
          values={sub.keywords}
          onAdd={onAddKeyword}
          onRemove={onRemoveKeyword}
          placeholder="Add keyword (e.g. FEDERAL TAX)"
        />
      </div>

      <div className="cat-editor-footer">
        <button type="button" className="btn btn-danger" onClick={onDelete}>Delete sub-category</button>
        <span className="cat-editor-delete-hint">Deleting removes this sub-category.</span>
      </div>
    </div>
  );
}
