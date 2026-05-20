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

  it('includes accountTypes in data.json when provided', () => {
    const accountTypes = [{ id: 'hsa', label: 'HSA', klass: 'asset', layout: 'compact', group: 'Health', icon: '🏥', builtin: false }];
    const bytes = buildArchive({ accounts, transactions, categories, accountTypes, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12T00:00:00Z') });
    const data = JSON.parse(strFromU8(unzipSync(bytes)['data.json']));
    expect(data.accountTypes).toHaveLength(1);
    expect(data.accountTypes[0].id).toBe('hsa');
  });

  it('CSV adds a transfer column; transfer legs have blank category/flow and the counterpart name', () => {
    const accts = [
      { id: 'a_chk', name: 'Checking', type: 'bank', openingBalance: 0 },
      { id: 'a_sav', name: 'Savings',  type: 'bank', openingBalance: 0 },
    ];
    const txns = [
      { id: 'tf', accountId: 'a_chk', date: '2026-05-20', amount: -500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
      { id: 'tt', accountId: 'a_sav', date: '2026-05-20', amount:  500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
    ];
    const csv = buildTransactionsCsv(accts, txns, new Map());
    const lines = csv.replace(/^﻿/, '').split('\n');
    expect(lines[0]).toBe('date,account,description,amount,category,flow,payee,check,transfer');
    expect(lines.find(l => l.startsWith('2026-05-20,Checking'))).toBe('2026-05-20,Checking,,-500.00,,,,,Savings');
    expect(lines.find(l => l.startsWith('2026-05-20,Savings'))).toBe('2026-05-20,Savings,,500.00,,,,,Checking');
  });

  it('data.json preserves transferId on both legs', () => {
    const accts = [
      { id: 'a_chk', name: 'Checking', type: 'bank', openingBalance: 0 },
      { id: 'a_sav', name: 'Savings',  type: 'bank', openingBalance: 0 },
    ];
    const txns = [
      { id: 'tf', accountId: 'a_chk', date: '2026-05-20', amount: -500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
      { id: 'tt', accountId: 'a_sav', date: '2026-05-20', amount:  500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
    ];
    const bytes = buildArchive({ accounts: accts, transactions: txns, categories: [], schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-20T00:00:00Z') });
    const data = JSON.parse(strFromU8(unzipSync(bytes)['data.json']));
    expect(data.transactions.every(t => t.transferId === 'x')).toBe(true);
  });
});
