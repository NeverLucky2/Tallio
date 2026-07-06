import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickCreateAccountType from './QuickCreateAccountType.jsx';

describe('QuickCreateAccountType', () => {
  afterEach(() => cleanup());

  it('submits trimmed label + icon + chosen class', async () => {
    const onSubmit = vi.fn();
    render(<QuickCreateAccountType onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/type label/i), '  Brokerage  ');
    await userEvent.selectOptions(screen.getByLabelText(/class/i), 'asset');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onSubmit).toHaveBeenCalledWith({ label: 'Brokerage', icon: '🏷️', klass: 'asset' });
  });

  it('can choose a liability class', async () => {
    const onSubmit = vi.fn();
    render(<QuickCreateAccountType onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/type label/i), 'Loan');
    await userEvent.selectOptions(screen.getByLabelText(/class/i), 'liability');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onSubmit.mock.calls[0][0].klass).toBe('liability');
  });

  it('disables Add for an empty label and Cancel calls onCancel', async () => {
    const onCancel = vi.fn();
    render(<QuickCreateAccountType onSubmit={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: /^add$/i }).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
