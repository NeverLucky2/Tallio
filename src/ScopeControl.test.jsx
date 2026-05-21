// src/ScopeControl.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScopeControl from './ScopeControl.jsx';
import { DEFAULT_ACCOUNT_TYPES, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';

const accounts = [
  { id: 'a1', name: 'Chase Checking', type: 'bank' },
  { id: 'a2', name: 'Amex', type: 'credit_card' },
];

describe('ScopeControl', () => {
  afterEach(() => cleanup());
  it('offers an All option plus per-account options', () => {
    render(<ScopeControl accounts={accounts} types={DEFAULT_ACCOUNT_TYPES} typesById={DEFAULT_ACCOUNT_TYPES_BY_ID}
      scope={{ kind: 'all' }} onChange={() => {}} />);
    expect(screen.getByText(/all accounts/i)).toBeTruthy();
    expect(screen.getByText('Chase Checking')).toBeTruthy();
  });
  it('selecting an account emits an account scope', async () => {
    const onChange = vi.fn();
    render(<ScopeControl accounts={accounts} types={DEFAULT_ACCOUNT_TYPES} typesById={DEFAULT_ACCOUNT_TYPES_BY_ID}
      scope={{ kind: 'all' }} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText(/scope/i), 'account:a1');
    expect(onChange).toHaveBeenCalledWith({ kind: 'account', id: 'a1' });
  });
});
