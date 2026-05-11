import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
