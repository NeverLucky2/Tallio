// src/exportArchive.test.js
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildArchive, buildTransactionsCsv } from './exportArchive.js';

const categories = [
  { id: 'c_shop', name: 'Shopping', flow: 'expense' },
  { id: 'c_pay',  name: 'Paycheck', flow: 'income' },
];
const accounts = [
  { id: 'a_cc',  name: 'Mastercard', type: 'credit_card', icon: '💳', openingBalance: 0 },
  { id: 'a_chk', name: 'Chase',      type: 'bank',        icon: '🏦', openingBalance: 1000 },
];
const transactions = [
  { id: 't1', accountId: 'a_cc',  date: '2026-05-05', amount: -96.20, categoryId: 'c_shop', description: 'Walmart', payee: null, checkNumber: null, transferId: null },
  { id: 't2', accountId: 'a_chk', date: '2026-05-01', amount: 3200,   categoryId: 'c_pay',  description: 'Salary',  payee: 'Acme', checkNumber: null, transferId: null },
];

describe('export v4', () => {
  it('archive holds data.json (schema 4, accounts+transactions) + transactions.csv', () => {
    const bytes = buildArchive({ accounts, transactions, categories, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12T00:00:00Z') });
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(['data.json', 'transactions.csv']);
    const data = JSON.parse(strFromU8(files['data.json']));
    expect(data.schemaVersion).toBe(4);
    expect(data.accounts).toHaveLength(2);
    expect(data.transactions).toHaveLength(2);
  });

  it('CSV header and an account-name column', () => {
    const csv = buildTransactionsCsv(accounts, transactions, new Map(categories.map(c => [c.id, c])));
    expect(csv.split('\n')[0]).toContain('date,account,description,amount,category');
    expect(csv).toContain('Mastercard');
  });
});
