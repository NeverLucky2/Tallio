// src/ImageIconsTab.jsx
// The Appearance ▸ Image Icons tab: a small "App icons" section (header avatar)
// plus the grouped, searchable image library.
//   • Click a thumb → inline crop editor (enlarged) for that image; switching
//     with unsaved crop changes prompts first.
//   • Groups are first-class: create empty ones, delete them (icons → Uncategorized).
//   • "Select" mode → batch-move several icons to a group.
//   • ⋮ ActionMenu handles per-image Rename / Move / Delete.
// Group create/delete and batch moves each fold into a single undo step.
import React, { useState } from 'react';
import { useIconLibrary } from './iconLibraryContext.js';
import { countIconUsage } from './iconUsage.js';
import { recropThumb } from './imageProcess.js';
import { clampFraming } from './backgroundPhotos.js';
import { listImageGroups, moveTargetGroups } from './imageGroups.js';
import ActionMenu from './ActionMenu.jsx';
import FramingEditor from './FramingEditor.jsx';
import IconPicker from './IconPicker.jsx';

const UNCATEGORIZED = 'Uncategorized';
const groupOf = (im) => (im && im.group) || UNCATEGORIZED;

export default function ImageIconsTab({ appearance, categories = [], accounts = [], accountTypes = [], onBatch }) {
  const lib = useIconLibrary();
  const runBatch = onBatch || (async (fn) => fn());
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupDraft, setGroupDraft] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  // Inline crop editor state.
  const [editId, setEditId] = useState(null);
  const [editFraming, setEditFraming] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [pendingId, setPendingId] = useState(null);

  const q = query.trim().toLowerCase();
  const matches = (im) => !q || (im.name || '').toLowerCase().includes(q);
  const customGroups = appearance.imageGroups || [];
  const allGroups = listImageGroups(lib.images, customGroups);
  const groups = q ? allGroups.filter(g => lib.images.some(im => groupOf(im) === g && matches(im))) : allGroups;
  const editImage = editId ? lib.images.find(im => im.id === editId) : null;

  // Crop editor ------------------------------------------------------------
  const openEdit = (im) => { setEditId(im.id); setEditFraming(clampFraming(im.iconCrop)); setDirty(false); setPendingId(null); };
  const onThumbClick = (im) => {
    if (im.id === editId) return;
    if (editId && dirty) { setPendingId(im.id); return; }
    openEdit(im);
  };
  const onFramingChange = (patch) => { setEditFraming(prev => clampFraming({ ...prev, ...patch })); setDirty(true); };
  const saveEdit = async () => {
    try { const thumb = await recropThumb(editImage.blob, editFraming); await lib.updateMeta(editId, { thumb, iconCrop: editFraming }); }
    catch { await lib.updateMeta(editId, { iconCrop: editFraming }); }
    setEditId(null); setDirty(false);
  };
  const cancelEdit = () => { setEditId(null); setDirty(false); setPendingId(null); };
  const discardAndSwitch = () => { const next = lib.images.find(im => im.id === pendingId); setPendingId(null); if (next) openEdit(next); };

  // Per-image actions ------------------------------------------------------
  const commitRename = (id) => { if (renameDraft.trim()) lib.updateMeta(id, { name: renameDraft.trim() }); setRenamingId(null); };
  const moveTo = (id, group) => { lib.updateMeta(id, { group }); setMovingId(null); };
  const doDelete = (id) => { lib.remove(id); setConfirmDeleteId(null); if (editId === id) cancelEdit(); };

  // Groups -----------------------------------------------------------------
  const submitCreateGroup = () => { const name = groupDraft.trim(); if (name) appearance.addImageGroup(name); setGroupDraft(''); setCreatingGroup(false); };
  const deleteGroup = (name) => {
    const ids = lib.images.filter(im => groupOf(im) === name).map(im => im.id);
    runBatch(async () => {
      appearance.removeImageGroup(name);
      await Promise.all(ids.map(id => lib.updateMeta(id, { group: UNCATEGORIZED })));
    });
  };

  // Select mode / batch move ----------------------------------------------
  const toggleSelectMode = () => { setSelectMode(s => !s); setSelectedIds([]); cancelEdit(); };
  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const batchMove = (target) => {
    if (!target || selectedIds.length === 0) return;
    const ids = [...selectedIds];
    runBatch(async () => { await Promise.all(ids.map(id => lib.updateMeta(id, { group: target }))); });
    setSelectedIds([]); setSelectMode(false);
  };

  return (
    <div className="image-icons-tab">
      <div className="appearance-label">App icons</div>
      <label className="image-icons-appslot">
        <span>Header avatar</span>
        <IconPicker value={appearance.appIcons.headerAvatar || ''} onChange={(v) => appearance.setAppIcon('headerAvatar', v)} />
      </label>

      <div className="image-icons-toolbar">
        <input type="text" className="input" aria-label="Search images" placeholder="🔍 Search images…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="btn">↑ Upload
          <input
            type="file" accept="image/*" aria-label="Upload image" style={{ display: 'none' }}
            onChange={async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { const saved = await lib.addFromFile(f, {}); openEdit(saved); } }}
          />
        </label>
        <button type="button" className="btn" onClick={() => setCreatingGroup(c => !c)}>＋ New group</button>
        <button type="button" className={`btn${selectMode ? ' btn-primary' : ''}`} onClick={toggleSelectMode}>{selectMode ? 'Done' : 'Select'}</button>
      </div>

      {creatingGroup && (
        <div className="image-icons-newgroup">
          <input
            className="input" aria-label="New group name" autoFocus placeholder="Group name…" value={groupDraft}
            onChange={(e) => setGroupDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitCreateGroup(); if (e.key === 'Escape') { setCreatingGroup(false); setGroupDraft(''); } }}
          />
          <button type="button" className="btn btn-primary" onClick={submitCreateGroup}>Add</button>
          <button type="button" className="btn" onClick={() => { setCreatingGroup(false); setGroupDraft(''); }}>Cancel</button>
        </div>
      )}

      {selectMode && (
        <div className="image-icons-selectbar">
          <span>{selectedIds.length} selected</span>
          <label>Move to
            <select aria-label="Move selected to group" value="" onChange={(e) => batchMove(e.target.value)}>
              <option value="">Choose group…</option>
              {moveTargetGroups(lib.images, customGroups, null).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => setSelectedIds([])}>Clear</button>
        </div>
      )}

      {lib.images.length === 0 && <p className="appearance-hint">No images yet — upload one to get started.</p>}

      {groups.map(g => (
        <div key={g} className="image-icons-group">
          <div className="image-icons-group-head">
            <span className="appearance-label">{g}</span>
            {g !== UNCATEGORIZED && (
              <button type="button" className="image-icons-group-del" aria-label={`Delete group ${g}`} onClick={() => deleteGroup(g)}>Delete group</button>
            )}
          </div>
          <div className="image-icons-grid">
            {lib.images.filter(im => groupOf(im) === g && matches(im)).map(im => {
              const selected = selectedIds.includes(im.id);
              return (
                <div key={im.id} className="image-icon-cell">
                  <button
                    type="button"
                    className={`image-icon-thumb-btn${editId === im.id ? ' editing' : ''}${selectMode && selected ? ' selected' : ''}`}
                    aria-label={selectMode ? `Select ${im.name}` : `Adjust ${im.name}`}
                    aria-pressed={selectMode ? selected : undefined}
                    onClick={() => (selectMode ? toggleSelect(im.id) : onThumbClick(im))}
                  >
                    <img className="image-icon-thumb" src={lib.urlForId(im.id)} alt="" />
                    {selectMode && selected && <span className="image-icon-check" aria-hidden="true">✓</span>}
                  </button>
                  {!selectMode && (
                    <ActionMenu label={`Actions for ${im.name}`} items={[
                      { label: 'Rename', onSelect: () => { setRenamingId(im.id); setRenameDraft(im.name); } },
                      { label: 'Move to group', onSelect: () => setMovingId(im.id) },
                      { label: 'Delete', danger: true, onSelect: () => setConfirmDeleteId(im.id) },
                    ]} />
                  )}
                  {renamingId === im.id ? (
                    <input
                      className="image-icon-rename" aria-label={`Name for ${im.name}`} autoFocus value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)} onBlur={() => commitRename(im.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(im.id); }}
                    />
                  ) : (
                    <span className="image-icon-name">{im.name}</span>
                  )}
                  {movingId === im.id && (
                    <div className="image-icon-move">
                      {moveTargetGroups(lib.images, customGroups, groupOf(im)).map(x => (
                        <button key={x} type="button" className="btn" onClick={() => moveTo(im.id, x)}>{x}</button>
                      ))}
                    </div>
                  )}
                  {confirmDeleteId === im.id && (
                    <div className="image-icon-confirm">
                      <span className="image-icon-usage">Used by {countIconUsage(im.id, { categories, accounts, accountTypes, appIcons: appearance.appIcons })}. Delete?</span>
                      <button type="button" className="btn btn-danger image-icon-confirm-delete" onClick={() => doDelete(im.id)}>Delete</button>
                      <button type="button" className="btn" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {editImage && (
        <div className="image-icon-editor">
          <div className="appearance-label">Adjusting “{editImage.name}”</div>
          <FramingEditor blob={editImage.blob} framing={editFraming} onChange={onFramingChange} aspect="square" />
          <div className="modal-actions">
            <button type="button" className="btn" onClick={cancelEdit}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={saveEdit}>Done</button>
          </div>
        </div>
      )}

      {pendingId && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Unsaved changes" onKeyDown={(e) => { if (e.key === 'Escape') setPendingId(null); }}>
          <div className="modal">
            <h3 className="modal-title">Changes not saved</h3>
            <p>Switch images and lose your crop changes?</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setPendingId(null)}>Go back</button>
              <button type="button" className="btn btn-danger" onClick={discardAndSwitch}>Discard changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
