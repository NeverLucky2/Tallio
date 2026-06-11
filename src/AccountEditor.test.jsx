// src/AccountEditor.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountEditor from './AccountEditor.jsx';

describe('AccountEditor', () => {
  afterEach(() => cleanup());

  it('new account: saves name, type, opening balance', async () => {
    const onSave = vi.fn();
    render(<AccountEditor account={null} onSave={onSave} onDelete={() => {}} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Schwab Brokerage');
    await userEvent.selectOptions(screen.getByLabelText(/type/i), 'investment');
    await userEvent.clear(screen.getByLabelText(/opening balance/i));
    await userEvent.type(screen.getByLabelText(/opening balance/i), '42300');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.name).toBe('Schwab Brokerage');
    expect(saved.type).toBe('investment');
    expect(saved.openingBalance).toBe(42300);
  });

  it('picks the icon via the IconPicker (emoji and custom images, like categories)', async () => {
    const onSave = vi.fn();
    const { container } = render(<AccountEditor account={{ id: 'a1', name: 'Checking', type: 'bank', icon: '🏦', openingBalance: 0 }} onSave={onSave} onDelete={() => {}} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /icon picker/i }));
    const firstCell = container.querySelector('.picker-cell');
    const picked = firstCell.textContent;
    await userEvent.click(firstCell);
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave.mock.calls[0][0].icon).toBe(picked);
  });

  it('editing an existing account shows the type selector pre-set and a delete button', async () => {
    const onDelete = vi.fn();
    render(<AccountEditor account={{ id: 'a1', name: 'Mastercard', type: 'untyped', icon: '💳', openingBalance: 0 }} onSave={() => {}} onDelete={onDelete} onClose={() => {}} />);
    expect(screen.getByLabelText(/type/i).value).toBe('untyped');
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('a1');
  });
});
