// src/Register.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Register from './Register.jsx';

const account = { id: 'a_cc', name: 'Mastercard', type: 'credit_card', icon: '💳', openingBalance: 0 };
const cat = { id: 'c_shop', name: 'Shopping', icon: '🛍️' };
const categoriesById = new Map([[cat.id, cat]]);
const transactions = [
  { id: 't1', accountId: 'a_cc', date: '2026-05-05', amount: -96.20, categoryId: 'c_shop', description: 'Walmart', payee: null, checkNumber: null, transferId: null },
  { id: 't2', accountId: 'a_cc', date: '2026-04-02', amount: -15.99, categoryId: 'c_shop', description: 'Netflix', payee: null, checkNumber: null, transferId: null },
];

describe('Register', () => {
  afterEach(() => cleanup());

  it('shows account header with "Owed" for liabilities and rows newest-first', () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    expect(screen.getByText('Mastercard')).toBeTruthy();
    expect(screen.getByText(/Owed/i)).toBeTruthy();
    const descCells = screen.getAllByText(/Walmart|Netflix/).map(n => n.textContent);
    expect(descCells[0]).toBe('Walmart'); // May before April
  });

  it('search filters the rows', async () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'netflix');
    expect(screen.queryByText('Walmart')).toBeNull();
    expect(screen.getByText('Netflix')).toBeTruthy();
  });

  it('add-transaction button fires callback', async () => {
    const onAdd = vi.fn();
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={onAdd} />);
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));
    expect(onAdd).toHaveBeenCalled();
  });
});
