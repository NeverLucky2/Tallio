// src/pnlModel.js
// Pure Profit & Loss aggregation + CSV. No React, no storage.
// Reuses reportsModel's period/scope/flow plumbing so it counts money identically.
import { filterRows, flattenForReports, monthsInRange, flowOf } from './reportsModel.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Map a 'YYYY-MM' month to its bucket key for the chosen granularity.
export function bucketKeyForMonth(month, granularity = 'month') {
  if (typeof month !== 'string' || month.length < 7) return null;
  const y = month.slice(0, 4);
  const m = parseInt(month.slice(5, 7), 10);
  if (!y || !Number.isFinite(m)) return null;
  if (granularity === 'year') return y;
  if (granularity === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return month; // 'YYYY-MM'
}

// Ascending, deduped bucket list. Open bounds derive from transaction min/max month.
export function bucketsInRange(start, end, transactions = [], granularity = 'month') {
  const months = monthsInRange(start || null, end || null, transactions);
  if (months.length === 0) return [];
  const multiYear = months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4);
  const seen = new Map(); // key -> label, insertion order = ascending
  for (const mo of months) {
    const key = bucketKeyForMonth(mo, granularity);
    if (!key || seen.has(key)) continue;
    const y = mo.slice(0, 4);
    const m = parseInt(mo.slice(5, 7), 10);
    let label;
    if (granularity === 'year') label = y;
    else if (granularity === 'quarter') label = `Q${Math.floor((m - 1) / 3) + 1} '${y.slice(2)}`;
    else label = multiYear ? `${MONTHS[m - 1]} '${y.slice(2)}` : MONTHS[m - 1];
    seen.set(key, label);
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}

// Trended P&L: income/expense category line items over period buckets + a grand
// total. opts = { start, end, accountIds, granularity }. Net = income − expense.
export function profitAndLoss(transactions, categoriesById, opts = {}) {
  const granularity = opts.granularity || 'month';
  const buckets = bucketsInRange(opts.start ?? null, opts.end ?? null, transactions, granularity);
  const keys = buckets.map(b => b.key);
  const keySet = new Set(keys);
  const zero = () => Object.fromEntries(keys.map(k => [k, 0]));

  // categoryId -> { byBucket: {key: signedSum}, total: signedSum }
  const incomeAcc = new Map();
  const expenseAcc = new Map();

  for (const t of flattenForReports(filterRows(transactions, opts))) {
    const f = flowOf(t, categoriesById);
    if (f !== 'income' && f !== 'expense') continue;
    const month = typeof t.date === 'string' ? t.date.slice(0, 7) : '';
    const key = bucketKeyForMonth(month, granularity);
    if (!key || !keySet.has(key)) continue;
    const amt = Number.isFinite(t.amount) ? t.amount : 0;
    const acc = f === 'income' ? incomeAcc : expenseAcc;
    let rec = acc.get(t.categoryId);
    if (!rec) { rec = { byBucket: zero(), total: 0 }; acc.set(t.categoryId, rec); }
    rec.byBucket[key] += amt;
    rec.total += amt;
  }

  // sign: +1 for income (deposits positive), -1 for expense (magnitude)
  const buildSection = (acc, sign) => {
    const rows = [];
    const totalsByBucket = zero();
    let total = 0;
    for (const [categoryId, rec] of acc) {
      const cat = (categoriesById && categoriesById.get(categoryId)) || {};
      const byBucket = {};
      for (const k of keys) byBucket[k] = sign * rec.byBucket[k];
      const rowTotal = sign * rec.total;
      const hasActivity = rowTotal !== 0 || keys.some(k => byBucket[k] !== 0);
      if (!hasActivity) continue;
      rows.push({
        categoryId,
        name: cat.name || 'Uncategorized',
        icon: cat.icon || '📋',
        color: cat.color || '#6B7280',
        byBucket,
        total: rowTotal,
      });
      for (const k of keys) totalsByBucket[k] += byBucket[k];
      total += rowTotal;
    }
    rows.sort((a, b) => b.total - a.total);
    return { rows, totalsByBucket, total };
  };

  const income = buildSection(incomeAcc, 1);
  const expense = buildSection(expenseAcc, -1);
  const netByBucket = {};
  for (const k of keys) netByBucket[k] = income.totalsByBucket[k] - expense.totalsByBucket[k];
  const netTotal = income.total - expense.total;

  return { buckets, income, expense, netByBucket, netTotal };
}
