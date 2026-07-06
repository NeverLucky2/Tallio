// src/TransactionEditor.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionEditor from './TransactionEditor.jsx';

const categories = [
  { id: 'c_shop', name: 'Shopping', icon: '🛍️', flow: 'expense' },
  { id: 'c_pay',  name: 'Paycheck', icon: '💼', flow: 'income' },
];

function setup(props = {}) {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  render(
    <TransactionEditor
      account={{ id: 'a1', name: 'Mastercard', type: 'credit_card' }}
      transaction={props.transaction ?? null}
      categories={categories}
      onSave={onSave} onDelete={onDelete} onClose={onClose}
    />
  );
  return { onSave, onDelete, onClose };
}

describe('TransactionEditor', () => {
  afterEach(() => cleanup());

  it('new transaction: saving assembles a NEGATIVE amount for money out', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/description/i), 'Walmart');
    await userEvent.clear(screen.getByLabelText(/amount/i));
    await userEvent.type(screen.getByLabelText(/amount/i), '96.20');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.amount).toBeCloseTo(-96.20, 2); // default direction = out
    expect(saved.description).toBe('Walmart');
  });

  it('direction toggle to "in" makes the amount positive', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/amount/i), '1100');
    await userEvent.click(screen.getByRole('button', { name: /money in/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave.mock.calls[0][0].amount).toBeCloseTo(1100, 2);
  });

  it('editing an existing transaction shows delete', async () => {
    const { onDelete } = setup({ transaction: { id: 't1', accountId: 'a1', date: '2026-05-05', amount: -96.20, categoryId: 'c_shop', description: 'Walmart', payee: null, checkNumber: null, transferId: null } });
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('t1');
  });
});

describe('TransactionEditor split wire-up', () => {
  afterEach(() => cleanup());

  function setupSplit(transaction = null) {
    const onSave = vi.fn();
    render(
      <TransactionEditor
        account={{ id: 'a_chase', name: 'Chase', type: 'bank' }}
        transaction={transaction}
        categories={categories}
        accounts={[{ id: 'a_chase', name: 'Chase', type: 'bank' }, { id: 'a_cash', name: 'Cash', type: 'bank' }]}
        onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()}
      />
    );
    return { onSave };
  }

  it('shows the Split… button for a non-split transaction', () => {
    setupSplit();
    expect(screen.getByRole('button', { name: /^split…?$/i })).toBeTruthy();
  });

  it('opening Split… mounts SplitsEditor', async () => {
    setupSplit();
    await userEvent.click(screen.getByRole('button', { name: /^split…?$/i }));
    expect(screen.getByRole('button', { name: /done/i })).toBeTruthy();
  });

  it('opening Split then Cancel leaves the transaction unsplit and the amount editable', async () => {
    setupSplit();
    await userEvent.type(screen.getByLabelText(/^amount$/i), '100');
    await userEvent.click(screen.getByRole('button', { name: /^split…?$/i }));
    await userEvent.click(within(document.querySelector('.split-editor')).getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/split lines/i)).toBeNull();
    expect(screen.getByLabelText(/^amount$/i).disabled).toBe(false);
    expect(screen.getByRole('button', { name: /^split…?$/i })).toBeTruthy();
  });

  it('opening Split seeds a single starter line (user adds the rest)', async () => {
    setupSplit();
    await userEvent.type(screen.getByLabelText(/^amount$/i), '100');
    await userEvent.click(screen.getByRole('button', { name: /^split…?$/i }));
    expect(screen.getAllByLabelText(/line amount/i)).toHaveLength(1);
  });

  it('opening Split, adding a line, then Done commits the split (amount becomes locked)', async () => {
    setupSplit();
    await userEvent.type(screen.getByLabelText(/^amount$/i), '100');
    await userEvent.click(screen.getByRole('button', { name: /^split…?$/i }));
    await userEvent.click(screen.getByRole('button', { name: /add line/i })); // now 2 lines
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(screen.getByText(/2 split lines/i)).toBeTruthy();
    expect(screen.getByLabelText(/^amount$/i).disabled).toBe(true);
  });

  it('Unsplit on a committed split collapses to a single category and saves without splits', async () => {
    const { onSave } = setupSplit({
      id: 't1', accountId: 'a_chase', date: '2026-05-20', amount: -180,
      categoryId: 'c_pay', description: 'Costco', payee: 'Costco',
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_shop', description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_pay',  description: '' },
      ],
    });
    window.confirm = vi.fn(() => true);
    await userEvent.click(screen.getByRole('button', { name: /edit splits/i }));
    await userEvent.click(screen.getByRole('button', { name: /unsplit/i }));
    expect(screen.queryByText(/split lines/i)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.splits == null).toBe(true); // splits cleared, not leaked
    expect(saved.categoryId).toBe('c_shop');
  });

  it('an existing split transaction shows the summary chip AND keeps the editable category field', () => {
    setupSplit({
      id: 't1', accountId: 'a_chase', date: '2026-05-20', amount: -180,
      categoryId: 'c_pay', description: 'Costco', payee: 'Costco',
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_shop', description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_pay',  description: '' },
      ],
    });
    expect(screen.getByText(/2 split lines/i)).toBeTruthy();
    const trigger = screen.getByRole('button', { name: /^category$/i });
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toMatch(/Paycheck/);
  });

  it('saving a split transaction keeps its main categoryId (not null)', async () => {
    const { onSave } = setupSplit({
      id: 't1', accountId: 'a_chase', date: '2026-05-20', amount: -180,
      categoryId: 'c_pay', description: 'Costco', payee: 'Costco',
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_shop', description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_pay',  description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave.mock.calls[0][0].categoryId).toBe('c_pay');
  });
});

