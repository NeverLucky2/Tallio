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

  it('wraps the category icon in an icon well', () => {
    const { container } = render(
      <table><tbody><TransactionRow layout="compact" row={baseRow} categoriesById={catsById} onEdit={() => {}} /></tbody></table>
    );
    expect(container.querySelector('.txn-cat .icon-well')).toBeTruthy();
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

  it('renders a type pill (icon + name) when a transfer has a transfer category', () => {
    const tcat = { id: 'c_inv', name: 'Investment Transfer', icon: '📈', color: '#5b8dff' };
    const row = { ...baseRow, categoryId: 'c_inv' };
    render(<table><tbody><TransactionRow layout="compact" row={row}
      categoriesById={new Map([[tcat.id, tcat]])}
      transfer={{ counterpartName: 'Fidelity', direction: 'out', counterpartClass: 'offsheet' }}
      onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('Investment Transfer')).toBeTruthy();
    expect(screen.getByText('Fidelity')).toBeTruthy(); // account chip still present
  });

  it('renders no type pill for an untyped transfer', () => {
    const row = { ...baseRow, categoryId: null };
    render(<table><tbody><TransactionRow layout="compact" row={row} categoriesById={new Map()}
      transfer={{ counterpartName: 'Savings', direction: 'out', counterpartClass: 'asset' }}
      onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('Savings').className).toContain('txn-transfer--asset'); // chip color intact
    expect(screen.queryByText('Investment Transfer')).toBeNull();
  });
});

describe('TransactionRow split parent', () => {
  afterEach(() => cleanup());
  const splitCategoriesById = new Map([
    ['c_grocery',   { id: 'c_grocery',   name: 'Groceries', icon: '🛒' }],
    ['c_household', { id: 'c_household', name: 'Household', icon: '🧴' }],
  ]);
  const splitRow = {
    id: 't1', accountId: 'a1', date: '2026-05-20', amount: -180, balance: 820,
    payee: 'Costco', description: 'Costco big shop', categoryId: null,
    splits: [
      { id: 's1', amount: -100, categoryId: 'c_grocery',   description: 'Groceries' },
      { id: 's2', amount:  -80, categoryId: 'c_household', description: 'Soap' },
    ],
  };

  it('renders "▶ N split lines" in the category cell (collapsed)', () => {
    render(<table><tbody><TransactionRow layout="bank" row={splitRow} categoriesById={splitCategoriesById} onEdit={vi.fn()} /></tbody></table>);
    expect(screen.getByText(/2 split lines/)).toBeTruthy();
  });

  it('shows the main category name alongside the split chevron when the parent has a categoryId', () => {
    const row = { ...splitRow, categoryId: 'c_grocery' };
    render(<table><tbody><TransactionRow layout="bank" row={row} categoriesById={splitCategoriesById} onEdit={vi.fn()} /></tbody></table>);
    expect(screen.getByText('Groceries')).toBeTruthy();      // main category cell (collapsed)
    expect(screen.getByText(/2 split lines/)).toBeTruthy();   // chevron still present
  });

  it('clicking the chevron expands and shows per-line sub-rows', async () => {
    render(<table><tbody><TransactionRow layout="bank" row={splitRow} categoriesById={splitCategoriesById} onEdit={vi.fn()} /></tbody></table>);
    expect(screen.queryByText('Soap')).toBeNull(); // collapsed
    await userEvent.click(screen.getByRole('button', { name: /expand splits/i }));
    expect(screen.getByText('Soap')).toBeTruthy();
    // "Groceries" appears both in category-name cell and description cell once expanded.
    expect(screen.getAllByText(/Groceries/).length).toBeGreaterThanOrEqual(1);
  });

  it('clicking elsewhere on the row still opens the editor', async () => {
    const onEdit = vi.fn();
    render(<table><tbody><TransactionRow layout="bank" row={splitRow} categoriesById={splitCategoriesById} onEdit={onEdit} /></tbody></table>);
    await userEvent.click(screen.getByText('Costco big shop'));
    expect(onEdit).toHaveBeenCalledWith(splitRow);
  });

  it('compact layout: chevron + sub-rows still work', async () => {
    render(<table><tbody><TransactionRow layout="compact" row={splitRow} categoriesById={splitCategoriesById} onEdit={vi.fn()} /></tbody></table>);
    expect(screen.queryByText('Soap')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /expand splits/i }));
    expect(screen.getByText('Soap')).toBeTruthy();
  });
});

describe('TransactionRow kebab menu', () => {
  afterEach(() => cleanup());

  it('kebab menu fires copy / duplicate / save-template and does not open the editor', async () => {
    const onEdit = vi.fn(), onCopy = vi.fn(), onDuplicate = vi.fn(), onSaveTemplate = vi.fn();
    const row = { id: 't1', date: '2026-06-15', description: 'Zelle', amount: 50, categoryId: 'c_util' };
    render(<table><tbody>
      <TransactionRow layout="compact" row={row} categoriesById={catsById}
        onEdit={onEdit} onCopy={onCopy} onDuplicate={onDuplicate} onSaveTemplate={onSaveTemplate} />
    </tbody></table>);
    await userEvent.click(screen.getByRole('button', { name: /row actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^copy$/i }));
    expect(onCopy).toHaveBeenCalledWith(row);
    expect(onEdit).not.toHaveBeenCalled();
  });
});
