// src/AccountList.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountList from './AccountList.jsx';

const accounts = [
  { id: 'a_chk', name: 'Chase Checking', type: 'bank', icon: '🏦', openingBalance: 1000 },
  { id: 'a_cc',  name: 'Mastercard',     type: 'credit_card', icon: '💳', openingBalance: 0 },
  { id: 'a_mom', name: 'Mom (Rent)',     type: 'person', icon: '👩', openingBalance: 0 },
];
const transactions = [
  { id: 't1', accountId: 'a_chk', date: '2026-05-01', amount: 200 },
  { id: 't2', accountId: 'a_cc',  date: '2026-05-02', amount: -150 },
];

describe('AccountList', () => {
  afterEach(() => cleanup());

  it('renders group headers, account names, and the household strip', () => {
    render(<AccountList accounts={accounts} transactions={transactions} selectedId="a_chk" onSelect={() => {}} onAddAccount={() => {}} />);
    expect(screen.getByText('Cash & Bank')).toBeTruthy();
    expect(screen.getByText('Credit cards & loans')).toBeTruthy();
    expect(screen.getByText('People & external')).toBeTruthy();
    expect(screen.getByText('Chase Checking')).toBeTruthy();
    expect(screen.getByText(/Net worth/i)).toBeTruthy();
  });

  it('fires onSelect when an account is clicked', async () => {
    const onSelect = vi.fn();
    render(<AccountList accounts={accounts} transactions={transactions} selectedId="a_chk" onSelect={onSelect} onAddAccount={() => {}} />);
    await userEvent.click(screen.getByText('Mastercard'));
    expect(onSelect).toHaveBeenCalledWith('a_cc');
  });

  it('fires onAddAccount from the add button', async () => {
    const onAddAccount = vi.fn();
    render(<AccountList accounts={accounts} transactions={transactions} selectedId={null} onSelect={() => {}} onAddAccount={onAddAccount} />);
    await userEvent.click(screen.getByRole('button', { name: /add account/i }));
    expect(onAddAccount).toHaveBeenCalled();
  });

  it('groups accounts under a custom type using the provided types registry', () => {
    const customTypes = [
      { id: 'hsa', label: 'HSA', klass: 'asset', layout: 'compact', group: 'Health', icon: '🏥', builtin: false },
    ];
    const accts = [{ id: 'a_h', name: 'Fidelity HSA', type: 'hsa', icon: '🏥', openingBalance: 500 }];
    render(<AccountList accounts={accts} transactions={[]} types={customTypes} selectedId={null} onSelect={() => {}} onAddAccount={() => {}} />);
    expect(screen.getByText('Health')).toBeTruthy();
    expect(screen.getByText('Fidelity HSA')).toBeTruthy();
  });
});
