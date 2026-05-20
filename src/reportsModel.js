// src/reportsModel.js
// Pure, ledger-native report aggregation + chart geometry. No React, no storage.
import { accountClass, groupFor } from './accountsModel.js';

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (n) => String(n).padStart(2, '0');

// preset → { start, end } as 'YYYY-MM-DD' inclusive bounds (null = open). `now` is injected for tests.
export function resolvePeriod(preset, { now = new Date(), customStart = null, customEnd = null } = {}) {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-11
  const today = `${y}-${pad2(m + 1)}-${pad2(now.getDate())}`;
  const firstOf = (yy, mm) => `${yy}-${pad2(mm + 1)}-01`;
  const back = (n) => { const t = m - n; return { yy: y + Math.floor(t / 12), mm: ((t % 12) + 12) % 12 }; };
  switch (preset) {
    case 'this-month':     return { start: firstOf(y, m), end: today };
    case 'last-3-months':  { const { yy, mm } = back(2);  return { start: firstOf(yy, mm), end: today }; }
    case 'last-12-months': { const { yy, mm } = back(11); return { start: firstOf(yy, mm), end: today }; }
    case 'this-year':      return { start: `${y}-01-01`, end: today };
    case 'custom':         return { start: customStart || null, end: customEnd || null };
    case 'all-time':
    default:               return { start: null, end: null };
  }
}

// Ascending inclusive 'YYYY-MM' list. Open bounds derive from transaction min/max month.
export function monthsInRange(start, end, transactions = []) {
  let s = start, e = end;
  if (!s || !e) {
    let min = null, max = null;
    for (const t of transactions) {
      const mo = t && typeof t.date === 'string' ? t.date.slice(0, 7) : null;
      if (!mo || !MONTH_RE.test(mo)) continue;
      if (min === null || mo < min) min = mo;
      if (max === null || mo > max) max = mo;
    }
    const nowMonth = `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`;
    if (!s) s = `${min || nowMonth}-01`;
    if (!e) e = `${max || nowMonth}-28`;
  }
  const sm = s.slice(0, 7), em = e.slice(0, 7);
  if (!MONTH_RE.test(sm) || !MONTH_RE.test(em)) return [];
  const out = [];
  let [yy, mm] = sm.split('-').map(n => parseInt(n, 10));
  while (out.length <= 1200) {
    const key = `${yy}-${pad2(mm)}`;
    if (key > em) break;
    out.push(key);
    mm += 1; if (mm > 12) { mm = 1; yy += 1; }
  }
  return out;
}

// Set of account ids in scope, or null for "no restriction" (all accounts).
export function scopeAccountIds(accounts, scope = { kind: 'all' }, typesById = undefined) {
  if (!scope || scope.kind === 'all') return null;
  const ids = new Set();
  for (const a of accounts || []) {
    if (scope.kind === 'account' && a.id === scope.id) ids.add(a.id);
    else if (scope.kind === 'type' && a.type === scope.typeId) ids.add(a.id);
    else if (scope.kind === 'group' && groupFor(a.type, typesById) === scope.group) ids.add(a.id);
  }
  return ids;
}

// Shared gate: date within [start,end] (null=open) AND account in set (null=all). Keeps transfers.
export function filterRows(transactions, { start = null, end = null, accountIds = null } = {}) {
  return (transactions || []).filter(t => {
    if (!t) return false;
    if (accountIds && !accountIds.has(t.accountId)) return false;
    const date = typeof t.date === 'string' ? t.date : '';
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });
}

// Internal: a row's countable flow, or null for transfer legs / uncategorized rows.
function flowOf(t, categoriesById) {
  if (!t || t.transferId != null) return null;
  const cat = categoriesById && categoriesById.get(t.categoryId);
  const f = cat && cat.flow;
  return (f === 'income' || f === 'expense' || f === 'savings') ? f : null;
}

