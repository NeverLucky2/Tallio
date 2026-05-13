import { getItemDate } from './spendingMath.js';

const CSV_HEADER = 'date,vendor,description,amount,category,flow,recurring';

function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildItemsCsv(bills, categoriesById) {
  const rows = [];
  for (const bill of bills || []) {
    if (!bill || !Array.isArray(bill.items)) continue;
    const recurring = bill.recurringChainId ? 'yes' : 'no';
    for (const item of bill.items) {
      if (!item || !Number.isFinite(item.amount) || item.amount === 0) continue;
      const cat = categoriesById && categoriesById.get(item.categoryId);
      const categoryName = cat ? cat.name : 'Uncategorized';
      const flow = (cat && cat.flow) || 'expense';
      const date = getItemDate(bill, item);
      rows.push({
        date,
        vendor: bill.vendor || '',
        description: item.description || '',
        amount: item.amount.toFixed(2),
        category: categoryName,
        flow,
        recurring,
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const lines = [CSV_HEADER];
  for (const r of rows) {
    lines.push([
      escapeCsv(r.date),
      escapeCsv(r.vendor),
      escapeCsv(r.description),
      r.amount, // numeric — never needs escaping
      escapeCsv(r.category),
      r.flow,
      r.recurring,
    ].join(','));
  }
  return '﻿' + lines.join('\n');
}

export function buildDataJson(bills, categories, trackedKeywords, schemaVersion, appVersion, now) {
  const payload = {
    schemaVersion,
    exportedAt: now.toISOString(),
    appVersion,
    bills: bills || [],
    categories: categories || [],
    trackedKeywords: trackedKeywords || [],
  };
  return JSON.stringify(payload, null, 2);
}
