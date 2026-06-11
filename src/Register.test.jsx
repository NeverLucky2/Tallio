// src/Register.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

  it('defaults to date-descending (newest first)', () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    const descCells = screen.getAllByText(/Walmart|Netflix/).map(n => n.textContent);
    expect(descCells[0]).toBe('Walmart'); // May 5 before Apr 2
  });

  it('clicking the Date header reverses to oldest-first, and again restores newest-first', async () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /date/i }));
    expect(screen.getAllByText(/Walmart|Netflix/).map(n => n.textContent)[0]).toBe('Netflix'); // asc → Apr first
    await userEvent.click(screen.getByRole('button', { name: /date/i }));
    expect(screen.getAllByText(/Walmart|Netflix/).map(n => n.textContent)[0]).toBe('Walmart'); // desc again
  });

  it('clicking the Amount header sorts by amount (desc first, then asc)', async () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /amount/i }));
    // amounts: Walmart -96.20, Netflix -15.99 → desc puts the larger (-15.99) first
    expect(screen.getAllByText(/Walmart|Netflix/).map(n => n.textContent)[0]).toBe('Netflix');
    await userEvent.click(screen.getByRole('button', { name: /amount/i }));
    expect(screen.getAllByText(/Walmart|Netflix/).map(n => n.textContent)[0]).toBe('Walmart');
  });

  it('shows a ⇄ Transfer button that fires onTransfer with the account id', async () => {
    const onTransfer = vi.fn();
    render(<Register account={account} transactions={transactions} accounts={[account]} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} onTransfer={onTransfer} />);
    await userEvent.click(screen.getByRole('button', { name: /^transfer$/i }));
    expect(onTransfer).toHaveBeenCalledWith('a_cc');
  });

  it('shows an edit-account button that fires onEditAccount', async () => {
    const onEditAccount = vi.fn();
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} onEditAccount={onEditAccount} />);
    await userEvent.click(screen.getByRole('button', { name: /edit account/i }));
    expect(onEditAccount).toHaveBeenCalled();
  });

  it('shows the account type label in the header', () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    expect(screen.getByText('Credit card')).toBeTruthy();
  });

  it('footer reports entry count, period, and last entry date', () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    expect(screen.getByText(/2 entries · All activity/)).toBeTruthy();
    expect(screen.getByText(/Last entry May 5, 2026/)).toBeTruthy();
  });

  it('footer reflects the month filter with a singular count', () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    fireEvent.change(screen.getByLabelText(/month filter/i), { target: { value: '2026-04' } });
    expect(screen.getByText(/1 entry · April 2026/)).toBeTruthy();
  });

  it('renders a transfer leg with a counterpart chip', () => {
    const chk = { id: 'a_chk', name: 'Checking', type: 'bank', icon: '🏦', openingBalance: 1000 };
    const sav = { id: 'a_sav', name: 'Savings',  type: 'bank', icon: '🏦', openingBalance: 0 };
    const txns = [
      { id: 'tf', accountId: 'a_chk', date: '2026-05-20', amount: -500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
      { id: 'tt', accountId: 'a_sav', date: '2026-05-20', amount:  500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
    ];
    render(<Register account={chk} transactions={txns} accounts={[chk, sav]} categories={[]} categoriesById={new Map()} onEditTransaction={() => {}} onAddTransaction={() => {}} onTransfer={() => {}} />);
    expect(screen.getByText('Savings')).toBeTruthy(); // counterpart name
    expect(screen.getByText(/→/)).toBeTruthy();        // outgoing direction
  });

  it('clicking a transfer chip jump icon selects the counterpart account', async () => {
    const onSelectAccount = vi.fn();
    const chk = { id: 'a_chk', name: 'Checking', type: 'bank', icon: '🏦', openingBalance: 1000 };
    const sav = { id: 'a_sav', name: 'Savings',  type: 'bank', icon: '🏦', openingBalance: 0 };
    const txns = [
      { id: 'tf', accountId: 'a_chk', date: '2026-05-20', amount: -500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
      { id: 'tt', accountId: 'a_sav', date: '2026-05-20', amount:  500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
    ];
    render(<Register account={chk} transactions={txns} accounts={[chk, sav]} categories={[]} categoriesById={new Map()} onEditTransaction={() => {}} onAddTransaction={() => {}} onTransfer={() => {}} onSelectAccount={onSelectAccount} />);
    await userEvent.click(screen.getByRole('button', { name: /go to savings/i }));
    expect(onSelectAccount).toHaveBeenCalledWith('a_sav');
  });
});

describe('Register with split transactions', () => {
  afterEach(() => cleanup());

  const splitAccount = { id: 'a_chase', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 1000 };
  const splitCats = [
    { id: 'c_grocery', name: 'Groceries',         icon: '🛒' },
    { id: 'c_solar',   name: 'Home Improvement',  icon: '🏠' },
  ];
  const splitCatsById = new Map(splitCats.map(c => [c.id, c]));
  const splitTxns = [{
    id: 't1', accountId: 'a_chase', date: '2026-05-20', amount: -4300,
    payee: 'Costco', checkNumber: null, transferId: null,
    description: 'Costco big shop', categoryId: null,
    splits: [
      { id: 's1', amount:  -180, categoryId: 'c_grocery', description: 'Weekly groceries' },
      { id: 's2', amount: -4120, categoryId: 'c_solar',   description: '5kW solar panel kit' },
    ],
  }];

  it('search matching a split line auto-expands the parent', async () => {
    render(
      <Register
        account={splitAccount}
        transactions={splitTxns}
        categories={splitCats}
        categoriesById={splitCatsById}
        onEditTransaction={() => {}}
        onAddTransaction={() => {}}
      />
    );
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'solar');
    expect(screen.getByText('5kW solar panel kit')).toBeTruthy();
  });
});
