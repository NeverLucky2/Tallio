// src/AccountList.jsx
import React, { useMemo } from 'react';
import { groupOrder, groupFor, accountClass, accountBalance, householdTotals, monthToDateDelta, netWorthSeries, DEFAULT_ACCOUNT_TYPES } from './accountsModel.js';
import Icon from './Icon.jsx';
import NetWorthSpark from './NetWorthSpark.jsx';
import useCountUp from './useCountUp.js';
import useValueFlash from './useValueFlash.js';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function AccountList({ accounts, transactions, types = DEFAULT_ACCOUNT_TYPES, selectedId, onSelect, onAddAccount, now = new Date() }) {
  const typesById = useMemo(() => new Map(types.map(t => [t.id, t])), [types]);
  const order = useMemo(() => groupOrder(types), [types]);
  const totals = useMemo(() => householdTotals(accounts, transactions, typesById), [accounts, transactions, typesById]);
  const delta = useMemo(() => monthToDateDelta(accounts, transactions, typesById, now), [accounts, transactions, typesById, now]);
  const series = useMemo(() => netWorthSeries(accounts, transactions, typesById, 6, now), [accounts, transactions, typesById, now]);
  const hasHistory = useMemo(() => series.some(v => v !== 0), [series]);
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

  // "$487,312.44" → ["$487,312", "44"] so Bullion can shrink the cents.
  const [nwDollars, nwCents] = fmt(netWorthV).split('.');
  const deltaClass = delta > 0 ? ' pos' : delta < 0 ? ' neg' : ' zero';
  const deltaText = `${delta > 0 ? '▲ +' : delta < 0 ? '▼ −' : ''}${fmt(Math.abs(delta))} this month`;

  return (
    <div className="account-list">
      <div className="networth">
        <div className="networth-label">Net worth</div>
        <div className={`networth-figure${totals.netWorth >= 0 ? '' : ' neg'}${netWorthFlash ? ' value-flash' : ''}`}>
          {nwDollars}<span className="networth-cents">.{nwCents}</span>
        </div>
        <div className="networth-rule" aria-hidden="true" />
        <div className={`networth-delta${deltaClass}`}>{deltaText}</div>
        <div className="networth-pair">
          <span>Cash &amp; investments</span><span className="networth-lead" aria-hidden="true" /><b>{fmt(totals.assets)}</b>
        </div>
        <div className="networth-pair">
          <span>You owe</span><span className="networth-lead" aria-hidden="true" /><b className="neg">{fmt(totals.owed)}</b>
        </div>
        {hasHistory && (
          <div className="networth-spark"><NetWorthSpark series={series} /></div>
        )}
      </div>

      {order.map(group => {
        const list = grouped.get(group) || [];
        if (list.length === 0) return null;
        return (
          <div key={group} className="account-group">
            <div className="account-group-label"><span>{group}</span><b>{list.length}</b></div>
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
                  <span className="icon-well account-row-well"><Icon value={a.icon} className="account-row-icon" /></span>
                  <span className="account-row-name">{a.name}</span>
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
