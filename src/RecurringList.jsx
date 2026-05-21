// src/RecurringList.jsx
import React, { useState } from 'react';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n || 0));
const MONTH_RE = /^\d{4}-\d{2}$/;
function monthLabel(m) {
  if (!m || !MONTH_RE.test(m)) return '';
  const [y, mo] = m.split('-').map(n => parseInt(n, 10));
  return new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function RecurringList({
  classified,
  duplicates,
  onSetStatus = () => {},
  onClearStatus = () => {},
  onDismissDuplicate = () => {},
}) {
  const { alerts = [], ongoing = [], cancelled = [], review = [] } = classified || {};
  const dups = duplicates || [];
  const [cancelling, setCancelling] = useState(null); // { key, label, month }

  const isEmpty = alerts.length === 0 && ongoing.length === 0 && cancelled.length === 0 && review.length === 0 && dups.length === 0;
  if (isEmpty) return <p className="panel-empty">No recurring charges detected (need 2+ months of data)</p>;

  const startCancel = (r) => setCancelling({ key: r.key, label: r.label, month: (r.lastDate || '').slice(0, 7) });
  const confirmCancel = () => {
    if (cancelling && cancelling.month) onSetStatus(cancelling.key, 'cancelled', cancelling.month);
    setCancelling(null);
  };

  return (
    <div className="recurring">
      {(alerts.length > 0 || dups.length > 0) && (
        <div className="recurring-group">
          <h4 className="recurring-group-title is-alert"><span aria-hidden="true">⚠ </span>Alerts</h4>
          <ul className="recurring-list">
            {alerts.map((r) => (
              <li key={`al-${r.key}`} className="recurring-row is-alert">
                <span className="recurring-label">{r.label}</span>
                <span className="recurring-amt">{money(r.avgAmount)}/mo</span>
                <span className="recurring-flag">charged after cancellation (cancelled {monthLabel(r.cancelledAsOf)})</span>
              </li>
            ))}
            {dups.map((d) => (
              <li key={`dup-${d.signature}`} className="recurring-row is-alert">
                <span className="recurring-label">{d.label}</span>
                <span className="recurring-amt">{money(d.amount)} · {d.date} · {d.ids.length}× same day</span>
                <div className="recurring-actions">
                  <button type="button" className="recurring-btn" onClick={() => onDismissDuplicate(d.signature)}>Not a duplicate</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ongoing.length > 0 && (
        <div className="recurring-group">
          <h4 className="recurring-group-title is-ongoing"><span aria-hidden="true">✓ </span>Ongoing subscriptions</h4>
          <ul className="recurring-list">
            {ongoing.map((r) => (
              <li key={`on-${r.key}`} className="recurring-row is-active">
                <span className="recurring-label">{r.label}</span>
                <span className="recurring-amt">{money(r.avgAmount)}/mo · {r.occurrences}×</span>
                <div className="recurring-actions">
                  <button type="button" className="recurring-btn" onClick={() => onClearStatus(r.key)}>Change</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cancelled.length > 0 && (
        <div className="recurring-group">
          <h4 className="recurring-group-title">Cancelled</h4>
          <ul className="recurring-list">
            {cancelled.map((r) => (
              <li key={`ca-${r.key}`} className="recurring-row">
                <span className="recurring-label">{r.label}</span>
                <span className="recurring-amt">cancelled {monthLabel(r.cancelledAsOf)} — no further charges</span>
                <div className="recurring-actions">
                  <button type="button" className="recurring-btn" onClick={() => onClearStatus(r.key)}>Change</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.length > 0 && (
        <div className="recurring-group">
          <h4 className="recurring-group-title">Needs review</h4>
          <ul className="recurring-list">
            {review.map((r) => (
              <li key={`rv-${r.key}`} className="recurring-row">
                <span className="recurring-label">{r.label}</span>
                <span className="recurring-amt">{money(r.avgAmount)}/mo · {r.occurrences}× · last seen {monthLabel((r.lastDate || '').slice(0, 7))}</span>
                {cancelling && cancelling.key === r.key ? (
                  <div className="recurring-cancel-edit">
                    <input type="month" className="input" aria-label={`Cancel ${r.label} as of`}
                      value={cancelling.month} onChange={(e) => setCancelling({ ...cancelling, month: e.target.value })} />
                    <button type="button" className="recurring-btn" onClick={confirmCancel}>Confirm</button>
                  </div>
                ) : (
                  <div className="recurring-actions">
                    <button type="button" className="recurring-btn" onClick={() => onSetStatus(r.key, 'ongoing')}><span aria-hidden="true">✓ </span>Mark ongoing</button>
                    <button type="button" className="recurring-btn" onClick={() => startCancel(r)}>Mark cancelled…</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
