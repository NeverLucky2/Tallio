// src/ReportsScreen.jsx
import React, { useMemo, useState } from 'react';
import {
  resolvePeriod, monthsInRange, scopeAccountIds,
  incomeExpenseSummary, spendingByCategory, cashFlowByMonth, netWorthByMonth,
  recurringCharges, findDuplicates, classifyRecurring,
} from './reportsModel.js';
import PeriodControl from './PeriodControl.jsx';
import ScopeControl from './ScopeControl.jsx';
import SummaryScorecard from './SummaryScorecard.jsx';
import CategoryBarList from './CategoryBarList.jsx';
import CashFlowChart from './CashFlowChart.jsx';
import NetWorthChart from './NetWorthChart.jsx';
import RecurringList from './RecurringList.jsx';
import UndoButton from './UndoButton.jsx';

export default function ReportsScreen({
  accounts, transactions, categories, types, typesById, payeesById = null, onClose, now,
  subscriptions = {}, dismissedDuplicates = [],
  onSetStatus = () => {}, onClearStatus = () => {}, onDismissDuplicate = () => {},
  onUndo = () => {}, undoCount = 0,
}) {
  const [period, setPeriod] = useState({ preset: 'last-12-months', customStart: '', customEnd: '' });
  const [scope, setScope] = useState({ kind: 'all' });
  const nowDate = useMemo(() => now || new Date(), [now]);

  const categoriesById = useMemo(() => new Map((categories || []).map(c => [c.id, c])), [categories]);
  const { start, end } = useMemo(
    () => resolvePeriod(period.preset, { now: nowDate, customStart: period.customStart, customEnd: period.customEnd }),
    [period, nowDate]
  );
  const accountIds = useMemo(() => scopeAccountIds(accounts, scope, typesById), [accounts, scope, typesById]);
  const opts = useMemo(() => ({ start, end, accountIds }), [start, end, accountIds]);
  const months = useMemo(() => monthsInRange(start, end, transactions), [start, end, transactions]);

  const summary = useMemo(() => incomeExpenseSummary(transactions, categoriesById, opts), [transactions, categoriesById, opts]);
  const categoryRows = useMemo(() => spendingByCategory(transactions, categoriesById, opts), [transactions, categoriesById, opts]);
  const cashFlow = useMemo(() => cashFlowByMonth(transactions, categoriesById, opts, months), [transactions, categoriesById, opts, months]);
  const netWorth = useMemo(() => netWorthByMonth(accounts, transactions, typesById, opts, months), [accounts, transactions, typesById, opts, months]);
  const recurring = useMemo(() => recurringCharges(transactions, categoriesById, { ...opts, now: nowDate, payeesById }), [transactions, categoriesById, opts, nowDate, payeesById]);
  const classified = useMemo(() => classifyRecurring(recurring, subscriptions), [recurring, subscriptions]);
  const dismissedSet = useMemo(() => new Set(dismissedDuplicates), [dismissedDuplicates]);
  const duplicates = useMemo(() => findDuplicates(transactions, { ...opts, dismissed: dismissedSet, payeesById }), [transactions, opts, dismissedSet, payeesById]);

  return (
    <div className="screen-overlay">
      <div className="screen reports-screen">
        <div className="screen-header">
          <h2 className="screen-title">Reports</h2>
          <UndoButton count={undoCount} onUndo={onUndo} />
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>

        <div className="reports-controls">
          <PeriodControl period={period} onChange={setPeriod} />
          <ScopeControl accounts={accounts} types={types} typesById={typesById} scope={scope} onChange={setScope} />
        </div>

        <section className="panel">
          <div className="panel-header"><h3 className="panel-title">Income vs Expense</h3></div>
          <SummaryScorecard summary={summary} />
        </section>

        <section className="panel">
          <div className="panel-header"><h3 className="panel-title">Spending by category</h3></div>
          <CategoryBarList items={categoryRows} />
        </section>

        <section className="panel">
          <div className="panel-header"><h3 className="panel-title">Net cash flow</h3></div>
          <CashFlowChart data={cashFlow} />
        </section>

        <section className="panel">
          <div className="panel-header"><h3 className="panel-title">Net worth over time</h3></div>
          <NetWorthChart data={netWorth} />
        </section>

        <section className="panel">
          <div className="panel-header"><h3 className="panel-title">Recurring &amp; subscriptions</h3></div>
          <RecurringList
            classified={classified}
            duplicates={duplicates}
            onSetStatus={onSetStatus}
            onClearStatus={onClearStatus}
            onDismissDuplicate={onDismissDuplicate}
          />
        </section>
      </div>
    </div>
  );
}
