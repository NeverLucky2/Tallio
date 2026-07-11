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
