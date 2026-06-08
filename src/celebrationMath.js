// src/celebrationMath.js
// Pure milestone detection over ledger/report state. No React, no storage.
import { accountClass, computeRegister, householdTotals } from './accountsModel.js';
import { cashFlowByMonth } from './reportsModel.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const NETWORTH_BASE = [25000, 50000, 100000, 250000, 500000, 750000, 1000000];
const NETWORTH_STEP = 500000; // beyond $1M, every $500k

export function formatThreshold(amount) {
  if (amount >= 1000000) {
    const m = amount / 1000000;
    return `$${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return `$${amount / 1000}k`;
}

export function formatMoney(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function monthLabel(ym) {
  const [y, mo] = (ym || '').split('-').map((x) => parseInt(x, 10));
  if (!y || !mo) return ym || '';
  return `${MONTH_NAMES[mo - 1]} ${y}`;
}

export function networthThresholdsReached(netWorth) {
  const reached = [];
  for (const t of NETWORTH_BASE) if (netWorth >= t) reached.push(t);
  let t = 1000000 + NETWORTH_STEP;
  while (netWorth >= t) { reached.push(t); t += NETWORTH_STEP; }
  return reached;
}

export function detectNetWorth(accounts, transactions, typesById) {
  const { netWorth } = householdTotals(accounts, transactions, typesById);
  return networthThresholdsReached(netWorth).map((t) => ({
    key: `networth:${t}`,
    type: 'networth',
    title: `${formatThreshold(t)} net worth!`,
    detail: 'A new milestone reached',
  }));
}

export function detectPaidOff(accounts, transactions, typesById) {
  const out = [];
  for (const a of accounts || []) {
    if (accountClass(a.type, typesById) !== 'liability') continue;
    const reg = computeRegister(a, transactions);
    if (reg.length === 0) continue;
    const opening = Number.isFinite(a.openingBalance) ? a.openingBalance : 0;
    let minBal = opening;
    for (const r of reg) if (r.balance < minBal) minBal = r.balance;
    const current = reg[reg.length - 1].balance;
    if (minBal < 0 && current >= 0) {
      out.push({
        key: `paidoff:${a.id}`,
        type: 'paidoff',
        title: `${a.name || 'Account'} paid off!`,
        detail: 'You cleared the balance 🎉',
      });
    }
  }
  return out;
}

function completedMonths(transactions, categoriesById, now) {
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return cashFlowByMonth(transactions, categoriesById, {}).filter((m) => m.month < cur);
}

export function detectBestMonth(transactions, categoriesById, now = new Date()) {
  const months = completedMonths(transactions, categoriesById, now);
  if (months.length < 3) return [];
  let best = null;
  for (const m of months) if (best === null || m.net > best.net) best = m;
  if (!best || best.net <= 0) return [];
  return [{
    key: `bestmonth:${best.month}`,
    type: 'bestmonth',
    title: 'Best savings month ever!',
    detail: `You saved ${formatMoney(best.net)} in ${monthLabel(best.month)}`,
  }];
}

export function streakThresholdsReached(streak) {
  const out = [];
  for (const t of [3, 6, 12]) if (streak >= t) out.push(t);
  let t = 24;
  while (streak >= t) { out.push(t); t += 12; }
  return out;
}

export function detectStreak(transactions, categoriesById, now = new Date()) {
  const months = completedMonths(transactions, categoriesById, now);
  let streak = 0;
  for (let i = months.length - 1; i >= 0; i -= 1) {
    if (months[i].net > 0) streak += 1; else break;
  }
  return streakThresholdsReached(streak).map((n) => ({
    key: `streak:${n}`,
    type: 'streak',
    title: `${n}-month savings streak!`,
    detail: 'Keep it going',
  }));
}
