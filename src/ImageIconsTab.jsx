// src/ImageIconsTab.jsx
// The Appearance ▸ Image Icons tab: a small "App icons" section (header avatar)
// plus the grouped, searchable image library managed via the shared ActionMenu
// (Adjust crop / Rename / Move to group / Delete). Delete shows a best-effort
// "Used by N" hint; a deleted-but-in-use icon falls back to a glyph in <Icon>.
import React, { useState } from 'react';
import { useIconLibrary } from './iconLibraryContext.js';
import { countIconUsage } from './iconUsage.js';
import { recropThumb } from './imageProcess.js';
import ActionMenu from './ActionMenu.jsx';
import ImageCropModal from './ImageCropModal.jsx';
import IconPicker from './IconPicker.jsx';

export default function ImageIconsTab({ appearance, categories = [], accounts = [], accountTypes = [] }) {
  const lib = useIconLibrary();
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [cropId, setCropId] = useState(null);
  const [movingId, setMovingId] = useState(null);

  const q = query.trim().toLowerCase();
  const shown = lib.images.filter(im => !q || (im.name || '').toLowerCase().includes(q));
  const groups = Array.from(new Set(shown.map(im => im.group || 'Uncategorized')));
  const allGroups = Array.from(new Set(lib.images.map(im => im.group || 'Uncategorized')));
  const cropImage = cropId ? lib.images.find(im => im.id === cropId) : null;

  const commitRename = (id) => { if (renameDraft.trim()) lib.updateMeta(id, { name: renameDraft.trim() }); setRenamingId(null); };
  const moveTo = (id, group) => { lib.updateMeta(id, { group }); setMovingId(null); };
  const onCropDone = async (framing) => {
    try { const thumb = await recropThumb(cropImage.blob, framing); await lib.updateMeta(cropId, { thumb, iconCrop: framing }); }
    catch { await lib.updateMeta(cropId, { iconCrop: framing }); }
    setCropId(null);
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
            onChange={async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { const saved = await lib.addFromFile(f, {}); setCropId(saved.id); } }}
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
                <img className="image-icon-thumb" src={lib.urlForId(im.id)} alt="" />
                <ActionMenu label={`Actions for ${im.name}`} items={[
                  { label: 'Adjust crop', onSelect: () => setCropId(im.id) },
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
                    <button type="button" className="btn btn-danger image-icon-confirm-delete" onClick={() => { lib.remove(im.id); setConfirmDeleteId(null); }}>Delete</button>
                    <button type="button" className="btn" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {cropImage && (
        <ImageCropModal blob={cropImage.blob} initialFraming={cropImage.iconCrop} onDone={onCropDone} onCancel={() => setCropId(null)} />
      )}
    </div>
  );
}
