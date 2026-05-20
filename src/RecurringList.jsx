// src/RecurringList.jsx
import React from 'react';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n || 0));

export default function RecurringList({ items, duplicates }) {
  const hasItems = items && items.length > 0;
  const hasDups = duplicates && duplicates.length > 0;
  return (
    <div className="recurring">
      {!hasItems ? (
        <p className="panel-empty">No recurring charges detected (need 2+ months of data)</p>
      ) : (
        <ul className="recurring-list">
          {items.map((r, idx) => (
            <li key={`${r.label}-${idx}`} className={`recurring-row ${r.active ? 'is-active' : 'is-stale'}`}>
              <span className="recurring-label">{r.label}</span>
              <span className="recurring-amt">{money(r.avgAmount)}/mo · {r.occurrences}×</span>
              <span className="recurring-flag">
                {r.active
                  ? <><span aria-hidden="true">✓ </span>active</>
                  : <><span aria-hidden="true">⚠ </span>charged after stopping?</>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hasDups && (
        <div className="recurring-dups">
          <h4 className="recurring-dups-title">Possible duplicates</h4>
          <ul className="recurring-list">
            {duplicates.map((d, idx) => (
              <li key={`${d.ids.join('-')}-${idx}`} className="recurring-row is-stale">
                <span className="recurring-label">{d.label}</span>
                <span className="recurring-amt">{money(d.amount)} · {d.date}</span>
                <span className="recurring-flag"><span aria-hidden="true">⚠ </span>{d.ids.length}× same day</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
