// src/TransactionRow.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionRow from './TransactionRow.jsx';

const cat = { id: 'c_util', name: 'Utilities', icon: '⚡', color: '#F59E0B' };
const catsById = new Map([[cat.id, cat]]);

const baseRow = { id: 't1', date: '2026-04-15', amount: -96.30, categoryId: 'c_util', description: 'Electricity', payee: 'ComEd', checkNumber: '1042', balance: 903.70 };

describe('TransactionRow', () => {
  afterEach(() => cleanup());

  it('compact layout shows description, category, signed amount, balance', () => {
    render(<table><tbody><TransactionRow layout="compact" row={baseRow} categoriesById={catsById} onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('Electricity')).toBeTruthy();
    expect(screen.getByText('Utilities')).toBeTruthy();
    expect(screen.getByText('-$96.30')).toBeTruthy();
    expect(screen.getByText('$903.70')).toBeTruthy();
  });

  it('bank layout splits into payment/deposit and shows payee + check #', () => {
    render(<table><tbody><TransactionRow layout="bank" row={baseRow} categoriesById={catsById} onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('ComEd')).toBeTruthy();
    expect(screen.getByText('1042')).toBeTruthy();
    expect(screen.getByText('96.30')).toBeTruthy(); // payment column, unsigned
  });

  it('clicking the row calls onEdit with the row', async () => {
    const onEdit = vi.fn();
    render(<table><tbody><TransactionRow layout="compact" row={baseRow} categoriesById={catsById} onEdit={onEdit} /></tbody></table>);
    await userEvent.click(screen.getByText('Electricity'));
    expect(onEdit).toHaveBeenCalledWith(baseRow);
  });

  it('renders an outgoing transfer chip (→ counterpart) in the category cell', () => {
    const row = { ...baseRow, categoryId: null };
    render(<table><tbody><TransactionRow layout="compact" row={row} categoriesById={catsById} transfer={{ counterpartName: 'Savings', direction: 'out' }} onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('Savings')).toBeTruthy();
    expect(screen.getByText(/→/)).toBeTruthy();
    expect(screen.queryByText('Utilities')).toBeNull(); // category cell replaced by chip
  });

  it('renders an incoming transfer chip (← counterpart)', () => {
    const row = { ...baseRow, categoryId: null };
    render(<table><tbody><TransactionRow layout="compact" row={row} categoriesById={catsById} transfer={{ counterpartName: 'Checking', direction: 'in' }} onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('Checking')).toBeTruthy();
    expect(screen.getByText(/←/)).toBeTruthy();
  });

  it('without a transfer prop the row is unchanged (shows the category)', () => {
    render(<table><tbody><TransactionRow layout="compact" row={baseRow} categoriesById={catsById} onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('Utilities')).toBeTruthy();
  });

  it('tints the transfer chip by counterpart money-class', () => {
    const row = { ...baseRow, categoryId: null };
    render(<table><tbody><TransactionRow layout="compact" row={row} categoriesById={catsById} transfer={{ counterpartName: 'Savings', direction: 'out', counterpartClass: 'asset' }} onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('Savings').className).toContain('txn-transfer--asset');
  });

  it('clicking the chip jump icon navigates to the counterpart and does not open the editor', async () => {
    const onEdit = vi.fn(); const onNavigate = vi.fn();
    const row = { ...baseRow, categoryId: null };
    render(<table><tbody><TransactionRow layout="compact" row={row} categoriesById={catsById} transfer={{ counterpartName: 'Savings', direction: 'out', counterpartClass: 'asset', counterpartId: 'a_sav' }} onNavigate={onNavigate} onEdit={onEdit} /></tbody></table>);
    await userEvent.click(screen.getByRole('button', { name: /go to savings/i }));
    expect(onNavigate).toHaveBeenCalledWith('a_sav');
    expect(onEdit).not.toHaveBeenCalled();
  });
});
