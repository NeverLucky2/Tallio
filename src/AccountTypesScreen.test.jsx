// src/AccountTypesScreen.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountTypesScreen from './AccountTypesScreen.jsx';
import { DEFAULT_ACCOUNT_TYPES } from './accountsModel.js';

const types = DEFAULT_ACCOUNT_TYPES;

describe('AccountTypesScreen', () => {
  afterEach(() => cleanup());

  it('lists every type and opens the editor for + New type', async () => {
    render(<AccountTypesScreen types={types} accounts={[]} onClose={() => {}} onSaveType={() => {}} onDeleteType={() => {}} />);
    expect(screen.getByText('Bank / Cash')).toBeTruthy();
    expect(screen.getByText('Credit card')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /new type/i }));
    expect(screen.getByText('New account type')).toBeTruthy();
  });

  it('deleting an UNUSED type calls onDeleteType(id, null)', async () => {
    const onDeleteType = vi.fn();
    render(<AccountTypesScreen types={types} accounts={[]} onClose={() => {}} onSaveType={() => {}} onDeleteType={onDeleteType} />);
    await userEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]); // 'bank'
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDeleteType).toHaveBeenCalledWith('bank', null);
  });

  it('deleting an IN-USE type prompts to reassign and passes the chosen target', async () => {
    const onDeleteType = vi.fn();
    const accounts = [{ id: 'a1', name: 'Chase', type: 'bank' }];
    render(<AccountTypesScreen types={types} accounts={accounts} onClose={() => {}} onSaveType={() => {}} onDeleteType={onDeleteType} />);
    await userEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]); // 'bank' (1 account uses it)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByText(/account uses this type/i)).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText(/reassign to/i), 'investment');
    await userEvent.click(screen.getByRole('button', { name: /delete & reassign/i }));
    expect(onDeleteType).toHaveBeenCalledWith('bank', 'investment');
  });
});
