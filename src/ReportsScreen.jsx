import React, { useState, useEffect } from 'react';
import { aggregateYoYByCategory, aggregateMonthByCategory } from './reportingMath.js';

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

const formatMonthShort = (month) => {
  const [y, m] = month.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
};

function MonthTrendTab({ bills, categories, categoriesById }) {
  const firstExpense = (categories || []).find(c => c.flow === 'expense');
  const defaultCatId = firstExpense ? firstExpense.id : (categories && categories[0] && categories[0].id) || null;
  const [categoryId, setCategoryId] = React.useState(defaultCatId);

  const endMonth = currentMonth();
  const series = aggregateMonthByCategory(bills, endMonth, categoryId);
  const max = Math.max(...series.map(b => b.total), 1);
  const avg = series.reduce((s, b) => s + b.total, 0) / 12;

  // Group categories by flow for the picker.
  const groups = { income: [], expense: [], savings: [] };
  for (const c of categories || []) (groups[c.flow] || groups.expense).push(c);

  return (
    <div className="reports-tab-content" data-testid="tab-month">
      <select
        data-testid="month-trend-picker"
        className="month-trend-picker"
        value={categoryId || ''}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        {['income', 'expense', 'savings'].map(flow => (
          groups[flow].length > 0 ? (
            <optgroup key={flow} label={FLOW_LABELS[flow]}>
              {groups[flow].map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ) : null
        ))}
      </select>
      <div className="month-trend-chart">
        {series.map(b => {
          const pct = (b.total / max) * 88;
          return (
            <div key={b.month} className="month-trend-bar" title={`${b.month} — ${formatCurrency(b.total)}`}>
              <div className="month-trend-bar-fill" style={{ height: `${pct}%` }} />
              <span className="month-trend-bar-label">{formatMonthShort(b.month)}</span>
            </div>
          );
        })}
      </div>
      <p className="reports-subtitle">avg {formatCurrency(avg)}/mo · last 12 months</p>
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
        {activeTab === 'month' && <MonthTrendTab bills={bills} categories={categories} categoriesById={categoriesById} />}
        {activeTab === 'recurring' && <div className="reports-tab-content" data-testid="tab-recurring">Recurring breakdown content placeholder</div>}
      </div>
    </div>
  );
}
