import { getItemDate, getMonthWindow } from './spendingMath.js';

const FLOW_ORDER = { income: 0, expense: 1, savings: 2 };

// today: "YYYY-MM" or "YYYY-MM-DD". Only year + month components are used.
export function aggregateYoYByCategory(bills, today, categoriesById) {
  if (!Array.isArray(bills) || bills.length === 0) return [];
  const yearStr = today.slice(0, 4);
  const monthStr = today.slice(5, 7);
  const currentYear = parseInt(yearStr, 10);
  const priorYear = currentYear - 1;
  const upperMonth = monthStr; // inclusive cap

  // Per-category totals: { categoryId → { current, prior } }
  const totals = new Map();
  for (const bill of bills) {
    if (!bill || !Array.isArray(bill.items)) continue;
    for (const item of bill.items) {
      if (!item || !Number.isFinite(item.amount) || item.amount === 0) continue;
      const cid = item.categoryId;
      if (!cid || !categoriesById || !categoriesById.has(cid)) continue;
      const date = getItemDate(bill, item);
      const itemYear = parseInt(date.slice(0, 4), 10);
      const itemMonth = date.slice(5, 7);
      if (itemMonth > upperMonth) continue; // outside the window in both years
      let bucket;
      if (itemYear === currentYear) bucket = 'current';
      else if (itemYear === priorYear) bucket = 'prior';
      else continue;
      let entry = totals.get(cid);
      if (!entry) { entry = { current: 0, prior: 0 }; totals.set(cid, entry); }
      entry[bucket] += item.amount;
    }
  }

  const rows = [];
  for (const [categoryId, { current, prior }] of totals) {
    if (current === 0 && prior === 0) continue;
    const cat = categoriesById.get(categoryId);
    const deltaAbs = current - prior;
    const deltaPct = prior === 0 ? null : Math.round((deltaAbs / Math.abs(prior)) * 100);
    rows.push({
      categoryId,
      name: cat.name,
      flow: cat.flow || 'expense',
      currentYTD: current,
      priorYTD: prior,
      deltaPct,
      deltaAbs,
    });
  }

  rows.sort((a, b) => {
    const fa = FLOW_ORDER[a.flow] ?? 1;
    const fb = FLOW_ORDER[b.flow] ?? 1;
    if (fa !== fb) return fa - fb;
    return Math.abs(b.currentYTD) - Math.abs(a.currentYTD);
  });
  return rows;
}

export function aggregateMonthByCategory(bills, endMonth, categoryId) {
  const window = getMonthWindow(endMonth);
  const buckets = window.map(m => ({ month: m, total: 0 }));
  const byMonth = new Map(buckets.map(b => [b.month, b]));

  for (const bill of bills || []) {
    if (!bill || !Array.isArray(bill.items)) continue;
    for (const item of bill.items) {
      if (!item || !Number.isFinite(item.amount) || item.amount === 0) continue;
      if (item.categoryId !== categoryId) continue;
      const date = getItemDate(bill, item);
      const m = date.slice(0, 7);
      const bucket = byMonth.get(m);
      if (bucket) bucket.total += item.amount;
    }
  }
  return buckets;
}

export function partitionSpentByRecurring(bills, month, categoriesById) {
  let recurring = 0;
  let oneOff = 0;
  for (const bill of bills || []) {
    if (!bill || !Array.isArray(bill.items)) continue;
    const isRecurring = !!bill.recurringChainId;
    for (const item of bill.items) {
      if (!item || !Number.isFinite(item.amount) || item.amount === 0) continue;
      const date = getItemDate(bill, item);
      if (date.slice(0, 7) !== month) continue;
      const cat = categoriesById && categoriesById.get(item.categoryId);
      const flow = (cat && cat.flow) || 'expense';
      if (flow !== 'expense') continue;
      if (isRecurring) recurring += item.amount;
      else oneOff += item.amount;
    }
  }
  return { recurring, oneOff, total: recurring + oneOff };
}
