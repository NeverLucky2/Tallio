// src/exportArchive.js
import { zipSync } from 'fflate';
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

export function buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now) {
  return JSON.stringify({
    schemaVersion,
    exportedAt: now.toISOString(),
    appVersion,
    accounts: accounts || [],
    transactions: transactions || [],
    categories: categories || [],
    accountTypes: accountTypes || [],
  }, null, 2);
}

export function buildArchive({ accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now }) {
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));
  const jsonString = buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now);
  const csvString = buildTransactionsCsv(accounts, transactions, categoriesById);
  const encoder = new TextEncoder();
  const jsonBytes = new Uint8Array(Array.from(encoder.encode(jsonString)));
  const csvWithoutBom = csvString.charCodeAt(0) === 0xFEFF ? csvString.slice(1) : csvString;
  const csvContentBytes = new Uint8Array(Array.from(encoder.encode(csvWithoutBom)));
  const csvBytes = new Uint8Array(3 + csvContentBytes.length);
  csvBytes[0] = 0xEF; csvBytes[1] = 0xBB; csvBytes[2] = 0xBF;
  csvBytes.set(csvContentBytes, 3);
  return zipSync({ 'data.json': jsonBytes, 'transactions.csv': csvBytes });
}
