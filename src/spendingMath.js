import { nanoid } from 'nanoid';
import { OTHER_CATEGORY_NAME } from './categoriesDefaults.js';

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function migrateBills(bills) {
  if (!Array.isArray(bills)) return [];
  return bills.map(bill => {
    if (bill && typeof bill.month === 'string' && MONTH_RE.test(bill.month)) {
      const { date, ...rest } = bill;
      return rest;
    }
    let month = currentMonth();
    if (bill && typeof bill.date === 'string' && DATE_RE.test(bill.date)) {
      month = bill.date.slice(0, 7);
    }
    const { date, ...rest } = bill || {};
    return { ...rest, month };
  });
}

export function getItemDate(bill, item) {
  if (item && typeof item.date === 'string' && DATE_RE.test(item.date)) {
    return item.date;
  }
  const month = (bill && typeof bill.month === 'string' && MONTH_RE.test(bill.month))
    ? bill.month
    : currentMonth();
  return `${month}-01`;
}

export function getMonthItems(bills, month) {
  const out = [];
  for (const bill of bills || []) {
    for (const item of (bill && bill.items) || []) {
      if (!item) continue;
      if (getItemDate(bill, item).slice(0, 7) === month) {
        out.push(item);
      }
    }
  }
  return out;
}

export const VENDOR_PALETTE = [
  '#5b8dff', // blue
  '#3ddba0', // green
  '#d4a853', // accent gold
  '#a47dea', // purple
  '#e06c6c', // red
  '#46c2c8', // teal
  '#e89a4f', // orange
  '#c97ac8', // magenta
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getVendorColor(vendor) {
  const key = (typeof vendor === 'string' ? vendor : '').trim().toLowerCase();
  const idx = hashString(key) % VENDOR_PALETTE.length;
  return VENDOR_PALETTE[idx];
}

export function getMonthWindow(endMonth) {
  const [yStr, mStr] = endMonth.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10); // 1-12
  const out = [];
  for (let i = 11; i >= 0; i--) {
    let y = year;
    let m = month - i;
    while (m <= 0) { m += 12; y -= 1; }
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

export function aggregateByMonth(bills, endMonth, vendorFilter = null) {
  const window = getMonthWindow(endMonth);
  const windowSet = new Set(window);
  const buckets = {};
  for (const m of window) buckets[m] = { month: m, total: 0, byVendor: {} };

  for (const bill of bills || []) {
    if (vendorFilter && bill.vendor !== vendorFilter) continue;
    for (const item of bill.items || []) {
      if (!Number.isFinite(item.amount) || item.amount <= 0) continue;
      const itemMonth = getItemDate(bill, item).slice(0, 7);
      if (!windowSet.has(itemMonth)) continue;
      const bucket = buckets[itemMonth];
      bucket.total += item.amount;
      const vendor = bill.vendor || 'Unknown';
      bucket.byVendor[vendor] = (bucket.byVendor[vendor] || 0) + item.amount;
    }
  }

  return window.map(m => buckets[m]);
}

function daysInMonth(month) {
  const [y, m] = month.split('-').map(n => parseInt(n, 10));
  return new Date(y, m, 0).getDate();
}

function normalizeDescription(desc) {
  return (desc || '').toUpperCase().trim().replace(/\s+/g, ' ');
}

function monthsBetween(fromMonth, toMonth) {
  const [y1, m1] = fromMonth.split('-').map(n => parseInt(n, 10));
  const [y2, m2] = toMonth.split('-').map(n => parseInt(n, 10));
  return (y2 - y1) * 12 + (m2 - m1);
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = values[0];
  let max = 0;
  for (const [v, c] of counts) {
    if (c > max) { best = v; max = c; }
  }
  return best;
}

export function findRecurringCharges(bills, today = currentMonth()) {
  const groups = new Map();
  for (const bill of bills || []) {
    for (const item of bill.items || []) {
      if (!item || typeof item.description !== 'string') continue;
      if (!Number.isFinite(item.amount) || item.amount <= 0) continue;
      const key = normalizeDescription(item.description);
      if (!key) continue;
      const date = getItemDate(bill, item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        date,
        month: date.slice(0, 7),
        amount: item.amount,
        vendor: bill.vendor || 'Unknown',
        categoryId: item.categoryId || null,
        description: item.description.trim(),
      });
    }
  }

  const results = [];
  for (const occurrences of groups.values()) {
    const monthsSet = new Set(occurrences.map(o => o.month));
    if (monthsSet.size < 2) continue;

    const amounts = occurrences.map(o => o.amount);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const maxDeviation = avg > 0
      ? Math.max(...amounts.map(a => Math.abs(a - avg) / avg))
      : 0;
    const varies = maxDeviation > 0.15;

    const days = occurrences.map(o => parseInt(o.date.slice(8, 10), 10));
    const dayRange = Math.max(...days) - Math.min(...days);

    // Allow varying amounts when transactions cluster on similar days each
    // month (e.g. monthly tithes scaled to paycheck). Otherwise require
    // amounts to be roughly consistent.
    if (dayRange > 7 && varies) continue;

    const sortedByDate = [...occurrences].sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = sortedByDate[0].date;
    const lastDate = sortedByDate[sortedByDate.length - 1].date;
    const lastAmount = sortedByDate[sortedByDate.length - 1].amount;
    const monthsSinceLast = monthsBetween(lastDate.slice(0, 7), today);
    const active = monthsSinceLast >= 0 && monthsSinceLast <= 1;

    results.push({
      description: mode(occurrences.map(o => o.description)),
      vendor: mode(occurrences.map(o => o.vendor)),
      categoryId: mode(occurrences.map(o => o.categoryId)),
      avgAmount: avg,
      lastAmount,
      varies,
      monthCount: monthsSet.size,
      occurrences: occurrences.length,
      firstDate,
      lastDate,
      active,
    });
  }

  results.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return b.avgAmount - a.avgAmount;
  });

  return results;
}

