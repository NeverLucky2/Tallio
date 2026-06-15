// src/exportArchive.test.js
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildArchive, buildDataJson, buildTransactionsCsv, parseArchive } from './exportArchive.js';

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
    const lines = csv.replace(/^\uFEFF/, '').split('\n');
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

  it('includes reportAcks in data.json when provided', () => {
    const reportAcks = { subscriptions: { NETFLIX: { status: 'ongoing' } }, dismissedDuplicates: ['d1|d2'] };
    const bytes = buildArchive({ accounts, transactions, categories, reportAcks, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12T00:00:00Z') });
    const data = JSON.parse(strFromU8(unzipSync(bytes)['data.json']));
    expect(data.reportAcks.subscriptions.NETFLIX.status).toBe('ongoing');
    expect(data.reportAcks.dismissedDuplicates).toEqual(['d1|d2']);
  });
});

describe('export with appearance + images', () => {
  const u8 = (s) => new TextEncoder().encode(s);

  it('omits appearance/images keys when not provided (back-compat)', () => {
    const bytes = buildArchive({ accounts, transactions, categories, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12') });
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual(['data.json', 'transactions.csv']);
  });

  it('bundles appearance.json when provided', () => {
    const appearance = { themeId: 'forest', background: { base: 'solid' } };
    const bytes = buildArchive({ accounts, transactions, categories, appearance, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12') });
    const files = unzipSync(bytes);
    expect(JSON.parse(strFromU8(files['appearance.json'])).themeId).toBe('forest');
  });

  it('bundles image bytes + an index and round-trips via parseArchive', () => {
    const images = [
      { id: 'a', name: 'Beach', group: 'Scenery', type: 'image/jpeg', w: 10, h: 10, palette: ['#111'], createdAt: 1, bytes: u8('IMGA'), thumbBytes: u8('THA') },
      { id: 'b', name: 'Dog', group: 'Pets', type: 'image/jpeg', w: 8, h: 8, palette: ['#222'], createdAt: 2, bytes: u8('IMGB') },
    ];
    const appearance = { themeId: 'nocturne' };
    const bytes = buildArchive({ accounts, transactions, categories, images, appearance, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12') });

    const parsed = parseArchive(bytes);
    expect(parsed.data.schemaVersion).toBe(4);
    expect(parsed.appearance.themeId).toBe('nocturne');
    expect(parsed.images.map(i => i.id).sort()).toEqual(['a', 'b']);
    const a = parsed.images.find(i => i.id === 'a');
    expect(strFromU8(a.bytes)).toBe('IMGA');
    expect(strFromU8(a.thumbBytes)).toBe('THA');
    const b = parsed.images.find(i => i.id === 'b');
    expect(b.thumbBytes).toBeNull();
  });

  it('parseArchive returns empty images for an archive without them', () => {
    const bytes = buildArchive({ accounts, transactions, categories, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12') });
    const parsed = parseArchive(bytes);
    expect(parsed.images).toEqual([]);
    expect(parsed.appearance).toBeNull();
  });
});

describe('export with split transactions', () => {
  it('preserves splits[] verbatim in the data.json payload', () => {
    const txns = [{
      id: 't1', accountId: 'a_chk', date: '2026-05-20', amount: -180,
      categoryId: null, description: 'Costco', payee: 'Costco', checkNumber: null, transferId: null,
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_shop', description: 'Groceries' },
        { id: 's2', amount:  -80, categoryId: 'c_shop', description: 'Soap' },
      ],
    }];
    const bytes = buildArchive({ accounts, transactions: txns, categories: [], schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-21') });
    const files = unzipSync(bytes);
    const data = JSON.parse(strFromU8(files['data.json']));
    expect(data.transactions[0].splits).toEqual(txns[0].splits);
  });
});

describe('templates in the archive', () => {
  it('round-trips templates through the archive and tolerates their absence', () => {
    const templates = [{ id: 'tpl1', name: 'Paycheck', kind: 'transaction', payload: { description: 'Pay', amount: 2500 }, createdAt: '2026-06-15T00:00:00.000Z' }];

    // data.json carries templates and the bumped schema version.
    const json = buildDataJson([], [], [], [], 5, '0.0.0', new Date('2026-06-15'), null, templates);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(5);
    expect(parsed.templates).toEqual(templates);

    // Full zip round-trip: buildArchive → parseArchive surfaces templates on .data.
    const bytes = buildArchive({ accounts: [], transactions: [], categories: [], accountTypes: [], schemaVersion: 5, appVersion: '0.0.0', now: new Date('2026-06-15'), templates });
    expect(parseArchive(bytes).data.templates).toEqual(templates);

    // Legacy archive without templates → field defaults to [].
    const legacy = JSON.parse(buildDataJson([], [], [], [], 4, '0.0.0', new Date('2026-06-15')));
    expect(legacy.templates ?? []).toEqual([]);
  });
});
