import { useState } from 'react';

function shiftMonth(monthString, delta) {
  const [y, m] = monthString.split('-').map(n => parseInt(n, 10));
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function DuplicateBillDialog({ sourceBill, onConfirm, onCancel }) {
  const [draft, setDraft] = useState(() => shiftMonth(sourceBill.month, 1));
  const valid = MONTH_RE.test(draft);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog dialog-duplicate">
        <h3 className="dialog-title">Duplicate to which month?</h3>
        <div className="dialog-body">
          <p>Make a copy of <strong>{sourceBill.vendor || 'this bill'}</strong> in the chosen month.</p>
          <label className="dialog-label">
            Target month
            <input
              type="month"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="input"
              autoFocus
            />
          </label>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => onConfirm(draft)}
          >
            Duplicate
          </button>
        </div>
      </div>
    </div>
  );
}
