import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpendingChart from './SpendingChart.jsx';

afterEach(() => cleanup());
beforeEach(() => { localStorage.clear(); });

const billsWithSpend = [
  { id: 'b1', vendor: 'Chase', month: '2026-05', items: [
    { id: 'i1', description: 'X', amount: 50, categoryId: 'c_food', date: '2026-05-10' },
  ]},
];
const catsById = new Map([
  ['c_food', { id: 'c_food', flow: 'expense' }],
]);

describe('SpendingChart collapse/expand', () => {
  it('renders chart body by default (not collapsed)', () => {
    render(
      <SpendingChart
        bills={billsWithSpend}
        selectedMonth="2026-05"
        onSelectMonth={() => {}}
        categoriesById={catsById}
      />
    );
    expect(document.querySelector('.spending-bars')).toBeTruthy();
  });

  it('clicking collapse button hides the chart body and sets localStorage', async () => {
    render(
      <SpendingChart
        bills={billsWithSpend}
        selectedMonth="2026-05"
        onSelectMonth={() => {}}
        categoriesById={catsById}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /collapse/i }));
    expect(document.querySelector('.spending-bars')).toBeFalsy();
    expect(localStorage.getItem('billtracker-chart-collapsed')).toBe('true');
  });

  it('reads localStorage on mount and starts collapsed when "true"', () => {
    localStorage.setItem('billtracker-chart-collapsed', 'true');
    render(
      <SpendingChart
        bills={billsWithSpend}
        selectedMonth="2026-05"
        onSelectMonth={() => {}}
        categoriesById={catsById}
      />
    );
    expect(document.querySelector('.spending-bars')).toBeFalsy();
  });
});

describe('SpendingChart — flow toggle', () => {
  const bills = [
    { id: 'b1', vendor: 'Acme', month: '2026-05', items: [
      { id: 'i1', description: 'Pay',   amount: 5000, categoryId: 'c_pay',  date: '2026-05-15' },
      { id: 'i2', description: 'Food',  amount:  100, categoryId: 'c_food', date: '2026-05-02' },
      { id: 'i3', description: '401k',  amount:  260, categoryId: 'c_401k', date: '2026-05-15' },
    ]},
  ];
  const cats = [
    { id: 'c_food', name: 'Groceries', flow: 'expense' },
    { id: 'c_pay',  name: 'Paycheck',  flow: 'income'  },
    { id: 'c_401k', name: '401(k)',    flow: 'savings' },
  ];
  const catsById = new Map(cats.map(c => [c.id, c]));

  it('renders four flow chips', () => {
    render(<SpendingChart bills={bills} selectedMonth="2026-05" onSelectMonth={() => {}} categoriesById={catsById} />);
    expect(screen.getByRole('button', { name: 'Spent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Income' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Net' })).toBeTruthy();
  });

  it('hides vendor legend when flow is not Spent', () => {
    const { container } = render(
      <SpendingChart bills={bills} selectedMonth="2026-05" onSelectMonth={() => {}} categoriesById={catsById} />
    );
    expect(container.querySelector('.spending-legend')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Income' }));
    expect(container.querySelector('.spending-legend')).toBeFalsy();
  });

  it('hides per-vendor chips when flow is not Spent', () => {
    const { container } = render(
      <SpendingChart bills={bills} selectedMonth="2026-05" onSelectMonth={() => {}} categoriesById={catsById} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    const vendorChips = container.querySelectorAll('.spending-chip:not(.flow-chip)');
    expect(vendorChips.length).toBe(0);
  });

  it('clicking a bar when flow !== spent is a no-op (no drill)', () => {
    const onSelectMonth = vi.fn();
    const { container } = render(
      <SpendingChart bills={bills} selectedMonth="2026-05" onSelectMonth={onSelectMonth} categoriesById={catsById} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Net' }));
    const bars = container.querySelectorAll('.spending-bar');
    if (bars.length > 0) fireEvent.click(bars[0]);
    expect(onSelectMonth).not.toHaveBeenCalled();
  });
});
