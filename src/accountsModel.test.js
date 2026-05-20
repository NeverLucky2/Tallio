// src/accountsModel.test.js
import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_TYPES, GROUP_ORDER, accountClass, layoutFor, groupFor,
  isOnBalanceSheet, flowSign,
} from './accountsModel.js';

describe('account types & classification', () => {
  it('exposes the 7 Phase-1 types', () => {
    expect(Object.keys(ACCOUNT_TYPES).sort()).toEqual(
      ['bank', 'credit_card', 'investment', 'loan', 'mortgage', 'person', 'untyped'].sort()
    );
  });

  it('classifies asset / liability / off-sheet', () => {
    expect(accountClass('bank')).toBe('asset');
    expect(accountClass('investment')).toBe('asset');
    expect(accountClass('credit_card')).toBe('liability');
    expect(accountClass('mortgage')).toBe('liability');
    expect(accountClass('person')).toBe('offsheet');
    expect(accountClass('untyped')).toBe('offsheet');
    expect(accountClass('nonsense')).toBe('offsheet'); // safe fallback
  });

  it('only bank uses the bank register layout', () => {
    expect(layoutFor('bank')).toBe('bank');
    expect(layoutFor('credit_card')).toBe('compact');
    expect(layoutFor('untyped')).toBe('compact');
  });

  it('isOnBalanceSheet is true for assets and liabilities only', () => {
    expect(isOnBalanceSheet('bank')).toBe(true);
    expect(isOnBalanceSheet('mortgage')).toBe(true);
    expect(isOnBalanceSheet('person')).toBe(false);
    expect(isOnBalanceSheet('untyped')).toBe(false);
  });

  it('groupFor maps to a header in GROUP_ORDER', () => {
    expect(GROUP_ORDER).toContain(groupFor('bank'));
    expect(groupFor('loan')).toBe('Credit cards & loans');
  });

  it('flowSign: income positive, everything else negative', () => {
    expect(flowSign('income')).toBe(1);
    expect(flowSign('expense')).toBe(-1);
    expect(flowSign('savings')).toBe(-1);
    expect(flowSign(undefined)).toBe(-1);
  });
});
