// src/exportArchive.js
import { zipSync, unzipSync, strFromU8 } from 'fflate';
import { transferCounterpart } from './accountsModel.js';

const CSV_HEADER = 'date,account,description,amount,category,flow,payee,check,transfer';

function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildTransactionsCsv(accounts, transactions, categoriesById) {
  const acctById = new Map((accounts || []).map(a => [a.id, a]));
  const rows = (transactions || [])
    .filter(t => t && Number.isFinite(t.amount))
    .map(t => {
      const acct = acctById.get(t.accountId);
      const partner = transferCounterpart(t, transactions);
      const partnerAcct = partner && acctById.get(partner.accountId);
      const isTransfer = !!partnerAcct;
      const cat = categoriesById && categoriesById.get(t.categoryId);
      return {
        date: t.date || '',
        account: acct ? acct.name : '',
        description: t.description || '',
        amount: t.amount.toFixed(2),
        category: isTransfer ? '' : (cat ? cat.name : 'Uncategorized'),
        flow: isTransfer ? '' : ((cat && cat.flow) || 'expense'),
        payee: t.payee || '',
        check: t.checkNumber || '',
        transfer: isTransfer ? partnerAcct.name : '',
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const lines = [CSV_HEADER];
  for (const r of rows) {
    lines.push([
      escapeCsv(r.date), escapeCsv(r.account), escapeCsv(r.description),
      r.amount, escapeCsv(r.category), r.flow, escapeCsv(r.payee), escapeCsv(r.check), escapeCsv(r.transfer),
    ].join(','));
  }
  return '﻿' + lines.join('\n');
}

export function buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks = null) {
  return JSON.stringify({
    schemaVersion,
    exportedAt: now.toISOString(),
    appVersion,
    accounts: accounts || [],
    transactions: transactions || [],
    categories: categories || [],
    accountTypes: accountTypes || [],
    reportAcks: reportAcks || { subscriptions: {}, dismissedDuplicates: [] },
  }, null, 2);
}

export function buildArchive({ accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks, images, appearance }) {
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));
  const jsonString = buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks);
  const csvString = buildTransactionsCsv(accounts, transactions, categoriesById);
  const encoder = new TextEncoder();
  const jsonBytes = new Uint8Array(Array.from(encoder.encode(jsonString)));
  const csvWithoutBom = csvString.charCodeAt(0) === 0xFEFF ? csvString.slice(1) : csvString;
  const csvContentBytes = new Uint8Array(Array.from(encoder.encode(csvWithoutBom)));
  const csvBytes = new Uint8Array(3 + csvContentBytes.length);
  csvBytes[0] = 0xEF; csvBytes[1] = 0xBB; csvBytes[2] = 0xBF;
  csvBytes.set(csvContentBytes, 3);

  const files = { 'data.json': jsonBytes, 'transactions.csv': csvBytes };

  if (appearance) {
    files['appearance.json'] = new Uint8Array(Array.from(encoder.encode(JSON.stringify(appearance, null, 2))));
  }
  if (images && images.length) {
    const index = images.map(({ bytes, thumbBytes, ...meta }) => meta); // eslint-disable-line no-unused-vars
    files['images/index.json'] = new Uint8Array(Array.from(encoder.encode(JSON.stringify(index, null, 2))));
    // Normalize to a local-realm Uint8Array — bytes may arrive from another realm
    // (e.g. jsdom TextEncoder / a foreign ArrayBuffer), which fflate would skip.
    for (const img of images) {
      if (img.bytes) files[`images/${img.id}`] = new Uint8Array(img.bytes);
      if (img.thumbBytes) files[`images/${img.id}.thumb`] = new Uint8Array(img.thumbBytes);
    }
  }

  return zipSync(files);
}

// Reads an archive back into its parts. Image bytes are returned alongside their
// metadata; appearance + data are parsed JSON (null when absent). The inverse of
// buildArchive — used by import/restore.
export function parseArchive(bytes) {
  const files = unzipSync(bytes);
  const data = files['data.json'] ? JSON.parse(strFromU8(files['data.json'])) : null;
  const appearance = files['appearance.json'] ? JSON.parse(strFromU8(files['appearance.json'])) : null;
  let images = [];
  if (files['images/index.json']) {
    const index = JSON.parse(strFromU8(files['images/index.json']));
    images = index.map(meta => ({
      ...meta,
      bytes: files[`images/${meta.id}`] || null,
      thumbBytes: files[`images/${meta.id}.thumb`] || null,
    }));
  }
  return { data, appearance, images };
}
