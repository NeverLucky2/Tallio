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

  it('renders group headers, account names, and the net-worth block', () => {
    render(<AccountList accounts={accounts} transactions={transactions} selectedId="a_chk" onSelect={() => {}} onAddAccount={() => {}} />);
    expect(screen.getByText('Cash & Bank')).toBeTruthy();
    expect(screen.getByText('Credit cards & loans')).toBeTruthy();
    expect(screen.getByText('People & external')).toBeTruthy();
    expect(screen.getByText('Chase Checking')).toBeTruthy();
    expect(screen.getByText(/Net worth/i)).toBeTruthy();
    expect(screen.getByText(/Cash & investments/i)).toBeTruthy();
    expect(screen.getByText(/You owe/i)).toBeTruthy();
  });

  it('shows the month delta for current-month activity', () => {
    render(<AccountList accounts={accounts} transactions={transactions} now={new Date('2026-05-15T12:00:00')} selectedId={null} onSelect={() => {}} onAddAccount={() => {}} />);
    // May activity: +200 (checking) − 150 (card) = +50
    expect(screen.getByText(/\+\$50\.00 this month/)).toBeTruthy();
  });

  it('shows a muted zero delta when the current month has no activity', () => {
    render(<AccountList accounts={accounts} transactions={transactions} now={new Date('2026-07-01T12:00:00')} selectedId={null} onSelect={() => {}} onAddAccount={() => {}} />);
    expect(screen.getByText(/\$0\.00 this month/)).toBeTruthy();
  });

  it('splits the net-worth figure into dollars and cents spans', () => {
    const { container } = render(<AccountList accounts={accounts} transactions={transactions} selectedId={null} onSelect={() => {}} onAddAccount={() => {}} />);
    expect(container.querySelector('.networth-cents')).toBeTruthy();
  });

  it('shows a net-worth sparkline when there is account history', () => {
    const { container } = render(<AccountList accounts={accounts} transactions={transactions} now={new Date('2026-05-15T12:00:00')} selectedId={null} onSelect={() => {}} onAddAccount={() => {}} />);
    expect(container.querySelector('.networth-spark svg')).toBeTruthy();
  });

  it('hides the sparkline when the series is all zero', () => {
    const { container } = render(<AccountList accounts={[]} transactions={[]} selectedId={null} onSelect={() => {}} onAddAccount={() => {}} />);
    expect(container.querySelector('.networth-spark svg')).toBeNull();
  });

  it('shows a per-group account count', () => {
    const { container } = render(<AccountList accounts={accounts} transactions={transactions} selectedId={null} onSelect={() => {}} onAddAccount={() => {}} />);
    const label = container.querySelector('.account-group-label');
    expect(label.textContent).toContain('Cash & Bank');
    expect(label.textContent).toContain('1');
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
