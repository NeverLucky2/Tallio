// src/ProfitLossScreen.jsx
import React, { useMemo, useState } from 'react';
import { resolvePeriod, scopeAccountIds } from './reportsModel.js';
import { profitAndLoss, buildPnlCsv } from './pnlModel.js';
import { downloadTextFile } from './fileStore.js';
import PeriodControl from './PeriodControl.jsx';
import ScopeControl from './ScopeControl.jsx';
import PnlStatement from './PnlStatement.jsx';

const GRANULARITIES = [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']];

export default function ProfitLossScreen({ accounts, transactions, categories, types, typesById, onClose, now }) {
  const [period, setPeriod] = useState({ preset: 'last-12-months', customStart: '', customEnd: '' });
  const [scope, setScope] = useState({ kind: 'all' });
  const [granularity, setGranularity] = useState('month');
  const nowDate = useMemo(() => now || new Date(), [now]);

  const categoriesById = useMemo(() => new Map((categories || []).map(c => [c.id, c])), [categories]);
  const { start, end } = useMemo(
    () => resolvePeriod(period.preset, { now: nowDate, customStart: period.customStart, customEnd: period.customEnd }),
    [period, nowDate]
  );
  const accountIds = useMemo(() => scopeAccountIds(accounts, scope, typesById), [accounts, scope, typesById]);
  const opts = useMemo(() => ({ start, end, accountIds, granularity }), [start, end, accountIds, granularity]);
  const pnl = useMemo(() => profitAndLoss(transactions, categoriesById, opts), [transactions, categoriesById, opts]);

  const exportCsv = () => {
    const stamp = nowDate.toISOString().split('T')[0];
    downloadTextFile(buildPnlCsv(pnl), `Tallio-P&L-${stamp}.csv`, 'text/csv');
  };

  return (
    <div className="screen-overlay">
      <div className="screen pnl-screen">
        <div className="screen-header">
          <h2 className="screen-title">Profit &amp; Loss</h2>
          <button type="button" className="btn" onClick={exportCsv}>Export CSV</button>
          <button type="button" className="btn" onClick={() => window.print()}>Print</button>
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>

        <div className="reports-controls">
          <PeriodControl period={period} onChange={setPeriod} />
          <ScopeControl accounts={accounts} types={types} typesById={typesById} scope={scope} onChange={setScope} />
          <div className="period-chips granularity-control" role="group" aria-label="Column granularity">
            {GRANULARITIES.map(([value, label]) => (
              <button key={value} type="button"
                className={`period-chip${granularity === value ? ' period-chip-active' : ''}`}
                aria-pressed={granularity === value}
                onClick={() => setGranularity(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <section className="panel pnl-panel">
          <PnlStatement pnl={pnl} />
        </section>
      </div>
    </div>
  );
}
