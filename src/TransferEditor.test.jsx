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
});
