// src/ImageIconsTab.jsx
// The Appearance ▸ Image Icons tab: a small "App icons" section (header avatar)
// plus the grouped, searchable image library. Clicking a thumb opens an inline
// crop editor (enlarged) for that image; switching to another thumb with unsaved
// crop changes prompts first. The ⋮ ActionMenu handles Rename / Move / Delete.
// Delete shows a best-effort "Used by N" hint; a deleted-but-in-use icon falls
// back to a glyph in <Icon>.
import React, { useState } from 'react';
import { useIconLibrary } from './iconLibraryContext.js';
import { countIconUsage } from './iconUsage.js';
import { recropThumb } from './imageProcess.js';
import { clampFraming } from './backgroundPhotos.js';
import ActionMenu from './ActionMenu.jsx';
import FramingEditor from './FramingEditor.jsx';
import IconPicker from './IconPicker.jsx';

export default function ImageIconsTab({ appearance, categories = [], accounts = [], accountTypes = [] }) {
  const lib = useIconLibrary();
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [movingId, setMovingId] = useState(null);
  // Inline crop editor state.
  const [editId, setEditId] = useState(null);
  const [editFraming, setEditFraming] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [pendingId, setPendingId] = useState(null); // thumb clicked while dirty

  const q = query.trim().toLowerCase();
  const shown = lib.images.filter(im => !q || (im.name || '').toLowerCase().includes(q));
  const groups = Array.from(new Set(shown.map(im => im.group || 'Uncategorized')));
  const allGroups = Array.from(new Set(lib.images.map(im => im.group || 'Uncategorized')));
  const editImage = editId ? lib.images.find(im => im.id === editId) : null;

  const openEdit = (im) => { setEditId(im.id); setEditFraming(clampFraming(im.iconCrop)); setDirty(false); setPendingId(null); };
  const onThumbClick = (im) => {
    if (im.id === editId) return;                 // already adjusting this one
    if (editId && dirty) { setPendingId(im.id); return; } // guard unsaved changes
    openEdit(im);
  };
  const onFramingChange = (patch) => { setEditFraming(prev => clampFraming({ ...prev, ...patch })); setDirty(true); };
  const saveEdit = async () => {
    try { const thumb = await recropThumb(editImage.blob, editFraming); await lib.updateMeta(editId, { thumb, iconCrop: editFraming }); }
    catch { await lib.updateMeta(editId, { iconCrop: editFraming }); }
    setEditId(null); setDirty(false);
  };
  const cancelEdit = () => { setEditId(null); setDirty(false); setPendingId(null); };
  const discardAndSwitch = () => {
    const next = lib.images.find(im => im.id === pendingId);
    setPendingId(null);
    if (next) openEdit(next);
  };

  const commitRename = (id) => { if (renameDraft.trim()) lib.updateMeta(id, { name: renameDraft.trim() }); setRenamingId(null); };
  const moveTo = (id, group) => { lib.updateMeta(id, { group }); setMovingId(null); };
  const doDelete = (id) => { lib.remove(id); setConfirmDeleteId(null); if (editId === id) cancelEdit(); };

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
      </div>

      {lib.images.length === 0 && <p className="appearance-hint">No images yet — upload one to get started.</p>}

      {groups.map(g => (
        <div key={g} className="image-icons-group">
          <div className="appearance-label">{g}</div>
          <div className="image-icons-grid">
            {shown.filter(im => (im.group || 'Uncategorized') === g).map(im => (
              <div key={im.id} className="image-icon-cell">
                <button
                  type="button"
                  className={`image-icon-thumb-btn${editId === im.id ? ' editing' : ''}`}
                  aria-label={`Adjust ${im.name}`}
                  onClick={() => onThumbClick(im)}
                >
                  <img className="image-icon-thumb" src={lib.urlForId(im.id)} alt="" />
                </button>
                <ActionMenu label={`Actions for ${im.name}`} items={[
                  { label: 'Rename', onSelect: () => { setRenamingId(im.id); setRenameDraft(im.name); } },
                  { label: 'Move to group', onSelect: () => setMovingId(im.id) },
                  { label: 'Delete', danger: true, onSelect: () => setConfirmDeleteId(im.id) },
                ]} />
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
                    {allGroups.filter(x => x !== (im.group || 'Uncategorized')).map(x => (
                      <button key={x} type="button" className="btn" onClick={() => moveTo(im.id, x)}>{x}</button>
                    ))}
                    <button
                      type="button" className="btn"
                      onClick={() => { const name = (window.prompt && window.prompt('New group')) || ''; if (name.trim()) moveTo(im.id, name.trim()); }}
                    >＋ New group</button>
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
            ))}
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
