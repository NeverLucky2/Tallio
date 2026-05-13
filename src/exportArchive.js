import { getItemDate } from './spendingMath.js';
import { zipSync } from 'fflate';

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

export function buildArchive({ bills, categories, trackedKeywords, schemaVersion, appVersion, now }) {
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));
  const jsonString = buildDataJson(bills, categories, trackedKeywords, schemaVersion, appVersion, now);
  const csvString  = buildItemsCsv(bills, categoriesById);
  const encoder = new TextEncoder();
  // In jsdom/vitest, TextEncoder-created Uint8Arrays have serialization issues.
  // Reconstruct from array to work around the issue.
  const jsonBytes = new Uint8Array(Array.from(encoder.encode(jsonString)));
  // csvString includes a BOM character (U+FEFF). When encoded to UTF-8, this becomes
  // the UTF-8 BOM (EF BB BF), which is stripped by TextDecoder. To preserve the BOM
  // in the round-trip, we prepend it as three bytes before encoding the rest of the string.
  const csvWithoutBom = csvString.charCodeAt(0) === 0xFEFF ? csvString.slice(1) : csvString;
  const csvContentBytes = new Uint8Array(Array.from(encoder.encode(csvWithoutBom)));
  // Manually prepend the UTF-8 BOM bytes
  const csvBytes = new Uint8Array(3 + csvContentBytes.length);
  csvBytes[0] = 0xEF;
  csvBytes[1] = 0xBB;
  csvBytes[2] = 0xBF;
  csvBytes.set(csvContentBytes, 3);
  return zipSync({
    'data.json': jsonBytes,
    'items.csv': csvBytes,
  });
}
