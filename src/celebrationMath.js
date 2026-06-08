// src/celebrationMath.js
// Pure milestone detection over ledger/report state. No React, no storage.
import { householdTotals } from './accountsModel.js';

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
