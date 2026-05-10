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
        category: item.category || 'Other',
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
      category: mode(occurrences.map(o => o.category)),
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
  const empty = { total: 0, byMonth: {}, lastDate: null, category: null, occurrences: 0 };
  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) return empty;
  const needle = keyword.trim().toLowerCase();

  let total = 0;
  let occurrences = 0;
  let lastDate = null;
  const byMonth = {};
  const categoryCounts = new Map();

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
      const cat = item.category || 'Other';
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }
  }

  if (occurrences === 0) return empty;

  let category = null;
  let max = 0;
  for (const [cat, count] of categoryCounts) {
    if (count > max) { category = cat; max = count; }
  }

  return { total, byMonth, lastDate, category, occurrences };
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
