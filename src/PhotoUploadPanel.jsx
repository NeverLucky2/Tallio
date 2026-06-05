import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { buildPairUrl } from './pairLink.js';

export default function PhotoUploadPanel({ peer, group, groups = [], onChangeGroup, onCreateGroup, onClose }) {
  const { sessionId, status, errorMessage, batch } = peer;
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const url = sessionId ? buildPairUrl(window.location.origin, sessionId, 'library') : null;
  const receiving = batch.status === 'receiving';
  const done = batch.status === 'done';
  const settled = batch.completed + batch.failed;

  const submitGroup = () => {
    const name = draft.trim();
    if (name && onCreateGroup) onCreateGroup(name);
    setDraft(''); setCreating(false);
  };

  return (
    <div className="pair-overlay" onClick={receiving ? undefined : onClose}>
      <div className="pair-modal" role="dialog" aria-modal="true" aria-labelledby="photo-up-title" onClick={(e) => e.stopPropagation()}>
        <div className="pair-header">
          <h2 id="photo-up-title" className="pair-title">Add photos from phone</h2>
          <button className="pair-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="pair-body">
          <label className="image-icons-appslot">
            <span>Photos will be added to</span>
            <select aria-label="Photos will be added to group" value={group} onChange={(e) => onChangeGroup(e.target.value)}>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          {creating ? (
            <div className="image-icons-newgroup">
              <input className="input" aria-label="New group name" autoFocus placeholder="Group name…" value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitGroup(); if (e.key === 'Escape') { setCreating(false); setDraft(''); } }} />
              <button type="button" className="btn btn-primary" onClick={submitGroup}>Add</button>
              <button type="button" className="btn" onClick={() => { setCreating(false); setDraft(''); }}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => setCreating(true)}>＋ New group</button>
          )}

          {status === 'error' ? (
            <div className="pair-error"><p>{errorMessage || 'Pairing failed.'}</p></div>
          ) : done ? (
            <div className="pair-status-pill pair-status-good">
              Added {batch.completed} photos to {group}{batch.failed > 0 ? ` · ${batch.failed} failed` : ''} ✓
            </div>
          ) : receiving ? (
            <div className="pair-status-pill pair-status-good">
              Receiving {Math.min(settled + 1, batch.count)} of {batch.count}…
            </div>
          ) : url ? (
            <>
              <div className="pair-qr-card">
                <QRCodeSVG value={url} size={232} bgColor="#f0e6d2" fgColor="#0a0a0f" level="M" includeMargin />
              </div>
              <p className="pair-instructions">Scan this with your phone, then choose photos to send.</p>
            </>
          ) : (
            <p className="pair-instructions">Generating pairing code…</p>
          )}
        </div>

        <div className="pair-footer">
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
