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

function normalizeLabel(s) {
  return (typeof s === 'string' ? s : '').toUpperCase().trim().replace(/\s+/g, ' ');
}
function monthsBetween(fromMonth, toMonth) {
  const [y1, m1] = fromMonth.split('-').map(n => parseInt(n, 10));
  const [y2, m2] = toMonth.split('-').map(n => parseInt(n, 10));
  return (y2 - y1) * 12 + (m2 - m1);
}
function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = values[0], max = 0;
  for (const [v, c] of counts) if (c > max) { best = v; max = c; }
  return best;
}

// Repeating expense charges grouped by normalized payee/description, spanning ≥2 months.
export function recurringCharges(transactions, categoriesById, opts = {}) {
  const { now = new Date() } = opts;
  const nowMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const groups = new Map();
  for (const t of filterRows(transactions, opts)) {
    if (flowOf(t, categoriesById) !== 'expense') continue;
    const date = typeof t.date === 'string' ? t.date : '';
    if (!DATE_RE.test(date)) continue;
    const key = normalizeLabel(t.payee || t.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      date, month: date.slice(0, 7),
      amount: -(Number.isFinite(t.amount) ? t.amount : 0),
      categoryId: t.categoryId,
      label: (t.payee || t.description || '').trim(),
    });
  }
  const results = [];
  for (const [key, occ] of groups) {
    const monthsSet = new Set(occ.map(o => o.month));
    if (monthsSet.size < 2) continue;
    const amounts = occ.map(o => o.amount);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const varies = avg !== 0 && Math.max(...amounts.map(a => Math.abs(a - avg) / Math.abs(avg))) > 0.15;
    const sorted = [...occ].sort((a, b) => a.date.localeCompare(b.date));
    const lastMonth = sorted[sorted.length - 1].month;
    const gap = monthsBetween(lastMonth, nowMonth);
    results.push({
      key,
      label: mode(occ.map(o => o.label)),
      categoryId: mode(occ.map(o => o.categoryId)),
      avgAmount: avg,
      lastAmount: sorted[sorted.length - 1].amount,
      occurrences: occ.length,
      monthCount: monthsSet.size,
      firstDate: sorted[0].date,
      lastDate: sorted[sorted.length - 1].date,
      active: gap >= 0 && gap <= 1,
      varies,
    });
  }
  results.sort((a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : Math.abs(b.avgAmount) - Math.abs(a.avgAmount)));
  return results;
}

// Likely dual charges: same account + date + amount + normalized label, ≥2 rows. Transfers excluded.
export function findDuplicates(transactions, opts = {}) {
  const dismissed = opts.dismissed || null;
  const groups = new Map();
  for (const t of filterRows(transactions, opts)) {
    if (t.transferId != null) continue;
    const date = typeof t.date === 'string' ? t.date : '';
    if (!DATE_RE.test(date)) continue;
    const amt = Number.isFinite(t.amount) ? Math.round(t.amount * 100) / 100 : 0;
    const key = `${t.accountId}|${date}|${amt}|${normalizeLabel(t.payee || t.description)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const out = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const t0 = list[0];
    const ids = list.map(t => t.id);
    const signature = [...ids].sort().join('|');
    if (dismissed && dismissed.has(signature)) continue;
    out.push({
      accountId: t0.accountId,
      label: (t0.payee || t0.description || '').trim(),
      amount: t0.amount,
      date: t0.date,
      ids,
      signature,
    });
  }
  return out;
}

// SVG polyline geometry for a trend line. Higher value → smaller y (drawn higher).
export function sparklinePath(values, { width = 100, height = 30, pad = 2 } = {}) {
  const n = (values || []).length;
  if (n === 0) return { d: '', points: [] };
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const innerW = Math.max(0, width - pad * 2);
  const innerH = Math.max(0, height - pad * 2);
  const points = values.map((v, i) => ({
    x: n === 1 ? pad + innerW / 2 : pad + (i / (n - 1)) * innerW,
    y: pad + innerH - ((v - min) / span) * innerH,
  }));
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  return { d, points };
}

// Bucket recurringCharges rows by user-set status; flag zombies (charged after cancellation).
// `now` is intentionally NOT needed: a zombie is purely lastDate-month > cancelledAsOf.
export function classifyRecurring(rows, subscriptions = {}) {
  const alerts = [], ongoing = [], cancelled = [], review = [];
  for (const r of rows || []) {
    const ack = subscriptions && subscriptions[r.key];
    if (ack && ack.status === 'ongoing') {
      ongoing.push(r);
    } else if (ack && ack.status === 'cancelled') {
      const cancelledAsOf = ack.cancelledAsOf || '';
      const lastMonth = (r.lastDate || '').slice(0, 7);
      if (cancelledAsOf && lastMonth > cancelledAsOf) {
        alerts.push({ ...r, alert: 'zombie', cancelledAsOf });
      } else {
        cancelled.push({ ...r, cancelledAsOf });
      }
    } else {
      review.push(r);
    }
  }
  return { alerts, ongoing, cancelled, review };
}

// Rect geometry for a +/- bar chart with the zero baseline at mid-height.
export function barLayout(values, { width = 100, height = 40, gap = 2 } = {}) {
  const n = (values || []).length;
  if (n === 0) return [];
  const maxAbs = Math.max(1, ...values.map(v => Math.abs(v)));
  const slot = width / n;
  const barW = Math.max(0, slot - gap);
  const zeroY = height / 2;
  return values.map((v, i) => {
    const h = (Math.abs(v) / maxAbs) * (height / 2);
    const negative = v < 0;
    return { x: i * slot + gap / 2, y: negative ? zeroY : zeroY - h, width: barW, height: h, negative };
  });
}

// Yields one "virtual row" per category-bearing unit. Splits explode into one
// row per category line; transfer splits are dropped (they net out, same as
// top-level transfers do for flow). Non-split transactions yield as-is.
export function* flattenForReports(transactions) {
  for (const t of transactions || []) {
    if (!Array.isArray(t.splits) || t.splits.length === 0) {
      yield t;
      continue;
    }
    for (const s of t.splits) {
      if (s.transferId) continue;
      yield {
        id: `${t.id}#${s.id}`,
        accountId: t.accountId,
        date: t.date,
        payee: t.payee,
        description: s.description || t.description,
        categoryId: s.categoryId,
        amount: s.amount,
        transferId: null,
        _parentId: t.id,
        _splitId: s.id,
      };
    }
  }
}

