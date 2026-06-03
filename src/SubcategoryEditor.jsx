import { useState, useEffect } from 'react';
import ChipEditor from './ChipEditor.jsx';

export default function SubcategoryEditor({ category, sub, onBack, onUpdate, onAddKeyword, onRemoveKeyword, onDelete }) {
  const [name, setName] = useState(sub.name);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    // Re-sync the local name draft when the edited sub changes (e.g. switching subs or undo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(sub.name);
    setNameError('');
  }, [sub.id, sub.name]);

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
            className="cat-editor-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
          />
          {nameError && <span className="cat-editor-error">{nameError}</span>}
        </label>
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
        <span className="cat-editor-delete-hint">Deleting moves its transactions back to {category.name}.</span>
      </div>
    </div>
  );
}
