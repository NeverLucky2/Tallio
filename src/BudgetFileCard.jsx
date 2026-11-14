// src/BudgetFileCard.jsx
// Status card for the linked budget file, shown in the avatar drawer. Owns the
// actions that change the link state; it only calls the handlers it is given.
import React from 'react';

function savedTime(at) {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function BudgetFileCard({ status, fileName, lastSavedAt, onLink, onOpen, onUnlink }) {
  const linked = status === 'linked';
  const statusText = linked
    ? (lastSavedAt ? `Autosaving · saved ${savedTime(lastSavedAt)}` : 'Autosaving')
    : 'Stored in this browser only';

  return (
    <div className={`budget-file-card${linked ? ' is-linked' : ''}`}>
      <div className="budget-file-stat">
        <span className="budget-file-dot" aria-hidden="true" />
        <span>{statusText}</span>
      </div>
      {linked && fileName && <div className="budget-file-name" title={fileName}>{fileName}</div>}
      <p className="budget-file-hint">
        {linked ? 'Every change is written to this file.' : 'Link a file and every change autosaves to it.'}
      </p>
      <div className="budget-file-actions">
        {linked ? (
          <>
            <button type="button" className="btn" onClick={onLink}>Change file</button>
            <button type="button" className="btn" onClick={onOpen}>Open another…</button>
            <button type="button" className="btn" onClick={onUnlink}>Unlink</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={onLink}>Link a budget file</button>
            <button type="button" className="btn" onClick={onOpen}>Open existing…</button>
          </>
        )}
      </div>
    </div>
  );
}
