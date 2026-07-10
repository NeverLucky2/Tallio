// src/ScanReview.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ScanReview from './ScanReview.jsx';

afterEach(() => cleanup());

const accounts = [{ id: 'a1', name: 'Chase Sapphire', type: 'untyped' }, { id: 'a3', name: 'Checking', type: 'untyped' }];
const items = [{ description: 'Costco', amount: 100 }, { description: 'Gas', amount: 40 }];

function setup(scan, extra = {}) {
  const onConfirm = vi.fn(), onCancel = vi.fn(), onCreateAccount = vi.fn(() => 'newid');
  render(<ScanReview scan={scan} accounts={accounts} onConfirm={onConfirm} onCancel={onCancel} onCreateAccount={onCreateAccount} {...extra} />);
  return { onConfirm, onCancel, onCreateAccount };
}

describe('ScanReview', () => {
  it('shows the vendor and transaction count', () => {
    setup({ vendor: 'Chase Sapphire', items });
    // Assert on the heading specifically — the vendor name also appears as an
    // account <option>, so a bare getByText would be ambiguous.
    expect(screen.getByRole('heading', { name: /Found 2 transactions from/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Chase Sapphire/ })).toBeTruthy();
  });

  it('preselects a matching account and confirms with its id', () => {
    const { onConfirm } = setup({ vendor: 'Chase Sapphire', items });
    expect(screen.getByLabelText('Account').value).toBe('a1');
    fireEvent.click(screen.getByRole('button', { name: /Add 2 transactions/i }));
    expect(onConfirm).toHaveBeenCalledWith('a1');
  });

  it('defaults to create-new (prefilled) when no account matches', () => {
    setup({ vendor: 'Costco Wholesale', items });
    // AccountEditor is shown in "new account" mode, name prefilled with the vendor
    expect(screen.getByRole('heading', { name: /new account/i })).toBeTruthy();
    expect(screen.getByLabelText('Name').value).toBe('Costco Wholesale');
  });

  it('Cancel calls onCancel', () => {
    const { onCancel } = setup({ vendor: 'Chase Sapphire', items });
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
