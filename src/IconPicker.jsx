// src/IconPicker.jsx
// Icon picker with two tabs: the built-in emoji grid ("Emoji") and the user's
// image library ("Your images") with search + upload→square-crop. Selecting an
// image sets the field to img:<id>. Default tab is context-aware.
import React, { useState } from 'react';
import { CURATED_ICONS } from './curatedIcons.js';
import { useIconLibrary } from './iconLibraryContext.js';
import { parseIconValue } from './iconValue.js';
import { recropThumb } from './imageProcess.js';
import ImageCropModal from './ImageCropModal.jsx';
import Icon from './Icon.jsx';

export default function IconPicker({ value, onChange }) {
  const lib = useIconLibrary();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(() => (parseIconValue(value).kind === 'image' ? 'images' : 'emoji'));
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [cropBlob, setCropBlob] = useState(null);
  const [cropId, setCropId] = useState(null);

  const submitEmoji = () => {
    const v = draft.trim();
    if (v) { onChange(v); setDraft(''); setOpen(false); }
  };

  const q = query.trim().toLowerCase();
  const gallery = lib.images.filter(im => !q || (im.name || '').toLowerCase().includes(q));
  const groups = Array.from(new Set(gallery.map(im => im.group || 'Uncategorized')));

  const onPickFile = async (file) => {
    if (!file) return;
    const saved = await lib.addFromFile(file, {}); // full blob + center thumb + palette
    setCropId(saved.id);
    setCropBlob(saved.blob);
  };
  const onCropDone = async (framing) => {
    try {
      const thumb = await recropThumb(cropBlob, framing);
      await lib.updateMeta(cropId, { thumb, iconCrop: framing });
    } catch {
      await lib.updateMeta(cropId, { iconCrop: framing }); // canvas unavailable (tests)
    }
    onChange(`img:${cropId}`);
    setCropBlob(null); setCropId(null); setOpen(false);
  };

  return (
    <div className="picker">
      <button type="button" className="picker-trigger" aria-label="Icon picker" onClick={() => setOpen(o => !o)}>
        <Icon value={value} /> ▾
      </button>
      {open && (
        <div className="picker-popover">
          <div className="picker-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'emoji'} className={`picker-tab${tab === 'emoji' ? ' on' : ''}`} onClick={() => setTab('emoji')}>Emoji</button>
            <button type="button" role="tab" aria-selected={tab === 'images'} className={`picker-tab${tab === 'images' ? ' on' : ''}`} onClick={() => setTab('images')}>Your images</button>
          </div>

          {tab === 'emoji' ? (
            <>
              <div className="picker-grid">
                {CURATED_ICONS.map(icon => (
                  <button key={icon} type="button" className="picker-cell" onClick={() => { onChange(icon); setOpen(false); }}>{icon}</button>
                ))}
              </div>
              <input
                type="text" className="picker-input" placeholder="Or paste any emoji" value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitEmoji(); } }}
              />
            </>
          ) : (
            <div className="picker-images">
              <div className="picker-images-bar">
                <input type="text" className="picker-input" aria-label="Search images" placeholder="🔍 Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
                <label className="btn picker-upload">↑ Upload
                  <input
                    type="file" accept="image/*" aria-label="Upload image" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; onPickFile(f); }}
                  />
                </label>
              </div>
              {gallery.length === 0 ? (
                <p className="appearance-hint">No images yet — upload one.</p>
              ) : groups.map(g => (
                <div key={g} className="picker-image-group">
                  <div className="appearance-label">{g}</div>
                  <div className="picker-image-row">
                    {gallery.filter(im => (im.group || 'Uncategorized') === g).map(im => (
                      <button
                        key={im.id} type="button" className="picker-image-cell" aria-label={`Select ${im.name}`}
                        onClick={() => { onChange(`img:${im.id}`); setOpen(false); }}
                      >
                        <img className="image-icon-thumb" src={lib.urlForId(im.id)} alt="" />
                        <span className="picker-image-name">{im.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {cropBlob && (
        <ImageCropModal blob={cropBlob} onDone={onCropDone} onCancel={() => { setCropBlob(null); setCropId(null); }} />
      )}
    </div>
  );
}
