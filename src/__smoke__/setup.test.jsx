import { describe, it, expect } from 'vitest';
import { initializeFromStorage } from '../initializeFromStorage.js';
import {
  aggregateByMonth,
  findRecurringCharges,
  getBillNet,
} from '../spendingMath.js';
import { unzipSync, strFromU8 } from 'fflate';
import { buildArchive } from '../exportArchive.js';

function makeFakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
  };
}

describe('end-to-end: migration + flow-aware math', () => {
  it('v2 → v3 chain: storage gets migrated, schema bumps to 3, seeds present', () => {
    const v2Cats = [
      { id: 'c_food',  name: 'Groceries', icon: '🛒', color: '#10B981', keywords: [], templates: [], builtin: true },
      { id: 'c_other', name: 'Other',     icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true },
    ];
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([]),
      'billtracker-categories':      JSON.stringify(v2Cats),
      'billtracker-schema-version':  '2',
    });
    const { migrationError } = initializeFromStorage(storage);
    expect(migrationError).toBeNull();
    expect(storage.getItem('billtracker-schema-version')).toBe('3');

    const cats = JSON.parse(storage.getItem('billtracker-categories'));
    for (const c of cats) expect(c.flow).toBeTruthy();
    expect(cats.some(c => c.name === 'Paycheck' && c.flow === 'income')).toBe(true);
    expect(cats.some(c => c.name === '401(k)'   && c.flow === 'savings')).toBe(true);
  });

  it('paycheck bill nets to deposit amount; aggregateByMonth splits buckets correctly', () => {
    const cats = [
      { id: 'c_pay',  name: 'Paycheck', flow: 'income'  },
      { id: 'c_tax',  name: 'Taxes',    flow: 'expense' },
      { id: 'c_401k', name: '401(k)',   flow: 'savings' },
      { id: 'c_food', name: 'Groceries', flow: 'expense' },
    ];
    const catsById = new Map(cats.map(c => [c.id, c]));

    const paycheckBill = {
      id: 'b1', vendor: 'Acme', month: '2026-05',
      items: [
        { id: 'i1', description: 'Gross',       amount: 5200, categoryId: 'c_pay',  date: '2026-05-15' },
        { id: 'i2', description: 'Federal tax', amount:  687, categoryId: 'c_tax',  date: '2026-05-15' },
        { id: 'i3', description: '401(k)',      amount:  260, categoryId: 'c_401k', date: '2026-05-15' },
      ],
    };
    const ccBill = {
      id: 'b2', vendor: 'Chase', month: '2026-05',
      items: [
        { id: 'i4', description: 'Whole Foods',        amount:  84, categoryId: 'c_food', date: '2026-05-02' },
        { id: 'i5', description: 'Whole Foods refund', amount: -40, categoryId: 'c_food', date: '2026-05-12' },
      ],
    };

    expect(getBillNet(paycheckBill, catsById).net).toBe(4253);
    expect(getBillNet(ccBill,       catsById).net).toBe(-44);

    const out = aggregateByMonth([paycheckBill, ccBill], '2026-05', catsById);
    const may = out.find(b => b.month === '2026-05');
    expect(may.income).toBe(5200);
    expect(may.spent).toBe(731);
    expect(may.saved).toBe(260);
  });

  it('bi-weekly paycheck across 3 months surfaces in findRecurringCharges with flow=income', () => {
    const cats = [
      { id: 'c_pay', name: 'Paycheck', flow: 'income' },
    ];
    const catsById = new Map(cats.map(c => [c.id, c]));
    const paycheckItem = (idPrefix, date) => ({
      id: `${idPrefix}-g`, description: 'Bi-weekly paycheck',
      amount: 2600, categoryId: 'c_pay', date,
    });
    const bills = [
      { id: 'b1', vendor: 'Acme', month: '2026-03', items: [paycheckItem('b1', '2026-03-15')] },
      { id: 'b2', vendor: 'Acme', month: '2026-04', items: [paycheckItem('b2', '2026-04-15')] },
      { id: 'b3', vendor: 'Acme', month: '2026-05', items: [paycheckItem('b3', '2026-05-15')] },
    ];
    const results = findRecurringCharges(bills, '2026-05', catsById);
    const paycheck = results.find(r => r.description === 'Bi-weekly paycheck');
    expect(paycheck).toBeDefined();
    expect(paycheck.flow).toBe('income');
    expect(paycheck.active).toBe(true);
  });

  it('catch-up materializes missed months when an active chain has lapsed', () => {
    const cats = [
      { id: 'c_auto', name: 'Auto Loan', icon: '🚗', color: '#F59E0B', flow: 'expense', keywords: [], templates: [], builtin: true },
      { id: 'c_other', name: 'Other',    icon: '📋', color: '#6B7280', flow: 'expense', keywords: [], templates: [], builtin: true },
    ];
    const aprBill = {
      id: 'b_apr', vendor: 'Honda Finance', month: '2026-04',
      recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'it_apr', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-04-15' }],
    };
    const comed = {
      id: 'b_comed', vendor: 'ComEd', month: '2026-06',
      items: [{ id: 'it_comed', description: 'Electric', amount: 87.20, categoryId: 'c_other', date: '2026-06-08' }],
    };
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([aprBill, comed]),
      'billtracker-categories':      JSON.stringify(cats),
      'billtracker-schema-version':  '3',
    });
    const out = initializeFromStorage(storage, '2026-07');
    expect(out.migrationError).toBeNull();
    expect(out.conflicts).toEqual([]);

    const billsAfter = JSON.parse(storage.getItem('billtracker-bills'));
    const hondaMonths = billsAfter.filter(b => b.recurringChainId === 'rec_h').map(b => b.month).sort();
    expect(hondaMonths).toEqual(['2026-04', '2026-05', '2026-06', '2026-07']);
    // ComEd untouched.
    expect(billsAfter.find(b => b.id === 'b_comed').vendor).toBe('ComEd');
    // Each spawned Honda bill has recurring=true and the same chain id.
    for (const b of billsAfter.filter(b => b.recurringChainId === 'rec_h')) {
      expect(b.recurring).toBe(true);
      expect(b.recurringChainId).toBe('rec_h');
    }
  });

  it('catch-up surfaces conflicts: same-vendor non-chain May bill blocks the Honda chain spawn', () => {
    const cats = [
      { id: 'c_auto', name: 'Auto Loan', icon: '🚗', color: '#F59E0B', flow: 'expense', keywords: [], templates: [], builtin: true },
    ];
    const aprBill = {
      id: 'b_apr', vendor: 'Honda Finance', month: '2026-04',
      recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'it1', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-04-15' }],
    };
    const manualMay = {
      id: 'b_may_manual', vendor: 'Honda Finance', month: '2026-05',
      items: [{ id: 'it2', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-05-15' }],
    };
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([aprBill, manualMay]),
      'billtracker-categories':      JSON.stringify(cats),
      'billtracker-schema-version':  '3',
    });
    const out = initializeFromStorage(storage, '2026-05');
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0].targetMonth).toBe('2026-05');
    expect(out.conflicts[0].chainId).toBe('rec_h');
    // No spawn occurred — only the original two bills.
    expect(out.bills).toHaveLength(2);
  });
});

