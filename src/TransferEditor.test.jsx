// src/TransferEditor.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransferEditor from './TransferEditor.jsx';
import { DEFAULT_ACCOUNT_TYPES, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';

const accounts = [
  { id: 'a_chk', name: 'Checking', type: 'bank' },
  { id: 'a_sav', name: 'Savings',  type: 'bank' },
];

function setup(props = {}) {
  const onSave = vi.fn(), onDelete = vi.fn(), onClose = vi.fn();
  render(
    <TransferEditor
      accounts={accounts}
      fromAccountId={props.fromAccountId ?? 'a_chk'}
      transfer={props.transfer ?? null}
      onSave={onSave} onDelete={onDelete} onClose={onClose}
    />
  );
  return { onSave, onDelete, onClose };
}

describe('TransferEditor', () => {
  afterEach(() => cleanup());

  it('new transfer: Save is disabled until From/To/amount are valid', async () => {
    setup();
    const saveBtn = screen.getByRole('button', { name: /save transfer/i });
    expect(saveBtn.disabled).toBe(true); // no To selected yet
    await userEvent.selectOptions(screen.getByLabelText(/to account/i), 'a_sav');
    await userEvent.type(screen.getByLabelText(/amount/i), '500');
    expect(saveBtn.disabled).toBe(false);
  });

  it('Save stays disabled when From and To are the same account', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText(/to account/i), 'a_chk'); // same as From
    await userEvent.type(screen.getByLabelText(/amount/i), '500');
    expect(screen.getByRole('button', { name: /save transfer/i }).disabled).toBe(true);
  });

  it('new transfer: saving emits fromId/toId/amount/date/description (no transferId)', async () => {
    const { onSave } = setup();
    await userEvent.selectOptions(screen.getByLabelText(/to account/i), 'a_sav');
    await userEvent.type(screen.getByLabelText(/amount/i), '500');
    await userEvent.type(screen.getByLabelText(/notes/i), 'Rent buffer');
    await userEvent.click(screen.getByRole('button', { name: /save transfer/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload).toMatchObject({ fromId: 'a_chk', toId: 'a_sav', amount: 500, description: 'Rent buffer' });
    expect(payload.transferId).toBeUndefined();
  });

  it('edit mode seeds From/To/amount and Delete fires with the transferId', async () => {
    const transfer = {
      transferId: 'x',
      fromLeg: { id: 'tf', accountId: 'a_chk', amount: -500, date: '2026-05-20', description: 'Move' },
      toLeg:   { id: 'tt', accountId: 'a_sav', amount:  500, date: '2026-05-20', description: 'Move' },
    };
    const { onSave, onDelete } = setup({ transfer });
    expect(screen.getByLabelText(/from account/i).value).toBe('a_chk');
    expect(screen.getByLabelText(/to account/i).value).toBe('a_sav');
    expect(screen.getByLabelText(/amount/i).value).toBe('500');
    await userEvent.click(screen.getByRole('button', { name: /save transfer/i }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ transferId: 'x', fromId: 'a_chk', toId: 'a_sav', amount: 500 });
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('x');
  });

  it('groups the From options by account-type group in sidebar order', () => {
    const accts = [
      { id: 'a_chk', name: 'Checking', type: 'bank' },
      { id: 'a_cc',  name: 'Visa',     type: 'credit_card' },
    ];
    render(<TransferEditor accounts={accts} types={DEFAULT_ACCOUNT_TYPES} typesById={DEFAULT_ACCOUNT_TYPES_BY_ID} fromAccountId="a_chk" onSave={() => {}} onDelete={() => {}} onClose={() => {}} />);
    const fromSel = screen.getByLabelText(/from account/i);
    expect([...fromSel.querySelectorAll('optgroup')].map(g => g.label)).toEqual(['Cash & Bank', 'Credit cards & loans']);
  });

  it('new transfer: toAccountId preselects the To picker and initialAmount fills Amount', () => {
    render(<TransferEditor accounts={accounts} fromAccountId="a_chk" toAccountId="a_sav" initialAmount={300}
      onSave={() => {}} onDelete={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText(/to account/i).value).toBe('a_sav');
    expect(screen.getByLabelText(/amount/i).value).toBe('300');
  });

  it('new transfer: initialAmount null leaves Amount blank', () => {
    render(<TransferEditor accounts={accounts} fromAccountId="a_chk" toAccountId="a_sav" initialAmount={null}
      onSave={() => {}} onDelete={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText(/amount/i).value).toBe('');
  });

  it('edit mode ignores toAccountId/initialAmount and seeds from the legs', () => {
    const transfer = {
      transferId: 'x',
      fromLeg: { id: 'tf', accountId: 'a_chk', amount: -500, date: '2026-05-20', description: 'Move' },
      toLeg:   { id: 'tt', accountId: 'a_sav', amount:  500, date: '2026-05-20', description: 'Move' },
    };
    render(<TransferEditor accounts={accounts} transfer={transfer} toAccountId="a_chk" initialAmount={999}
      onSave={() => {}} onDelete={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText(/to account/i).value).toBe('a_sav'); // from the leg, not toAccountId
    expect(screen.getByLabelText(/amount/i).value).toBe('500');       // from the leg, not initialAmount
  });

  const transferCats = [
    { id: 'cc', name: 'Credit Card Payment', icon: '💳', color: '#d4a853', flow: 'transfer' },
    { id: 'iv', name: 'Investment Transfer', icon: '📈', color: '#5b8dff', flow: 'transfer' },
    { id: 'exp', name: 'Groceries', icon: '🛒', color: '#10B981', flow: 'expense' },
  ];
  const acctsTyped = [
    { id: 'a_chk', name: 'Checking', type: 'bank' },
    { id: 'a_visa', name: 'Visa', type: 'credit_card' },
  ];

  it('Type dropdown lists only transfer-flow categories plus None', () => {
    render(<TransferEditor accounts={acctsTyped} categories={transferCats} fromAccountId="a_chk"
      onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />);
    const select = screen.getByLabelText(/^type$/i);
    const optionText = Array.from(select.querySelectorAll('option')).map(o => o.textContent);
    expect(optionText.some(t => /none/i.test(t))).toBe(true);
    expect(optionText.some(t => /Credit Card Payment/.test(t))).toBe(true);
    expect(optionText.some(t => /Groceries/.test(t))).toBe(false); // expense flow excluded
  });

  it('new transfer auto-suggests a type from the destination account', async () => {
    const onSave = vi.fn();
    render(<TransferEditor accounts={acctsTyped} categories={transferCats} fromAccountId="a_chk"
      onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/to account/i), 'a_visa'); // credit_card → Credit Card Payment
    await userEvent.type(screen.getByLabelText(/amount/i), '200');
    await userEvent.click(screen.getByRole('button', { name: /save transfer/i }));
    expect(onSave.mock.calls[0][0].categoryId).toBe('cc');
  });

  it('a manual Type choice is preserved when the To account later changes', async () => {
    const onSave = vi.fn();
    render(<TransferEditor accounts={acctsTyped} categories={transferCats} fromAccountId="a_chk"
      onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/^type$/i), 'iv'); // user picks Investment Transfer
    await userEvent.selectOptions(screen.getByLabelText(/to account/i), 'a_visa'); // would suggest 'cc'
    await userEvent.type(screen.getByLabelText(/amount/i), '200');
    await userEvent.click(screen.getByRole('button', { name: /save transfer/i }));
    expect(onSave.mock.calls[0][0].categoryId).toBe('iv'); // not overridden
  });

  it('edit mode shows the existing categoryId and emits it on save', async () => {
    const onSave = vi.fn();
    const transfer = {
      transferId: 'x',
      fromLeg: { id: 'f', accountId: 'a_chk', amount: -500, date: '2026-05-20', description: 'Move', categoryId: 'iv' },
      toLeg:   { id: 't', accountId: 'a_visa', amount: 500, date: '2026-05-20', description: 'Move', categoryId: 'iv' },
    };
    render(<TransferEditor accounts={acctsTyped} categories={transferCats} transfer={transfer}
      onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/^type$/i).value).toBe('iv');
    await userEvent.click(screen.getByRole('button', { name: /save transfer/i }));
    expect(onSave.mock.calls[0][0].categoryId).toBe('iv');
  });
});

describe('TransferEditor split source-leg wire-up', () => {
  afterEach(() => cleanup());

  function setupTransfer(transfer = null) {
    const onSave = vi.fn();
    render(
      <TransferEditor
        accounts={[
          { id: 'a_chase', name: 'Chase', type: 'bank' },
          { id: 'a_loan',  name: 'Camry Loan', type: 'loan' },
        ]}
        categories={[
          { id: 'c_pay',       name: 'Loan Payment', icon: '🏷️', flow: 'transfer' },
          { id: 'c_principal', name: 'Principal',    icon: '💵', flow: 'expense'  },
        ]}
        fromAccountId="a_chase"
        toAccountId="a_loan"
        transfer={transfer}
        onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()}
      />
    );
    return { onSave };
  }

  it('shows "Split source leg…" button when there are no splits', () => {
    setupTransfer();
    expect(screen.getByRole('button', { name: /split source leg…?/i })).toBeTruthy();
  });

  it('opening it mounts SplitsEditor balanced against the source leg amount', async () => {
    setupTransfer();
    await userEvent.type(screen.getByLabelText(/amount/i), '325.40');
    await userEvent.click(screen.getByRole('button', { name: /split source leg…?/i }));
    expect(screen.getByText(/Balanced/)).toBeTruthy();
    expect(screen.getByText(/Bank: -325\.40/)).toBeTruthy();
  });
});
