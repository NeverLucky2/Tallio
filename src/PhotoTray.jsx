import React from 'react';

const STATE_MARK = { pending: '', sending: '', done: '✓', failed: '✗' };

export default function PhotoTray({ photos = [], connected = false, sending = false, onPick, onSend, onRetry, onClear, onRemove }) {
  const failedCount = photos.filter(p => p.state === 'failed').length;
  const hasPhotos = photos.length > 0;

  const handlePick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length && onPick) onPick(files);
  };

  return (
    <div className="phone-tray">
      <div className="phone-tray-topbar">
        <span className="phone-camera-title">Add to your library</span>
        <span className="phone-camera-status">{connected ? '● connected' : '○ offline'}</span>
      </div>

      {hasPhotos && (
        <div className="phone-tray-grid">
          {photos.map(p => (
            <div key={p.id} className={`phone-tray-cell phone-tray-${p.state}`}>
              <img className="phone-tray-thumb" src={p.previewUrl} alt={p.name} />
              {p.state === 'sending' && (
                <div className="phone-tray-bar"><span style={{ width: `${Math.round((p.progress || 0) * 100)}%` }} /></div>
              )}
              {STATE_MARK[p.state] && <span className="phone-tray-mark" aria-hidden="true">{STATE_MARK[p.state]}</span>}
              {onRemove && p.state !== 'sending' && (
                <button type="button" className="phone-tray-remove" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p.id)}>×</button>
              )}
              <span className="phone-tray-name">{p.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="phone-tray-actions">
        <label className="phone-btn">
          {hasPhotos ? 'Add more' : 'Choose photos'}
          <input type="file" accept="image/*" multiple aria-label="Choose photos" style={{ display: 'none' }} onChange={handlePick} />
        </label>
        {hasPhotos && <button type="button" className="phone-btn" onClick={onClear}>Clear</button>}
        {failedCount > 0 && (
          <button type="button" className="phone-btn phone-btn-primary" onClick={onRetry}>Retry failed ({failedCount})</button>
        )}
        <button
          type="button"
          className="phone-btn phone-btn-primary"
          disabled={!hasPhotos || !connected || sending}
          onClick={onSend}
        >
          Send {photos.length} photos
        </button>
      </div>
    </div>
  );
}