describe('end-to-end: reports + export', () => {
  const cats = [
    { id: 'c_food', name: 'Groceries', flow: 'expense' },
    { id: 'c_pay',  name: 'Paycheck',  flow: 'income'  },
  ];

  it('export archive contains data.json + items.csv with expected shapes', () => {
    const bills = [
      { id: 'b1', vendor: 'Acme', month: '2026-05', items: [
        { id: 'i1', description: 'Gross pay', amount: 5200, categoryId: 'c_pay', date: '2026-05-15' },
      ]},
      { id: 'b2', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i2', description: 'Whole Foods', amount: 84, categoryId: 'c_food', date: '2026-05-02' },
      ]},
    ];
    const bytes = buildArchive({
      bills, categories: cats, trackedKeywords: ['CHURCH'],
      schemaVersion: 3, appVersion: '1.0.0', now: new Date('2026-05-12T12:00:00Z'),
    });
    const unzipped = unzipSync(bytes);
    expect(Object.keys(unzipped).sort()).toEqual(['data.json', 'items.csv']);
    const data = JSON.parse(strFromU8(unzipped['data.json']));
    expect(data.schemaVersion).toBe(3);
    expect(data.bills.length).toBe(2);
    expect(data.trackedKeywords).toEqual(['CHURCH']);
    const csvBytes = unzipped['items.csv'];
    // BOM check: assert raw bytes (strFromU8 strips the BOM during decode)
    expect(csvBytes[0]).toBe(0xEF);
    expect(csvBytes[1]).toBe(0xBB);
    expect(csvBytes[2]).toBe(0xBF);
    const csv = strFromU8(csvBytes);
    expect(csv.split('\n')[0]).toBe('date,vendor,description,amount,category,flow,recurring');
    expect(csv).toContain('Gross pay,5200.00,Paycheck,income,no');
  });
});
