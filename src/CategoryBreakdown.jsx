import { useState, useEffect } from 'react';
import ColorPicker from './ColorPicker.jsx';
import IconPicker from './IconPicker.jsx';

const FALLBACK = { name: 'Other', icon: '📋', color: '#6B7280' };

function lookup(categories, categoryId, otherCategoryId) {
  return categories.find(c => c.id === categoryId)
      || categories.find(c => c.id === otherCategoryId)
      || FALLBACK;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatMonthCompact(monthString) {
  if (!monthString || !/^\d{4}-\d{2}$/.test(monthString)) return '';
  const [y, m] = monthString.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatMonth(monthString) {
  if (!monthString || !/^\d{4}-\d{2}$/.test(monthString)) return '';
  const [y, m] = monthString.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function CategoryBreakdown({ items, categories, otherCategoryId, selectedMonth, onUpdateCategory }) {
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    if (!editingId) return;
    const handler = (e) => { if (e.key === 'Escape') setEditingId(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingId]);

  const totalsById = new Map();
  for (const item of items || []) {
    if (!item) continue;
    const id = item.categoryId || otherCategoryId;
    totalsById.set(id, (totalsById.get(id) || 0) + (item.amount || 0));
  }

  const sorted = [...totalsById.entries()]
    .map(([id, amount]) => ({ category: lookup(categories, id, otherCategoryId), amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  const max = Math.max(...sorted.map(s => s.amount), 1);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="panel-title">Categories</h3>
        {selectedMonth && <span className="panel-sub">{formatMonthCompact(selectedMonth)}</span>}
      </div>

      {sorted.length === 0 ? (
        <p className="panel-empty">No expenses for {selectedMonth ? formatMonth(selectedMonth) : 'this period'}</p>
      ) : (
        <div className="cat-list">
          {editingId && (
            <div className="cat-edit-backdrop" onClick={() => setEditingId(null)} />
          )}
          {sorted.map(({ category, amount }) => {
            const pct = (amount / max) * 100;

            if (onUpdateCategory) {
              return (
                <div key={category.id || category.name} className={`cat-row-wrap${editingId === category.id ? ' cat-row-wrap-editing' : ''}`}>
                  <button
                    type="button"
                    className={`cat-row${editingId === category.id ? ' cat-row-active' : ''}`}
                    onClick={() => setEditingId(editingId === category.id ? null : category.id)}
                    aria-label={`Edit ${category.name}`}
                  >
                    <div className="cat-meta">
                      <div className="cat-name">
                        <span className="cat-icon">{category.icon}</span>
                        {category.name}
                      </div>
                      <span className="cat-amount" style={{ color: category.color }}>
                        {formatCurrency(amount)}
                      </span>
                    </div>
                    <div className="cat-track">
                      <div className="cat-fill" style={{ width: `${pct}%`, background: category.color }} />
                    </div>
                  </button>
                  {editingId === category.id && (
                    <div className="cat-edit-popover" onClick={(e) => e.stopPropagation()}>
                      <div className="cat-edit-header">
                        <span className="cat-edit-title">
                          {category.icon} {category.name}
                        </span>
                      </div>
                      <div className="cat-edit-field">
                        <span className="cat-edit-label">Color</span>
                        <ColorPicker value={category.color} onChange={(color) => onUpdateCategory(category.id, { color })} />
                      </div>
                      <div className="cat-edit-field">
                        <span className="cat-edit-label">Icon</span>
                        <IconPicker value={category.icon} onChange={(icon) => onUpdateCategory(category.id, { icon })} />
                      </div>
                      <div className="cat-edit-footer">
                        <button type="button" className="btn" onClick={() => setEditingId(null)}>Done</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={category.id || category.name}>
                <div className="cat-meta">
                  <div className="cat-name">
                    <span className="cat-icon">{category.icon}</span>
                    {category.name}
                  </div>
                  <span className="cat-amount" style={{ color: category.color }}>
                    {formatCurrency(amount)}
                  </span>
                </div>
                <div className="cat-track">
                  <div className="cat-fill" style={{ width: `${pct}%`, background: category.color }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
