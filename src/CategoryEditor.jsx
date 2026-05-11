import { useState, useEffect } from 'react';
import IconPicker from './IconPicker.jsx';
import ColorPicker from './ColorPicker.jsx';
import ChipEditor from './ChipEditor.jsx';

export default function CategoryEditor({
  category,
  itemCount,
  onUpdate,
  onAddKeyword,
  onRemoveKeyword,
  onAddTemplate,
  onRemoveTemplate,
  onDelete,
}) {
  const [name, setName] = useState(category.name);
  const [nameError, setNameError] = useState('');

  // Reset local draft when the selected category changes.
  useEffect(() => {
    setName(category.name);
    setNameError('');
  }, [category.id, category.name]);

  const commitName = () => {
    const v = name.trim();
    if (!v) {
      setNameError('Name required');
      return;
    }
    setNameError('');
    if (v !== category.name) onUpdate({ name: v });
  };

  return (
    <div className="cat-editor">
      <div className="cat-editor-header">
        <span className="cat-editor-icon" style={{ background: `${category.color}22` }}>
          {category.icon}
        </span>
        <span className="cat-editor-title">Editing: {category.name}</span>
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

        <label className="cat-editor-field">
          <span className="cat-editor-label">Icon</span>
          <IconPicker value={category.icon} onChange={(icon) => onUpdate({ icon })} />
        </label>

        <label className="cat-editor-field">
          <span className="cat-editor-label">Color</span>
          <ColorPicker value={category.color} onChange={(color) => onUpdate({ color })} />
        </label>
      </div>

      <div className="cat-editor-section">
        <div className="cat-editor-section-title">
          Auto-categorize keywords <span className="cat-editor-section-hint">(longest match wins)</span>
        </div>
        <ChipEditor
          values={category.keywords}
          onAdd={onAddKeyword}
          onRemove={onRemoveKeyword}
          placeholder="Add keyword (e.g. PEOPLES GAS)"
        />
      </div>

      <div className="cat-editor-section">
        <div className="cat-editor-section-title">
          Description templates <span className="cat-editor-section-hint">(quick-pick chips when entering items)</span>
        </div>
        <ChipEditor
          values={category.templates}
          onAdd={onAddTemplate}
          onRemove={onRemoveTemplate}
          placeholder="Add template (e.g. Gas)"
        />
      </div>

      <div className="cat-editor-footer">
        <button
          type="button"
          className="btn btn-danger"
          onClick={onDelete}
          disabled={itemCount > 0}
        >
          Delete
        </button>
        {itemCount > 0 && (
          <span className="cat-editor-delete-hint">
            Move {itemCount} item{itemCount === 1 ? '' : 's'} to another category before deleting.
          </span>
        )}
      </div>
    </div>
  );
}
