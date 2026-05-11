import { useState, useMemo } from 'react';
import CategoryEditor from './CategoryEditor.jsx';

function countItemsPerCategory(bills) {
  const counts = new Map();
  for (const b of bills || []) {
    for (const i of (b.items || [])) {
      if (i && i.categoryId) counts.set(i.categoryId, (counts.get(i.categoryId) || 0) + 1);
    }
  }
  return counts;
}

export default function ManageCategoriesScreen({
  categories,
  bills,
  onClose,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onAddKeyword,
  onRemoveKeyword,
  onAddTemplate,
  onRemoveTemplate,
  onMoveAll,
}) {
  const [selectedId, setSelectedId] = useState(categories[0]?.id);

  const itemCounts = useMemo(() => countItemsPerCategory(bills), [bills]);

  const selected = categories.find(c => c.id === selectedId);

  const otherCategories = useMemo(
    () => selected ? categories.filter(c => c.id !== selected.id) : [],
    [categories, selected]
  );

  // Track most-recently-added id so we auto-select after add.
  const [recentlyAddedId, setRecentlyAddedId] = useState(null);
  if (recentlyAddedId && categories.some(c => c.id === recentlyAddedId) && selectedId !== recentlyAddedId) {
    setSelectedId(recentlyAddedId);
    setRecentlyAddedId(null);
  }

  // If selectedId disappeared (deleted), fall back to first.
  if (selectedId && !categories.some(c => c.id === selectedId)) {
    setSelectedId(categories[0]?.id);
  }

  const handleAdd = () => {
    const newId = onAddCategory({ name: 'New Category', icon: '📋', color: '#6B7280' });
    setRecentlyAddedId(newId);
  };

  return (
    <div className="manage-screen">
      <header className="manage-header">
        <button type="button" className="btn" onClick={onClose}>‹ Back</button>
        <h1 className="manage-title">Manage Categories</h1>
        <button type="button" className="btn btn-primary" onClick={handleAdd}>+ Add Category</button>
      </header>

      <div className="manage-body">
        <aside className="manage-list">
          <div className="manage-list-title">{categories.length} categories</div>
          {(['income', 'expense', 'savings']).map(flow => {
            const inFlow = categories.filter(c => (c.flow || 'expense') === flow);
            if (inFlow.length === 0) return null;
            return (
              <div key={flow} className="manage-list-flow-group">
                <div className="manage-list-flow-label">{flow}</div>
                {inFlow.map(cat => {
                  const count = itemCounts.get(cat.id) || 0;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`manage-list-row${cat.id === selectedId ? ' active' : ''}`}
                      onClick={() => setSelectedId(cat.id)}
                    >
                      <span
                        className="manage-list-icon"
                        style={{ background: `${cat.color}22`, border: `1px solid ${cat.color}44` }}
                      >
                        {cat.icon}
                      </span>
                      <span className="manage-list-name">{cat.name}</span>
                      <span className="manage-list-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </aside>

        <main className="manage-editor">
          {selected ? (
            <CategoryEditor
              key={selected.id}
              category={selected}
              itemCount={itemCounts.get(selected.id) || 0}
              otherCategories={otherCategories}
              onMoveAll={(targetId) => onMoveAll(selected.id, targetId)}
              onUpdate={(patch) => onUpdateCategory(selected.id, patch)}
              onAddKeyword={(kw) => onAddKeyword(selected.id, kw)}
              onRemoveKeyword={(kw) => onRemoveKeyword(selected.id, kw)}
              onAddTemplate={(t) => onAddTemplate(selected.id, t)}
              onRemoveTemplate={(t) => onRemoveTemplate(selected.id, t)}
              onDelete={() => onDeleteCategory(selected.id)}
            />
          ) : (
            <p className="manage-empty">No category selected.</p>
          )}
        </main>
      </div>
    </div>
  );
}
