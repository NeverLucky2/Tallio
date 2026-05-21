// src/AccountTypeEditor.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountTypeEditor from './AccountTypeEditor.jsx';

describe('AccountTypeEditor', () => {
  afterEach(() => cleanup());

  it('new type: saves label, class, layout, group', async () => {
    const onSave = vi.fn();
    render(<AccountTypeEditor type={null} existingGroups={['Investments']} onSave={onSave} onDelete={() => {}} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/label/i), 'HSA');
    await userEvent.selectOptions(screen.getByLabelText(/class/i), 'asset');
    await userEvent.selectOptions(screen.getByLabelText(/layout/i), 'bank');
    await userEvent.type(screen.getByLabelText(/group/i), 'Health');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.label).toBe('HSA');
    expect(saved.klass).toBe('asset');
    expect(saved.layout).toBe('bank');
    expect(saved.group).toBe('Health');
  });

  it('editing pre-fills the class and shows a delete button', async () => {
    const onDelete = vi.fn();
    render(<AccountTypeEditor type={{ id: 't1', label: 'Loan', klass: 'liability', layout: 'compact', group: 'Credit cards & loans', icon: '🏷️' }} existingGroups={[]} onSave={() => {}} onDelete={onDelete} onClose={() => {}} />);
    expect(screen.getByLabelText(/class/i).value).toBe('liability');
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('t1');
  });
});
