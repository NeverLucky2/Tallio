import { describe, it, expect } from 'vitest';
import { groupCategoriesByFlow } from './categoriesView.js';

describe('groupCategoriesByFlow', () => {
  const cats = [
    { id: 'e1', name: 'Groceries',          flow: 'expense' },
    { id: 'i1', name: 'Paycheck',           flow: 'income' },
    { id: 'e2', name: 'Dining',             flow: 'expense' },
    { id: 't1', name: 'Internal Transfer',  flow: 'transfer' },
    { id: 's1', name: 'Roth IRA',           flow: 'savings' },
    { id: 'i2', name: 'Dividends',          flow: 'income' },
    { id: 't2', name: 'Credit Card Payment', flow: 'transfer' },
  ];

  it('orders groups income, expense, savings, transfer with capitalized labels', () => {
    const groups = groupCategoriesByFlow(cats);
    expect(groups.map(g => g.flow)).toEqual(['income', 'expense', 'savings', 'transfer']);
    expect(groups.map(g => g.label)).toEqual(['Income', 'Expense', 'Savings', 'Transfer']);
  });

  it('sorts categories alphabetically within each group', () => {
    const groups = groupCategoriesByFlow(cats);
    const byFlow = Object.fromEntries(groups.map(g => [g.flow, g.items.map(c => c.name)]));
    expect(byFlow.income).toEqual(['Dividends', 'Paycheck']);
    expect(byFlow.expense).toEqual(['Dining', 'Groceries']);
    expect(byFlow.transfer).toEqual(['Credit Card Payment', 'Internal Transfer']);
  });

  it('skips empty groups', () => {
    const groups = groupCategoriesByFlow([{ id: 'e1', name: 'Groceries', flow: 'expense' }]);
    expect(groups.map(g => g.flow)).toEqual(['expense']);
  });

  it('treats a missing flow as expense', () => {
    const groups = groupCategoriesByFlow([{ id: 'x', name: 'Mystery' }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].flow).toBe('expense');
    expect(groups[0].items[0].name).toBe('Mystery');
  });

  it('sorts case-insensitively', () => {
    const groups = groupCategoriesByFlow([
      { id: 'a', name: 'banana', flow: 'expense' },
      { id: 'b', name: 'Apple',  flow: 'expense' },
    ]);
    expect(groups[0].items.map(c => c.name)).toEqual(['Apple', 'banana']);
  });

  it('returns an empty array for empty or non-array input', () => {
    expect(groupCategoriesByFlow([])).toEqual([]);
    expect(groupCategoriesByFlow(null)).toEqual([]);
    expect(groupCategoriesByFlow(undefined)).toEqual([]);
  });
});
