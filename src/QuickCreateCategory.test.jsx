import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickCreateCategory from './QuickCreateCategory.jsx';

describe('QuickCreateCategory', () => {
  afterEach(() => cleanup());

  it('prefills the name and submits trimmed name + icon + chosen flow', async () => {
    const onSubmit = vi.fn();
    render(<QuickCreateCategory initialName="Vet bills" onSubmit={onSubmit} onCancel={vi.fn()} />);
    // default flow is expense
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Vet bills', icon: '📋', flow: 'expense' });
  });

  it('lets the user change the flow when not locked', async () => {
    const onSubmit = vi.fn();
    render(<QuickCreateCategory initialName="Bonus" flow="expense" onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/flow/i), 'income');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onSubmit.mock.calls[0][0].flow).toBe('income');
  });

  it('hides the flow selector and forces flow when locked', async () => {
    const onSubmit = vi.fn();
    render(<QuickCreateCategory initialName="Reimb" flow="transfer" lockFlow onSubmit={onSubmit} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText(/flow/i)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onSubmit.mock.calls[0][0].flow).toBe('transfer');
  });

  it('disables Add for an empty/whitespace name and Cancel calls onCancel', async () => {
    const onCancel = vi.fn();
    render(<QuickCreateCategory initialName="   " onSubmit={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: /^add$/i }).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
