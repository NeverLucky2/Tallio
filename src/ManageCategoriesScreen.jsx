import { useState, useMemo } from 'react';
import Icon from './Icon.jsx';
import CategoryEditor from './CategoryEditor.jsx';
import SubcategoryEditor from './SubcategoryEditor.jsx';
import UndoButton from './UndoButton.jsx';
import { groupCategoriesByFlow } from './categoriesView.js';
import { filterCategoriesByQuery } from './categoriesSearch.js';

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
  onUndo,
  undoCount = 0,
  onAddSub,
  onUpdateSub,
  onDeleteSub,
  onAddSubKeyword,
  onRemoveSubKeyword,
  onPromoteKeyword,
}) {
  const [selectedId, setSelectedId] = useState(categories[0]?.id);
  const [query, setQuery] = useState('');
  const [editingSubId, setEditingSubId] = useState(null);
  const [creatingSub, setCreatingSub] = useState(false);

  const itemCounts = useMemo(() => countItemsPerCategory(bills), [bills]);

  const selected = categories.find(c => c.id === selectedId);

  const visibleCategories = useMemo(() => filterCategoriesByQuery(categories, query), [categories, query]);
  const editingSub = selected && editingSubId
    ? (selected.subcategories || []).find(s => s.id === editingSubId)
    : null;

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

  const handleAddSub = () => {
    setEditingSubId(null);
    setCreatingSub(true);
  };

  const handleCreateSub = (name) => {
    const id = onAddSub(selected.id, { name });
    setCreatingSub(false);
    setEditingSubId(id);
  };

  const selectCategory = (id) => {
    setSelectedId(id);
    setEditingSubId(null);
    setCreatingSub(false);
  };

  return (
    <div className="manage-screen">
      <header className="manage-header">
        <button type="button" className="btn" onClick={onClose}>‹ Back</button>
        <h1 className="manage-title">Manage Categories</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <UndoButton count={undoCount} onUndo={onUndo} />
          <button type="button" className="btn btn-primary" onClick={handleAdd}>+ Add Category</button>
        </div>
      </header>

      <div className="manage-body">
        <aside className="manage-list">
          <input
            type="search"
            className="cat-editor-input"
            placeholder="Search categories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', marginBottom: 8 }}
          />
          <div className="manage-list-title">{visibleCategories.length} categories</div>
          {groupCategoriesByFlow(visibleCategories).map(group => (
              <div key={group.flow} className="manage-list-flow-group">
                <div className="manage-list-flow-label">{group.flow}</div>
                {group.items.map(cat => {
                  const subCount = (cat.subcategories || []).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`manage-list-row${cat.id === selectedId ? ' active' : ''}`}
                      onClick={() => selectCategory(cat.id)}
                    >
                      <span
                        className="manage-list-icon"
                        style={{ background: `${cat.color}22`, border: `1px solid ${cat.color}44` }}
                      >
                        <Icon value={cat.icon} />
                      </span>
                      <span className="manage-list-name">{cat.name}</span>
                      {subCount > 0 && (
                        <span className="manage-list-subcount" title={`${subCount} sub-categories`} style={{ opacity: 0.7, fontSize: '0.8em' }}>⊞{subCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
          ))}
        </aside>

        <main className="manage-editor">
          {selected ? (
            creatingSub ? (
              <SubcategoryEditor
                creating
                category={selected}
                onCreate={handleCreateSub}
                onCancel={() => setCreatingSub(false)}
              />
            ) : editingSub ? (
              <SubcategoryEditor
                key={editingSub.id}
                category={selected}
                sub={editingSub}
                onBack={() => setEditingSubId(null)}
                onUpdate={(patch) => onUpdateSub(selected.id, editingSub.id, patch)}
                onAddKeyword={(kw) => onAddSubKeyword(selected.id, editingSub.id, kw)}
                onRemoveKeyword={(kw) => onRemoveSubKeyword(selected.id, editingSub.id, kw)}
                onDelete={() => { onDeleteSub(selected.id, editingSub.id); setEditingSubId(null); }}
              />
            ) : (
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
                onAddSub={handleAddSub}
                onEditSub={(subId) => setEditingSubId(subId)}
                onPromoteKeyword={(kw) => onPromoteKeyword(selected.id, kw)}
              />
            )
          ) : (
            <p className="manage-empty">No category selected.</p>
          )}
        </main>
      </div>
    </div>
  );
}
