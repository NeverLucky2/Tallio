// src/reportsModel.js
// Pure, ledger-native report aggregation + chart geometry. No React, no storage.
import { groupFor } from './accountsModel.js';

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