describe('TransactionEditor sub-category', () => {
  afterEach(() => cleanup());

  const catsWithSub = [
    { id: 'tax', name: 'Taxes', icon: '🏛️', flow: 'expense', subcategories: [
      { id: 'fed', name: 'Federal Tax', keywords: [] },
    ] },
    { id: 'c_shop', name: 'Shopping', icon: '🛍️', flow: 'expense', subcategories: [] },
  ];

  function setupSub(props = {}) {
    const onSave = vi.fn();
    render(
      <TransactionEditor
        account={{ id: 'a1', name: 'Mastercard', type: 'credit_card' }}
        transaction={props.transaction ?? null}
        categories={catsWithSub}
        onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()}
      />
    );
    return { onSave };
  }

  it('shows the current sub on the trigger when editing', () => {
    setupSub({ transaction: { id: 't1', accountId: 'a1', date: '2026-06-08', amount: -500, categoryId: 'tax', subId: 'fed', description: 'IRS', payee: null, checkNumber: null, transferId: null } });
    expect(screen.getByRole('button', { name: /^category$/i }).textContent).toMatch(/Taxes › Federal Tax/);
  });

  it('saving with a sub selected includes subId', async () => {
    const { onSave } = setupSub();
    await userEvent.type(screen.getByLabelText(/^amount$/i), '500');
    await userEvent.click(screen.getByRole('button', { name: /^category$/i }));
    await userEvent.click(screen.getByText('Federal Tax'));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ categoryId: 'tax', subId: 'fed' });
  });

  it('selecting a plain category yields no subId', async () => {
    const { onSave } = setupSub();
    await userEvent.type(screen.getByLabelText(/^amount$/i), '20');
    await userEvent.click(screen.getByRole('button', { name: /^category$/i }));
    await userEvent.click(screen.getByText('Shopping'));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.categoryId).toBe('c_shop');
    expect(saved.subId == null).toBe(true);
  });
});

describe('TransactionEditor prefill + template', () => {
  afterEach(() => cleanup());

  it('prefill seeds a NEW transaction (no Delete, fields filled)', () => {
    const account = { id: 'a_bank', name: 'Chase', type: 'bank' };
    render(<TransactionEditor account={account} categories={[{ id: 'c_food', name: 'Food', flow: 'expense' }]}
      accounts={[account]} prefill={{ accountId: 'a_bank', date: '2026-06-15', amount: -25, categoryId: 'c_food', description: 'Lunch', payee: 'Cafe', checkNumber: null, splits: null }}
      onSave={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/New transaction/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull();
    expect(screen.getByLabelText(/^Description$/i).value).toBe('Lunch');
    expect(screen.getByLabelText(/^Amount$/i).value).toBe('25');
  });

  it('Save as template builds a draft from current fields', async () => {
    const account = { id: 'a_bank', name: 'Chase', type: 'bank' };
    const onSaveAsTemplate = vi.fn();
    render(<TransactionEditor account={account} categories={[{ id: 'c_food', name: 'Food', flow: 'expense' }]}
      accounts={[account]} onSaveAsTemplate={onSaveAsTemplate} onSave={() => {}} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/^Description$/i), 'Coffee');
    await userEvent.click(screen.getByRole('button', { name: /save as template/i }));
    expect(onSaveAsTemplate).toHaveBeenCalledTimes(1);
    expect(onSaveAsTemplate.mock.calls[0][0]).toMatchObject({ kind: 'transaction', payload: { description: 'Coffee' } });
  });
});

describe('TransactionEditor — inline create category', () => {
  afterEach(() => cleanup());

  it('creates a category from the picker with flow from the out/in direction', async () => {
    const onAddCategory = vi.fn(() => 'newcat');
    render(
      <TransactionEditor
        account={{ id: 'a1', name: 'Mastercard', type: 'credit_card' }}
        transaction={null} categories={categories}
        onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()}
        onAddCategory={onAddCategory}
      />
    );
    // default direction = out -> expense
    await userEvent.click(screen.getByRole('button', { name: /^category$/i }));
    await userEvent.type(screen.getByRole('combobox'), 'Vet bills');
    await userEvent.click(screen.getByRole('button', { name: /new category .*vet bills/i }));
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onAddCategory).toHaveBeenCalledWith({ name: 'Vet bills', icon: '📋', flow: 'expense' });
  });
});
