import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DuplicateBillDialog from './DuplicateBillDialog.jsx';

afterEach(() => cleanup());

const sourceBill = { id: 'b1', vendor: 'Honda Finance', month: '2026-05', items: [] };

describe('DuplicateBillDialog', () => {
  it('renders the dialog with title and source vendor', () => {
    render(<DuplicateBillDialog sourceBill={sourceBill} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/Duplicate to which month/i)).toBeTruthy();
    expect(screen.getByText(/Honda Finance/i)).toBeTruthy();
  });

  it('pre-fills the month input to source.month + 1', () => {
    render(<DuplicateBillDialog sourceBill={sourceBill} onConfirm={() => {}} onCancel={() => {}} />);
    const input = document.querySelector('input[type="month"]');
    expect(input.value).toBe('2026-06');
  });

  it('Confirm with default value calls onConfirm with the pre-filled month', async () => {
    const onConfirm = vi.fn();
    render(<DuplicateBillDialog sourceBill={sourceBill} onConfirm={onConfirm} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /^Duplicate$/i }));
    expect(onConfirm).toHaveBeenCalledWith('2026-06');
  });

  it('Confirm passes the user-selected target month', async () => {
    const onConfirm = vi.fn();
    render(<DuplicateBillDialog sourceBill={sourceBill} onConfirm={onConfirm} onCancel={() => {}} />);
    const input = document.querySelector('input[type="month"]');
    await userEvent.clear(input);
    await userEvent.type(input, '2027-01');
    await userEvent.click(screen.getByRole('button', { name: /^Duplicate$/i }));
    expect(onConfirm).toHaveBeenCalledWith('2027-01');
  });

  it('Duplicate button is disabled when month input is cleared', async () => {
    render(<DuplicateBillDialog sourceBill={sourceBill} onConfirm={() => {}} onCancel={() => {}} />);
    const input = document.querySelector('input[type="month"]');
    await userEvent.clear(input);
    const btn = screen.getByRole('button', { name: /^Duplicate$/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('Cancel calls onCancel and not onConfirm', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DuplicateBillDialog sourceBill={sourceBill} onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
