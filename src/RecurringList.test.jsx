// src/RecurringList.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecurringList from './RecurringList.jsx';

const classified = {
  alerts: [{ key: 'SPOTIFY', label: 'Spotify', avgAmount: 9.99, cancelledAsOf: '2026-01', lastDate: '2026-03-10', alert: 'zombie' }],
  ongoing: [{ key: 'NETFLIX', label: 'Netflix', avgAmount: 15.99, occurrences: 3, lastDate: '2026-05-04' }],
  cancelled: [{ key: 'OLDGYM', label: 'OldGym', avgAmount: 40, cancelledAsOf: '2025-11', lastDate: '2025-11-01' }],
  review: [{ key: 'NEWCHARGE', label: 'NewCharge', avgAmount: 40, occurrences: 3, lastDate: '2026-05-01' }],
};
const duplicates = [{ accountId: 'a', label: 'OfficeMax', amount: -12.40, date: '2026-04-03', ids: ['d1', 'd2'], signature: 'd1|d2' }];

describe('RecurringList', () => {
  afterEach(() => cleanup());

  it('renders the four status groups with their charges', () => {
    render(<RecurringList classified={classified} duplicates={duplicates} />);
    expect(screen.getByText('Ongoing subscriptions')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByText('Needs review')).toBeTruthy();
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.getByText('OldGym')).toBeTruthy();
    expect(screen.getByText('NewCharge')).toBeTruthy();
  });

  it('shows a zombie alert with the cancellation month', () => {
    render(<RecurringList classified={classified} duplicates={[]} />);
    expect(screen.getByText('Spotify')).toBeTruthy();
    expect(screen.getByText(/charged after cancellation \(cancelled Jan 2026\)/i)).toBeTruthy();
  });

  it('Mark ongoing fires onSetStatus with the key', async () => {
    const onSetStatus = vi.fn();
    render(<RecurringList classified={classified} duplicates={[]} onSetStatus={onSetStatus} />);
    await userEvent.click(screen.getByRole('button', { name: /mark ongoing/i }));
    expect(onSetStatus).toHaveBeenCalledWith('NEWCHARGE', 'ongoing');
  });

  it('Mark cancelled reveals a month input defaulting to last-seen month, then fires onSetStatus', async () => {
    const onSetStatus = vi.fn();
    render(<RecurringList classified={classified} duplicates={[]} onSetStatus={onSetStatus} />);
    await userEvent.click(screen.getByRole('button', { name: /mark cancelled/i }));
    const monthInput = screen.getByLabelText(/cancel NewCharge as of/i);
    expect(monthInput.value).toBe('2026-05');
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onSetStatus).toHaveBeenCalledWith('NEWCHARGE', 'cancelled', '2026-05');
  });

  it('Not a duplicate fires onDismissDuplicate with the signature', async () => {
    const onDismissDuplicate = vi.fn();
    render(<RecurringList classified={classified} duplicates={duplicates} onDismissDuplicate={onDismissDuplicate} />);
    await userEvent.click(screen.getByRole('button', { name: /not a duplicate/i }));
    expect(onDismissDuplicate).toHaveBeenCalledWith('d1|d2');
  });

  it('Change on an ongoing row fires onClearStatus with the key', async () => {
    const onClearStatus = vi.fn();
    render(<RecurringList classified={classified} duplicates={[]} onClearStatus={onClearStatus} />);
    await userEvent.click(screen.getAllByRole('button', { name: /change/i })[0]); // ongoing renders before cancelled
    expect(onClearStatus).toHaveBeenCalledWith('NETFLIX');
  });

  it('all-empty shows the empty state', () => {
    render(<RecurringList classified={{ alerts: [], ongoing: [], cancelled: [], review: [] }} duplicates={[]} />);
    expect(screen.getByText(/no recurring charges/i)).toBeTruthy();
  });
});
