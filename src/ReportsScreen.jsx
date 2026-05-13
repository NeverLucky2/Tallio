import React, { useState, useEffect } from 'react';
import { aggregateYoYByCategory } from './reportingMath.js';

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function uniqueMonthsCount(bills) {
  const set = new Set();
  for (const b of bills || []) if (b && b.month) set.add(b.month);
  return set.size;
}

function uniqueYearsCount(bills) {
  const set = new Set();
  for (const b of bills || []) if (b && b.month) set.add(b.month.slice(0, 4));
  return set.size;
}

const FLOW_LABELS = { income: 'Income', expense: 'Expense', savings: 'Savings' };

const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

function YoyTab({ bills, categoriesById }) {
  const monthsCount = uniqueMonthsCount(bills);
  const yearsCount = uniqueYearsCount(bills);
  if (yearsCount < 2 && monthsCount < 13) {
    return (
      <div className="reports-tab-content" data-testid="tab-yoy">
        <p className="reports-empty">Not enough history yet — come back when you have a full year of data.</p>
      </div>
    );
  }

  const today = currentMonth();
  const todayLabel = new Date(`${today}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const priorWindowStart = `${parseInt(today.slice(0, 4), 10) - 1}-01`;
  const priorWindowEnd   = `${parseInt(today.slice(0, 4), 10) - 1}-${today.slice(5, 7)}`;
  const priorLabel = `${new Date(`${priorWindowStart}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short' })}–${new Date(`${priorWindowEnd}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

  const rows = aggregateYoYByCategory(bills, today, categoriesById);

  // Group rows by flow.
  const byFlow = { income: [], expense: [], savings: [] };
  for (const r of rows) (byFlow[r.flow] || byFlow.expense).push(r);

  return (
    <div className="reports-tab-content" data-testid="tab-yoy">
      <p className="reports-subtitle">YTD through {todayLabel} vs {priorLabel}</p>
      <table className="yoy-table">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Current</th>
            <th className="num">Prior</th>
            <th className="num">Δ%</th>
          </tr>
        </thead>
        <tbody>
          {['income', 'expense', 'savings'].map(flow => (
            byFlow[flow].length > 0 ? (
              <React.Fragment key={flow}>
                <tr className="yoy-flow-header"><td colSpan={4}>{FLOW_LABELS[flow]}</td></tr>
                {byFlow[flow].map(r => (
                  <tr key={r.categoryId}>
                    <td>{r.name}</td>
                    <td className="num">{formatCurrency(r.currentYTD)}</td>
                    <td className="num">{formatCurrency(r.priorYTD)}</td>
                    <td className={`num delta-${r.deltaPct == null ? 'flat' : r.deltaPct > 0 ? 'up' : 'down'}`}>
                      {r.deltaPct == null ? '—' : `${r.deltaPct > 0 ? '+' : ''}${r.deltaPct}%`}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ) : null
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = [
  { id: 'yoy',       label: 'Year-over-year' },
  { id: 'month',     label: 'Month trend' },
  { id: 'recurring', label: 'Recurring breakdown' },
];

export default function ReportsScreen({ bills, categories, categoriesById, selectedMonth, onClose }) {
  const [activeTab, setActiveTab] = useState('yoy');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="reports-screen">
      <div className="reports-header">
        <h1 className="reports-title">Reports</h1>
        <button onClick={onClose} className="btn-icon" aria-label="Close reports">×</button>
      </div>

      <div className="reports-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`reports-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="reports-body">
        {activeTab === 'yoy' && <YoyTab bills={bills} categoriesById={categoriesById} />}
        {activeTab === 'month' && <div className="reports-tab-content" data-testid="tab-month">Month trend content placeholder</div>}
        {activeTab === 'recurring' && <div className="reports-tab-content" data-testid="tab-recurring">Recurring breakdown content placeholder</div>}
      </div>
    </div>
  );
}
