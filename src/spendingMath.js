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

export function getPrimaryMonth(bill) {
  let earliest = null;
  for (const item of (bill && bill.items) || []) {
    if (item && typeof item.date === 'string' && DATE_RE.test(item.date)) {
      const m = item.date.slice(0, 7);
      if (earliest === null || m < earliest) earliest = m;
    }
  }
  if (earliest !== null) return earliest;
  if (bill && typeof bill.month === 'string' && MONTH_RE.test(bill.month)) return bill.month;
  return currentMonth();
}

export function getBillMonths(bill) {
  const months = new Set([getPrimaryMonth(bill)]);
  for (const item of (bill && bill.items) || []) {
    if (item && typeof item.date === 'string' && DATE_RE.test(item.date)) {
      months.add(item.date.slice(0, 7));
    }
  }
  return months;
}

export function getLatestMonth(bill) {
  let latest = getPrimaryMonth(bill);
  for (const item of (bill && bill.items) || []) {
    if (item && typeof item.date === 'string' && DATE_RE.test(item.date)) {
      const m = item.date.slice(0, 7);
      if (m > latest) latest = m;
    }
  }
  return latest;
}

export function getBillItemsForMonth(bill, month) {
  if (!bill || !Array.isArray(bill.items)) return [];
  const primary = getPrimaryMonth(bill);
  return bill.items.filter(item => {
    if (!item) return false;
    if (typeof item.date === 'string' && DATE_RE.test(item.date)) {
      return item.date.slice(0, 7) === month;
    }
    return month === primary;
  });
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

export function aggregateByMonth(bills, endMonth, categoriesById, vendorFilter = null) {
  const window = getMonthWindow(endMonth);
  const windowSet = new Set(window);
  const buckets = {};
  for (const m of window) {
    buckets[m] = { month: m, income: 0, spent: 0, saved: 0, byVendor: {} };
  }

  for (const bill of bills || []) {
    if (vendorFilter && bill.vendor !== vendorFilter) continue;
    for (const item of bill.items || []) {
      if (!Number.isFinite(item.amount) || item.amount === 0) continue;
      const itemMonth = getItemDate(bill, item).slice(0, 7);
      if (!windowSet.has(itemMonth)) continue;
      const bucket = buckets[itemMonth];
      const cat = categoriesById && categoriesById.get(item.categoryId);
      const flow = cat && cat.flow ? cat.flow : 'expense';
      if (flow === 'income') {
        bucket.income += item.amount;
      } else if (flow === 'savings') {
        bucket.saved += item.amount;
      } else {
        bucket.spent += item.amount;
        const vendor = bill.vendor || 'Unknown';
        bucket.byVendor[vendor] = (bucket.byVendor[vendor] || 0) + item.amount;
      }
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

export function findRecurringCharges(bills, today = currentMonth(), categoriesById = null) {
  const groups = new Map();
  for (const bill of bills || []) {
    for (const item of bill.items || []) {
      if (!item || typeof item.description !== 'string') continue;
      if (!Number.isFinite(item.amount) || item.amount === 0) continue;
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
    const maxDeviation = avg !== 0
      ? Math.max(...amounts.map(a => Math.abs(a - avg) / Math.abs(avg)))
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

    const majorityCategoryId = mode(occurrences.map(o => o.categoryId));
    const majorityCat = categoriesById && categoriesById.get(majorityCategoryId);
    const flow = (majorityCat && majorityCat.flow) || 'expense';

    results.push({
      description: mode(occurrences.map(o => o.description)),
      vendor: mode(occurrences.map(o => o.vendor)),
      categoryId: majorityCategoryId,
      flow,
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
    return Math.abs(b.avgAmount) - Math.abs(a.avgAmount);
  });

  return results;
}

export function aggregateByKeyword(bills, keyword, categoriesById = null) {
  const empty = { total: 0, byMonth: {}, lastDate: null, categoryId: null, flow: 'expense', occurrences: 0 };
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
      if (!Number.isFinite(item.amount) || item.amount === 0) continue;
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
  const cat = categoriesById && categoriesById.get(categoryId);
  const flow = (cat && cat.flow) || 'expense';

  return { total, byMonth, lastDate, categoryId, flow, occurrences };
}

export function aggregateByDay(bills, targetMonth, categoriesById = null, vendorFilter = null) {
  const days = daysInMonth(targetMonth);
  const buckets = [];
  for (let d = 1; d <= days; d++) {
    buckets.push({ day: d, spent: 0, byVendor: {} });
  }

  for (const bill of bills || []) {
    if (vendorFilter && bill.vendor !== vendorFilter) continue;
    for (const item of bill.items || []) {
      if (!Number.isFinite(item.amount) || item.amount === 0) continue;
      const cat = categoriesById && categoriesById.get(item.categoryId);
      const flow = cat && cat.flow ? cat.flow : 'expense';
      if (flow !== 'expense') continue;
      const date = getItemDate(bill, item);
      if (date.slice(0, 7) !== targetMonth) continue;
      const day = parseInt(date.slice(8, 10), 10);
      if (day < 1 || day > days) continue;
      const bucket = buckets[day - 1];
      bucket.spent += item.amount;
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
// Idempotent: if every category already has a `flow` field of a known kind
// AND every seed category (by name) is present, inputs are returned untouched.
export function migrateToV3(bills, categories, seedCategoriesV3) {
  const cats = Array.isArray(categories) ? categories : [];
  const allHaveFlow = cats.length > 0 && cats.every(c =>
    c && (c.flow === 'income' || c.flow === 'expense' || c.flow === 'savings')
  );
  const existingNames = new Set(cats.map(c => c && c.name));
  const allSeedsPresent = (seedCategoriesV3 || []).every(s => existingNames.has(s.name));
  if (allHaveFlow && allSeedsPresent) {
    return { bills: bills || [], categories: cats };
  }

  // 1. Backfill flow on existing categories.
  const backfilled = cats.map(c => ({ ...c, flow: c.flow || 'expense' }));

  // 2. Append seeds by name (skip duplicates).
  const backfilledNames = new Set(backfilled.map(c => c.name));
  const newSeeds = (seedCategoriesV3 || [])
    .filter(s => !backfilledNames.has(s.name))
    .map(s => ({ ...s, id: nanoid(8) }));

  return {
    bills: bills || [],
    categories: [...backfilled, ...newSeeds],
  };
}

// Pure: compute the flow-aware net of a bill.
// Returns { income, expense, savings, net } where net = income - expense - savings.
// Items with an unknown categoryId fall back to 'expense' flow (safe default).
export function getBillNet(bill, categoriesById) {
  let income = 0, expense = 0, savings = 0;
  for (const item of (bill && bill.items) || []) {
    if (!item || !Number.isFinite(item.amount)) continue;
    const cat = categoriesById && categoriesById.get(item.categoryId);
    const flow = cat && cat.flow ? cat.flow : 'expense';
    if (flow === 'income')        income  += item.amount;
    else if (flow === 'savings')  savings += item.amount;
    else                          expense += item.amount;
  }
  return { income, expense, savings, net: income - expense - savings };
}

// Shift a YYYY-MM-DD date string to a target YYYY-MM month, preserving
// day-of-month with last-day clamping. Null / invalid / empty → null.
// Same-month target → identical string. Used by computeCatchUp (auto-spawn)
// and the cross-month bill-level duplicate.
export function shiftItemDate(date, targetMonth) {
  if (!date || typeof date !== 'string' || !DATE_RE.test(date)) return null;
  if (typeof targetMonth !== 'string' || !MONTH_RE.test(targetMonth)) return null;
  const day = parseInt(date.slice(8, 10), 10);
  const [yStr, mStr] = targetMonth.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  return `${targetMonth}-${String(clampedDay).padStart(2, '0')}`;
}

// Plan auto-spawn catch-up for the current app session.
// Pure function. Inputs:
//   bills      — current bills array
//   todayMonth — "YYYY-MM" for the catch-up upper bound (inclusive)
// Returns:
//   { bills, conflicts }
//     bills      — bills array with all unambiguous spawns appended
//     conflicts  — { chainId, chainSourceBillId, targetMonth, existingBillId }[]
//
// Algorithm:
//   1. Group bills by recurringChainId (skip null).
//   2. For each chain:
//      a. Find the chronologically latest instance where recurring === true.
//         If none, the chain is dormant — skip.
//      b. Walk target months strictly after source.month up to and including
//         todayMonth. For each:
//           - If a bill in the chain already exists in that month, skip.
//           - Else if a same-vendor non-chain bill exists, push a conflict
//             entry and stop iterating further months for this chain.
//           - Else clone source: fresh bill id, fresh item ids, month replaced,
//             item dates shifted via shiftItemDate, recurring=true,
//             recurringChainId carried over.
export function computeCatchUp(bills, todayMonth) {
  if (!Array.isArray(bills) || bills.length === 0) {
    return { bills: bills || [], conflicts: [] };
  }
  if (typeof todayMonth !== 'string' || !MONTH_RE.test(todayMonth)) {
    return { bills, conflicts: [] };
  }

  // Group bills by chain id.
  const byChain = new Map();
  for (const b of bills) {
    if (b && typeof b.recurringChainId === 'string' && b.recurringChainId) {
      if (!byChain.has(b.recurringChainId)) byChain.set(b.recurringChainId, []);
      byChain.get(b.recurringChainId).push(b);
    }
  }

  if (byChain.size === 0) {
    return { bills, conflicts: [] };
  }

  // Working copy of bills — we'll append spawns to it as we go.
  let working = bills.slice();
  const conflicts = [];

  for (const [chainId, chainBills] of byChain) {
    // Find the chronologically latest bill in the chain overall.
    const sortedChain = chainBills.slice().sort((a, b) => getLatestMonth(a).localeCompare(getLatestMonth(b)));
    const latestOverall = sortedChain[sortedChain.length - 1];
    // If the latest bill has recurring=false (or chain is empty), the chain is dormant — skip.
    if (!latestOverall || latestOverall.recurring !== true) continue;
    // latestOverall IS the source: the guard above confirmed recurring===true,
    // so there's no need for a separate activeInstances filter/sort/pop.
    const source = latestOverall;

    // Iterate target months strictly after source.month, up to todayMonth.
    const targets = monthsBetweenExclusiveInclusive(getLatestMonth(source), todayMonth);
    for (const targetMonth of targets) {
      const alreadyInChain = working.some(b =>
        b.recurringChainId === chainId && getBillMonths(b).has(targetMonth)
      );
      if (alreadyInChain) continue;

      const conflictBill = working.find(b =>
        getBillMonths(b).has(targetMonth) &&
        b.vendor === source.vendor &&
        b.recurringChainId !== chainId
      );
      if (conflictBill) {
        conflicts.push({
          chainId,
          chainSourceBillId: source.id,
          targetMonth,
          existingBillId: conflictBill.id,
        });
        break;  // stop further months for this chain
      }

      // Clean spawn.
      const spawned = {
        ...source,
        id: spawnId(),
        month: targetMonth,
        items: (source.items || []).map(it => ({
          ...it,
          id: spawnId(),
          date: shiftItemDate(it.date, targetMonth),
        })),
        recurring: true,
        recurringChainId: chainId,
      };
      working = [...working, spawned];
    }
  }

  return { bills: working, conflicts };
}

// Exclusive of `fromMonth`, inclusive of `toMonth`.
function monthsBetweenExclusiveInclusive(fromMonth, toMonth) {
  if (fromMonth >= toMonth) return [];
  const out = [];
  let [y, m] = fromMonth.split('-').map(n => parseInt(n, 10));
  while (true) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key === toMonth) break;
    if (key > toMonth) break;  // defensive — shouldn't happen with valid inputs
  }
  return out;
}

// Pure id generator for spawned bills/items. crypto.randomUUID is available
// in Node 16+ (vitest jsdom) and all modern browsers — matches the pattern
// used by handleCapture in App.jsx.
function spawnId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'spawn_' + Math.random().toString(36).slice(2, 10);
}

// Surface every active auto-managed recurring chain as one summary entry.
// A chain is "active" when its chronologically latest bill has recurring === true.
// Dormant chains (latest bill has recurring=false or missing) are NOT returned.
//
// Returns an array shaped to merge with findRecurringCharges results in the
// Recurring panels. Each entry:
//   { kind: 'auto', chainId, vendor, description, categoryId, flow,
//     lastAmount, avgAmount, monthCount, occurrences, firstDate, lastDate,
//     active: true }
//
// `description` mirrors `vendor` (bill-level entries have no item descriptions
// to aggregate, unlike findRecurringCharges).
//
// `lastAmount` and `avgAmount` are the bill's flow-aligned net via getBillNet
// (income for income-flow chains, expense for expense, savings for savings).
export function findAutoRecurringChains(bills, categoriesById = null) {
  const byChain = new Map();
  for (const b of bills || []) {
    if (!b || typeof b.recurringChainId !== 'string' || !b.recurringChainId) continue;
    if (!byChain.has(b.recurringChainId)) byChain.set(b.recurringChainId, []);
    byChain.get(b.recurringChainId).push(b);
  }

  const results = [];
  for (const [chainId, chainBills] of byChain) {
    // Sort all chain bills chronologically (null-safe, mirrors computeCatchUp).
    const sorted = chainBills.slice().sort((a, b) => (a.month ?? '').localeCompare(b.month ?? ''));
    const latest = sorted[sorted.length - 1];
    // Chain is dormant if the latest (chronologically) bill is not recurring=true.
    if (!latest || latest.recurring !== true) continue;

    // Majority category among items in the latest bill.
    const counts = new Map();
    for (const it of latest.items || []) {
      if (!it) continue;
      const cid = it.categoryId || null;
      counts.set(cid, (counts.get(cid) || 0) + 1);
    }
    let majorityCategoryId = null;
    let maxCount = 0;
    for (const [cid, c] of counts) {
      if (c > maxCount) { majorityCategoryId = cid; maxCount = c; }
    }
    const cat = categoriesById && categoriesById.get(majorityCategoryId);
    const flow = (cat && cat.flow) || 'expense';

    // Flow-aligned net via getBillNet.
    const flowKey = flow === 'income' ? 'income'
                  : flow === 'savings' ? 'savings'
                  : 'expense';
    const lastAmount = getBillNet(latest, categoriesById)[flowKey];
    const totalAmount = sorted.reduce(
      (s, b) => s + getBillNet(b, categoriesById)[flowKey], 0
    );
    const avgAmount = totalAmount / sorted.length;

    const uniqueMonths = new Set(sorted.map(b => b.month));

    results.push({
      kind: 'auto',
      chainId,
      vendor: latest.vendor || '',
      description: latest.vendor || '',
      categoryId: majorityCategoryId,
      flow,
      lastAmount,
      avgAmount,
      monthCount: uniqueMonths.size,
      occurrences: sorted.length,
      firstDate: `${sorted[0].month}-01`,
      lastDate: `${latest.month}-01`,
      active: true,
    });
  }

  return results;
}
