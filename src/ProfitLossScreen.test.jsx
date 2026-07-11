// src/ProfitLossScreen.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_ACCOUNT_TYPES, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';
import ProfitLossScreen from './ProfitLossScreen.jsx';

vi.mock('./fileStore.js', () => ({ downloadTextFile: vi.fn() }));
import { downloadTextFile } from './fileStore.js';

const accounts = [{ id: 'a1', name: 'Biz', type: 'bank', openingBalance: 0 }];
const categories = [
  { id: 'sal', name: 'Sales', icon: '💰', color: '#0a0', flow: 'income' },
  { id: 'rent', name: 'Rent', icon: '🏠', color: '#a00', flow: 'expense' },
];
const transactions = [
  { id: 'i1', accountId: 'a1', date: '2026-01-10', amount: 3000, categoryId: 'sal' },
  { id: 'i2', accountId: 'a1', date: '2026-02-10', amount: 2000, categoryId: 'sal' },
  { id: 'e1', accountId: 'a1', date: '2026-01-01', amount: -1000, categoryId: 'rent' },
];
const NOW = new Date(2026, 1, 20); // Feb 2026

function renderScreen(extra = {}) {
  return render(
    <ProfitLossScreen accounts={accounts} transactions={transactions} categories={categories}
      types={DEFAULT_ACCOUNT_TYPES} typesById={DEFAULT_ACCOUNT_TYPES_BY_ID} now={NOW} onClose={() => {}} {...extra} />
  );
}

describe('ProfitLossScreen', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders the statement with a net profit row', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: /profit & loss/i })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Sales' })).toBeTruthy();
    const net = screen.getByRole('row', { name: /net profit/i });
    expect(within(net).getByText('$4,000.00')).toBeTruthy(); // 5000 income − 1000 rent
  });

  it('switching granularity to Year collapses to a single column', async () => {
    renderScreen();
    // Use a single-year period so monthly labels are clean (no year suffix).
    await userEvent.click(screen.getByRole('button', { name: /this year/i }));
    expect(screen.getByRole('columnheader', { name: 'Jan' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Year' }));
    expect(screen.queryByRole('columnheader', { name: 'Jan' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: '2026' })).toBeTruthy();
  });

  it('Export CSV triggers a download of the statement', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));
    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [text, filename] = downloadTextFile.mock.calls[0];
    expect(text).toContain('NET PROFIT');
    expect(filename).toMatch(/\.csv$/);
  });

  it('Print calls window.print', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: /print/i }));
    expect(print).toHaveBeenCalled();
  });

  it('Done calls onClose', async () => {
    const onClose = vi.fn();
    renderScreen({ onClose });
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
