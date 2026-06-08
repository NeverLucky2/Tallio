// src/AccountList.jsx
import React, { useMemo } from 'react';
import { groupOrder, groupFor, accountClass, accountBalance, householdTotals, DEFAULT_ACCOUNT_TYPES } from './accountsModel.js';
import Icon from './Icon.jsx';
import useCountUp from './useCountUp.js';
import useValueFlash from './useValueFlash.js';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function AccountList({ accounts, transactions, types = DEFAULT_ACCOUNT_TYPES, selectedId, onSelect, onAddAccount }) {
  const typesById = useMemo(() => new Map(types.map(t => [t.id, t])), [types]);
  const order = useMemo(() => groupOrder(types), [types]);
  const totals = useMemo(() => householdTotals(accounts, transactions, typesById), [accounts, transactions, typesById]);
  const netWorthV = useCountUp(totals.netWorth);
  const netWorthFlash = useValueFlash(totals.netWorth);

  const grouped = useMemo(() => {
    const map = new Map(order.map(g => [g, []]));
    for (const a of accounts) {
      const g = groupFor(a.type, typesById);
      (map.get(g) || map.get('Unassigned')).push(a);
    }
    return map;
  }, [accounts, order, typesById]);

  return (
    <div className="account-list">
      <div className="household-strip">
        <div className="household-stat">
          <span className="household-label">Net worth</span>
          <strong className={`${totals.netWorth >= 0 ? 'pos' : 'neg'}${netWorthFlash ? ' value-flash' : ''}`}>{fmt(netWorthV)}</strong>
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

      {order.map(group => {
        const list = grouped.get(group) || [];
        if (list.length === 0) return null;
        return (
          <div key={group} className="account-group">
            <div className="account-group-label">{group}</div>
            {list.map(a => {
              const bal = accountBalance(a, transactions);
              const klass = accountClass(a.type, typesById);
              const display = klass === 'liability' ? -Math.abs(bal) : bal;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`account-row${a.id === selectedId ? ' account-row-selected' : ''}`}
                  onClick={() => onSelect(a.id)}
                >
                  <span className="account-row-name"><Icon value={a.icon} className="account-row-icon" /> {a.name}</span>
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