export function aggregateByKeyword(bills, keyword) {
  const empty = { total: 0, byMonth: {}, lastDate: null, categoryId: null, occurrences: 0 };
  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) return empty;
  const needle = keyword.trim().toLowerCase();

  let total = 0;
  let occurrences = 0;
  let lastDate = null;
  const byMonth = {};
  const categoryIdCounts = new Map();

  for (const bill of bills || []) {
    for (const item of bill.items || []) {
      if (!item || typeof item.description !== 'string') continue;
      if (!Number.isFinite(item.amount) || item.amount <= 0) continue;
      if (!item.description.toLowerCase().includes(needle)) continue;

      const date = getItemDate(bill, item);
      const month = date.slice(0, 7);
      total += item.amount;
      byMonth[month] = (byMonth[month] || 0) + item.amount;
      occurrences += 1;
      if (!lastDate || date > lastDate) lastDate = date;
      const cid = item.categoryId || null;
      if (cid) categoryIdCounts.set(cid, (categoryIdCounts.get(cid) || 0) + 1);
    }
  }

  if (occurrences === 0) return empty;

  let categoryId = null;
  let max = 0;
  for (const [cid, count] of categoryIdCounts) {
    if (count > max) { categoryId = cid; max = count; }
  }

  return { total, byMonth, lastDate, categoryId, occurrences };
}

export function aggregateByDay(bills, targetMonth, vendorFilter = null) {
  const days = daysInMonth(targetMonth);
  const buckets = [];
  for (let d = 1; d <= days; d++) {
    buckets.push({ day: d, total: 0, byVendor: {} });
  }

  for (const bill of bills || []) {
    if (vendorFilter && bill.vendor !== vendorFilter) continue;
    for (const item of bill.items || []) {
      if (!Number.isFinite(item.amount) || item.amount <= 0) continue;
      const date = getItemDate(bill, item);
      if (date.slice(0, 7) !== targetMonth) continue;
      const day = parseInt(date.slice(8, 10), 10);
      if (day < 1 || day > days) continue;
      const bucket = buckets[day - 1];
      bucket.total += item.amount;
      const vendor = bill.vendor || 'Unknown';
      bucket.byVendor[vendor] = (bucket.byVendor[vendor] || 0) + item.amount;
    }
  }

  return buckets;
}

// One-time schema-v1 → schema-v2 migration.
// v1: item.category is a string (the category name).
// v2: item.categoryId is a stable id reference; categories are user-managed data.
//
// Inputs:
//   bills          — current bills array (v1 or v2 shape)
//   categories     — current categories array (null on first migration; v2 array thereafter)
//   seedCategories — DEFAULT_CATEGORIES (used only when categories is null)
//
// Returns: { bills, categories } both in v2 shape. Idempotent.
export function migrateToV2(bills, categories, seedCategories) {
  // Build (or reuse) the categories array first.
  const v2Cats = (categories && Array.isArray(categories) && categories.length > 0)
    ? categories
    : (seedCategories || []).map(seed => ({ ...seed, id: nanoid(8) }));

  const otherId =
    (v2Cats.find(c => c.name === OTHER_CATEGORY_NAME) || v2Cats[0] || {}).id;

  const nameToId = new Map();
  for (const c of v2Cats) nameToId.set(c.name, c.id);

  const v2Bills = (bills || []).map(bill => {
    if (!bill || !Array.isArray(bill.items)) return bill;
    const items = bill.items.map(item => {
      if (!item) return item;
      // Already v2 — leave it.
      if (typeof item.categoryId === 'string') return item;
      // Migrate from v1.
      const idFromName = nameToId.get(item.category);
      const { category, ...rest } = item;
      return { ...rest, categoryId: idFromName || otherId };
    });
    return { ...bill, items };
  });

  return { bills: v2Bills, categories: v2Cats };
}

// v2 → v3 migration: every category gets a `flow` field. Existing categories
// backfill to 'expense' (the implicit v2 behavior). Seed income + savings
// categories are appended; skipped if a category with the same name already
// exists in the user's list.
//
// Bills are unchanged — item amount-sign relaxation is additive.
//
// Idempotent: if every category already has a `flow` field of a known kind,
// inputs are returned untouched (no duplicate seed append).
export function migrateToV3(bills, categories, seedCategoriesV3) {
  const cats = Array.isArray(categories) ? categories : [];
  const allHaveFlow = cats.length > 0 && cats.every(c =>
    c && (c.flow === 'income' || c.flow === 'expense' || c.flow === 'savings')
  );
  if (allHaveFlow) {
    return { bills: bills || [], categories: cats };
  }

  // 1. Backfill flow on existing categories.
  const backfilled = cats.map(c => ({ ...c, flow: c.flow || 'expense' }));

  // 2. Append seeds by name (skip duplicates).
  const existingNames = new Set(backfilled.map(c => c.name));
  const newSeeds = (seedCategoriesV3 || [])
    .filter(s => !existingNames.has(s.name))
    .map(s => ({ ...s, id: nanoid(8) }));

  return {
    bills: bills || [],
    categories: [...backfilled, ...newSeeds],
  };
}
