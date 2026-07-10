// src/ReportsScreen.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportsScreen from './ReportsScreen.jsx';
import { DEFAULT_ACCOUNT_TYPES, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';

const accounts = [{ id: 'a1', name: 'Chase', type: 'bank', openingBalance: 1000 }];
const categories = [
  { id: 'inc', name: 'Salary', icon: '💰', color: '#0a0', flow: 'income' },
  { id: 'gro', name: 'Groceries', icon: '🛒', color: '#a00', flow: 'expense' },
];
const transactions = [
  { id: 'i1', accountId: 'a1', date: '2026-05-02', amount: 5000, categoryId: 'inc' },
  { id: 'g1', accountId: 'a1', date: '2026-05-03', amount: -600, categoryId: 'gro' },
];
const NOW = new Date(2026, 4, 20);

function renderScreen(extra = {}) {
  return render(
    <ReportsScreen accounts={accounts} transactions={transactions} categories={categories}
      types={DEFAULT_ACCOUNT_TYPES} typesById={DEFAULT_ACCOUNT_TYPES_BY_ID} now={NOW} onClose={() => {}} {...extra} />
  );
}

describe('ReportsScreen', () => {
  afterEach(() => cleanup());
  it('renders all five report sections', () => {
    renderScreen();
    expect(screen.getByText(/income vs expense|summary/i)).toBeTruthy();
    expect(screen.getByText(/spending by category/i)).toBeTruthy();
    expect(screen.getByText(/cash flow/i)).toBeTruthy();
    expect(screen.getByText(/net worth/i)).toBeTruthy();
    expect(screen.getByText(/recurring & subscriptions/i)).toBeTruthy();
  });
  it('Done calls onClose', async () => {
    const onClose = vi.fn();
    renderScreen({ onClose });
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });
  it('renders an Undo button in the header that calls onUndo', async () => {
    const onUndo = vi.fn();
    renderScreen({ onUndo, undoCount: 3 });
    const btn = screen.getByRole('button', { name: /undo/i });
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('↩ Undo (3)');
    await userEvent.click(btn);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
  it('Undo button is disabled when there is no history', () => {
    renderScreen({ undoCount: 0 });
    expect(screen.getByRole('button', { name: /undo/i }).disabled).toBe(true);
  });
  it('switching to This month re-scopes the summary (savings reflects May only)', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: /this month/i }));
    expect(screen.getByText('Savings')).toBeTruthy();
    expect(screen.getByText(/\$4,400/)).toBeTruthy(); // 5000 income − 600 spending
  });
  it('hides a duplicate whose signature has been dismissed', () => {
    const dupTxns = [
      { id: 'p1', accountId: 'a1', date: '2026-05-08', amount: -12.40, categoryId: 'gro', payeeId: 'p_om' },
      { id: 'p2', accountId: 'a1', date: '2026-05-08', amount: -12.40, categoryId: 'gro', payeeId: 'p_om' },
    ];
    const base = {
      accounts, categories, types: DEFAULT_ACCOUNT_TYPES, typesById: DEFAULT_ACCOUNT_TYPES_BY_ID,
      payeesById: new Map([['p_om', { id: 'p_om', name: 'OfficeMax' }]]),
      now: NOW, onClose: () => {},
    };
    const { rerender } = render(<ReportsScreen {...base} transactions={dupTxns} />);
    expect(screen.getByText('OfficeMax')).toBeTruthy();
    rerender(<ReportsScreen {...base} transactions={dupTxns} dismissedDuplicates={['p1|p2']} />);
    expect(screen.queryByText('OfficeMax')).toBeNull();
  });
});
