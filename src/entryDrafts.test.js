import { describe, it, expect } from 'vitest';
import {
  makeTransactionDraft, draftFromTransaction, instantiateTransaction,
  makeTransferDraft, draftFromTransfer, instantiateTransfer, labelFor,
} from './entryDrafts.js';

const bank = { id: 'a_bank', type: 'bank' };
const wallet = { id: 'a_wallet', type: 'untyped' };
const typesById = new Map([
  ['bank', { layout: 'bank' }],
  ['untyped', { layout: 'compact' }],
]);

describe('transaction drafts', () => {
  it('round-trips category, amount, description, payee through draft + instantiate', () => {
    const txn = { id: 't1', accountId: 'a_bank', date: '2026-01-01', amount: -42.5,
      categoryId: 'c_food', subId: null, description: 'Lunch', payee: 'Cafe', checkNumber: '101' };
    const draft = draftFromTransaction(txn);
    const out = instantiateTransaction(draft, { account: bank, typesById, date: '2026-06-15' });
    expect(out).toMatchObject({
      accountId: 'a_bank', date: '2026-06-15', amount: -42.5,
      categoryId: 'c_food', description: 'Lunch', payee: 'Cafe', checkNumber: '101', splits: null,
    });
    expect(out.id).toBeUndefined();
  });

  it('drops payee/check when target account is not a bank layout', () => {
    const draft = makeTransactionDraft({ description: 'x', amount: -5, categoryId: 'c', payee: 'P', checkNumber: '9' });
    const out = instantiateTransaction(draft, { account: wallet, typesById, date: '2026-06-15' });
    expect(out.payee).toBeNull();
    expect(out.checkNumber).toBeNull();
  });

  it('regenerates split-line ids and preserves the sum', () => {
    const txn = { accountId: 'a_bank', amount: -180, description: 'Costco',
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Food' },
        { id: 's2', amount: -80,  categoryId: 'c_house',   description: 'Soap' },
      ] };
    const draft = draftFromTransaction(txn);
    const out = instantiateTransaction(draft, { account: bank, typesById, date: '2026-06-15' });
    expect(out.splits).toHaveLength(2);
    expect(out.splits.map(s => s.id)).not.toContain('s1');
    expect(out.splits.reduce((a, s) => a + s.amount, 0)).toBe(-180);
    expect(out.amount).toBe(-180);
  });

  it('rebuilds splitTargets for a transfer-type split line and falls back to a category when target is lost', () => {
    const draft = makeTransactionDraft(
      { description: 'mix', amount: -50,
        splits: [
          { id: 's1', amount: -30, transferId: 'tr_s1', description: 'to savings' },
          { id: 's2', amount: -20, categoryId: 'c_food', description: 'food' },
        ] },
      new Map([['s1', 'a_savings']]), // s1 targets a_savings
    );
    const kept = instantiateTransaction(draft, { account: bank, typesById, date: 'd', fallbackCategoryId: 'c_misc' });
    const transferLine = kept.splits.find(s => s.transferId);
    expect(transferLine).toBeTruthy();
    expect(kept.splitTargets.get(transferLine.id)).toBe('a_savings');

    // Same draft, but the target is lost (not captured on draft creation):
    const draftNoTarget = makeTransactionDraft(
      { description: 'mix', amount: -50,
        splits: [{ id: 's1', amount: -30, transferId: 'tr_s1' }, { id: 's2', amount: -20, categoryId: 'c_food' }] },
      new Map(), // target lost
    );
    const fell = instantiateTransaction(draftNoTarget, { account: bank, typesById, date: 'd', fallbackCategoryId: 'c_misc' });
    expect(fell.splits.every(s => s.categoryId)).toBe(true); // both are category lines now
    expect(fell.splits.some(s => s.transferId)).toBe(false);
  });
});

describe('transfer drafts', () => {
  it('round-trips from/to/amount/category/description', () => {
    const pair = {
      transferId: 'x',
      fromLeg: { accountId: 'a_bank', amount: -200, categoryId: 'c_xfer', description: 'move' },
      toLeg:   { accountId: 'a_savings', amount: 200 },
    };
    const draft = draftFromTransfer(pair);
    const out = instantiateTransfer(draft, { date: '2026-06-15' });
    expect(out).toMatchObject({ fromId: 'a_bank', toId: 'a_savings', amount: 200, date: '2026-06-15', categoryId: 'c_xfer', description: 'move' });
  });
});

describe('labelFor', () => {
  it('prefers payee, then description, with type fallbacks', () => {
    expect(labelFor(makeTransactionDraft({ payee: 'Mom', description: 'Zelle', amount: 50 }))).toBe('Mom');
    expect(labelFor(makeTransactionDraft({ description: 'Zelle', amount: 50 }))).toBe('Zelle');
    expect(labelFor(makeTransactionDraft({ amount: 50 }))).toBe('Transaction');
    expect(labelFor(makeTransferDraft({ fromId: 'a', toId: 'b', amount: 5, description: 'rent' }))).toBe('rent');
    expect(labelFor(makeTransferDraft({ fromId: 'a', toId: 'b', amount: 5 }))).toBe('Transfer');
  });
});
