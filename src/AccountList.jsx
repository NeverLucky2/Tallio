// src/AccountList.jsx
import React, { useMemo } from 'react';
import { GROUP_ORDER, groupFor, accountClass, accountBalance, householdTotals } from './accountsModel.js';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function AccountList({ accounts, transactions, selectedId, onSelect, onAddAccount }) {
  const totals = useMemo(() => householdTotals(accounts, transactions), [accounts, transactions]);

  const grouped = useMemo(() => {
    const map = new Map(GROUP_ORDER.map(g => [g, []]));
    for (const a of accounts) {
      const g = groupFor(a.type);
      (map.get(g) || map.get('Unassigned')).push(a);
    }
    return map;
  }, [accounts]);

  return (
    <div className="account-list">
      <div className="household-strip">
        <div className="household-stat">
          <span className="household-label">Net worth</span>
          <strong className={totals.netWorth >= 0 ? 'pos' : 'neg'}>{fmt(totals.netWorth)}</strong>
        </div>
        <div className="household-stat">
          <span className="household-label">Cash + investments</span>
          <strong>{fmt(totals.assets)}</strong>
        </div>
        <div className="household-stat">
          <span className="household-label">You owe</span>
          <strong className="neg">{fmt(totals.owed)}</strong>
        </div>
      </div>

      {GROUP_ORDER.map(group => {
        const list = grouped.get(group) || [];
        if (list.length === 0) return null;
        return (
          <div key={group} className="account-group">
            <div className="account-group-label">{group}</div>
            {list.map(a => {
              const bal = accountBalance(a, transactions);
              const klass = accountClass(a.type);
              const display = klass === 'liability' ? -Math.abs(bal) : bal;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`account-row${a.id === selectedId ? ' account-row-selected' : ''}`}
                  onClick={() => onSelect(a.id)}
                >
                  <span className="account-row-name"><span className="account-row-icon" aria-hidden="true">{a.icon}</span> {a.name}</span>
                  <span className={`account-row-balance${display < 0 ? ' neg' : ''}`}>{fmt(display)}</span>
                </button>
              );
            })}
          </div>
        );
      })}

      <button type="button" className="account-add" onClick={onAddAccount} aria-label="Add account">+ Add account</button>
    </div>
  );
}
