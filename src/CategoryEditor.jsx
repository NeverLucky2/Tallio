import { useState, useEffect } from 'react';
import Icon from './Icon.jsx';
import { iconGlyph } from './iconValue.js';
import IconPicker from './IconPicker.jsx';
import ColorPicker from './ColorPicker.jsx';
import ChipEditor from './ChipEditor.jsx';

const FLOW_OPTIONS = [
  { key: 'income',   label: 'Income'   },
  { key: 'expense',  label: 'Expense'  },
  { key: 'savings',  label: 'Savings'  },
  { key: 'transfer', label: 'Transfer' },
];

function FlowControl({ value, onChange }) {
  return (
    <div className="flow-control" role="radiogroup" aria-label="Category flow">
      {FLOW_OPTIONS.map(opt => (
        <label
          key={opt.key}
          className={`flow-control-option${value === opt.key ? ' active' : ''}`}
        >
          <input
            type="radio"
            name="flow"
            value={opt.key}
            checked={value === opt.key}
            onChange={() => onChange(opt.key)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function FlowChangeDialog({ category, fromFlow, toFlow, itemCount, onConfirm, onCancel }) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">Change flow on "{category.name}"?</h2>
        <p className="dialog-body">
          Changing this category from <strong>{fromFlow}</strong> to <strong>{toFlow}</strong> will reclassify {itemCount} item{itemCount === 1 ? '' : 's'} into the {toFlow === 'income' ? 'Income' : toFlow === 'savings' ? 'Saved' : toFlow === 'transfer' ? 'Transfer' : 'Spent'} bucket. This affects past months too.
        </p>
        <div className="dialog-actions">
          <button className="btn dialog-btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary dialog-btn-confirm" onClick={onConfirm} autoFocus>Continue</button>
        </div>
      </div>
    </div>
  );
}

export default function CategoryEditor({
  category,
  itemCount,
  otherCategories,
  onMoveAll,
  onUpdate,
  onAddKeyword,
  onRemoveKeyword,
  onAddTemplate,
  onRemoveTemplate,
  onDelete,
  onAddSub,
  onEditSub,
  onPromoteKeyword,
}) {
  const [name, setName] = useState(category.name);
  const [nameError, setNameError] = useState('');
  const [moveTarget, setMoveTarget] = useState('');
  const [pendingFlow, setPendingFlow] = useState(null);

  useEffect(() => {
    setName(category.name);
    setNameError('');
    setMoveTarget('');
    setPendingFlow(null);
  }, [category.id, category.name]);

  const commitName = () => {
    const v = name.trim();
    if (!v) { setNameError('Name required'); return; }
    setNameError('');
    if (v !== category.name) onUpdate({ name: v });
  };

  const handleFlowSelect = (nextFlow) => {
    if (nextFlow === category.flow) return;
    if (itemCount === 0) {
      onUpdate({ flow: nextFlow });
    } else {
      setPendingFlow(nextFlow);
    }
  };

  const confirmFlowChange = () => {
    if (pendingFlow) onUpdate({ flow: pendingFlow });
    setPendingFlow(null);
  };

  return (
    <div className="cat-editor">
      <div className="cat-editor-header">
        <span className="cat-editor-icon" style={{ background: `${category.color}22` }}>
          <Icon value={category.icon} />
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
          <span className="cat-editor-label">Flow</span>
          <FlowControl value={category.flow || 'expense'} onChange={handleFlowSelect} />
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
          onPromote={onPromoteKeyword}
          placeholder="Add keyword (e.g. PEOPLES GAS)"
        />
      </div>

      <div className="cat-editor-section">
        <div className="cat-editor-section-title">
          Sub-categories <span className="cat-editor-section-hint">({(category.subcategories || []).length})</span>
        </div>
        <div className="sub-list">
          {(category.subcategories || []).map(s => (
            <button
              key={s.id}
              type="button"
              className="sub-list-row"
              onClick={() => onEditSub(s.id)}
              style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center', textAlign: 'left', padding: '6px 10px' }}
            >
              <span className="sub-list-name">{s.name}</span>
              {(s.keywords || []).length > 0 && (
                <span className="sub-list-kw" style={{ opacity: 0.6 }}>— {s.keywords.join(', ')}</span>
              )}
              <span style={{ marginLeft: 'auto' }}>›</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={onAddSub}>+ Add sub-category</button>
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
        {itemCount > 0 && !pendingFlow && (
          <div className="cat-editor-move-all">
            <span className="cat-editor-delete-hint">
              Move {itemCount} item{itemCount === 1 ? '' : 's'} to:
            </span>
            <select
              className="cat-editor-input"
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
            >
              <option value="">— pick a category —</option>
              {(otherCategories || []).map(c => (
                <option key={c.id} value={c.id}>{iconGlyph(c.icon)} {c.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={!moveTarget}
              onClick={() => { onMoveAll(moveTarget); setMoveTarget(''); }}
            >
              Move all
            </button>
          </div>
        )}
      </div>

      {pendingFlow && (
        <FlowChangeDialog
          category={category}
          fromFlow={category.flow || 'expense'}
          toFlow={pendingFlow}
          itemCount={itemCount}
          onConfirm={confirmFlowChange}
          onCancel={() => setPendingFlow(null)}
        />
      )}
    </div>
  );
}