// Income / Spending / Savings over flow-countable rows in scope+period. NET IS SAVINGS.
export function incomeExpenseSummary(transactions, categoriesById, opts = {}) {
  const rows = filterRows(transactions, opts);
  let income = 0, expenseSigned = 0, savingsSigned = 0;
  for (const t of rows) {
    const f = flowOf(t, categoriesById);
    if (!f) continue;
    const amt = Number.isFinite(t.amount) ? t.amount : 0;
    if (f === 'income') income += amt;
    else if (f === 'expense') expenseSigned += amt;
    else savingsSigned += amt;
  }
  const spending = -expenseSigned;
  const earmarked = -savingsSigned;
  const savings = income - spending;
  return { income, spending, savings, savingsRate: income > 0 ? savings / income : 0, earmarked };
}

// Expense-flow totals per category, descending. total = magnitude (refunds reduce it).
export function spendingByCategory(transactions, categoriesById, opts = {}) {
  const rows = filterRows(transactions, opts);
  const signed = new Map();
  for (const t of rows) {
    if (flowOf(t, categoriesById) !== 'expense') continue;
    const amt = Number.isFinite(t.amount) ? t.amount : 0;
    signed.set(t.categoryId, (signed.get(t.categoryId) || 0) + amt);
  }
  const entries = [...signed.entries()].map(([categoryId, sum]) => {
    const cat = (categoriesById && categoriesById.get(categoryId)) || {};
    return {
      categoryId,
      name: cat.name || 'Uncategorized',
      icon: cat.icon || '📋',
      color: cat.color || '#6B7280',
      total: -sum,
    };
  }).filter(e => e.total > 0);
  const sum = entries.reduce((s, e) => s + e.total, 0);
  for (const e of entries) e.pct = sum > 0 ? (e.total / sum) * 100 : 0;
  entries.sort((a, b) => b.total - a.total);
  return entries;
}

// Per-month income / spending / net across `months` (default: derived from period bounds).
export function cashFlowByMonth(transactions, categoriesById, opts = {}, months = null) {
  const list = months || monthsInRange(opts.start || null, opts.end || null, transactions);
  const byMonth = new Map(list.map(mo => [mo, { month: mo, income: 0, spending: 0, net: 0 }]));
  for (const t of filterRows(transactions, opts)) {
    const f = flowOf(t, categoriesById);
    if (f !== 'income' && f !== 'expense') continue;
    const b = byMonth.get(typeof t.date === 'string' ? t.date.slice(0, 7) : '');
    if (!b) continue;
    const amt = Number.isFinite(t.amount) ? t.amount : 0;
    if (f === 'income') b.income += amt; else b.spending += -amt;
  }
  const out = list.map(mo => byMonth.get(mo));
  for (const b of out) b.net = b.income - b.spending;
  return out;
}

// Household net worth as-of each month-end. On-balance-sheet accounts only; transfers net out.
export function netWorthByMonth(accounts, transactions, typesById, opts = {}, months = null) {
  const list = months || monthsInRange(opts.start || null, opts.end || null, transactions);
  const accountIds = opts.accountIds || null;
  const scoped = (accounts || []).filter(a => a && (!accountIds || accountIds.has(a.id)));
  return list.map(mo => {
    let assets = 0, owed = 0, netWorth = 0;
    for (const a of scoped) {
      const k = accountClass(a.type, typesById);
      if (k !== 'asset' && k !== 'liability') continue;
      let bal = Number.isFinite(a.openingBalance) ? a.openingBalance : 0;
      for (const t of transactions || []) {
        if (t && t.accountId === a.id && Number.isFinite(t.amount)
            && typeof t.date === 'string' && t.date.slice(0, 7) <= mo) {
          bal += t.amount;
        }
      }
      netWorth += bal;
      if (k === 'asset') assets += bal; else owed += Math.abs(Math.min(0, bal));
    }
    return { month: mo, assets, owed, netWorth };
  });
}
