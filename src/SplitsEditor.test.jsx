// src/SplitsEditor.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SplitsEditor from './SplitsEditor.jsx';

const categories = [
  { id: 'c_grocery',   name: 'Groceries', icon: '🛒', flow: 'expense' },
  { id: 'c_household', name: 'Household', icon: '🧴', flow: 'expense' },
];
const accounts = [
  { id: 'a_chase', name: 'Chase',  type: 'bank' },
  { id: 'a_cash',  name: 'Cash',   type: 'bank' },
];

function setup(props = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  render(
    <SplitsEditor
      parentAccountId="a_chase"
      parentAmount={-180}
      parentPayee="Costco"
      parentDate="2026-05-20"
      categories={categories}
      accounts={accounts}
      initialSplits={props.initialSplits ?? [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: 'Groceries' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: 'Soap' },
      ]}
      initialSplitTargets={props.initialSplitTargets ?? new Map()}
      onDone={onDone}
      onCancel={onCancel}
    />
  );
  return { onDone, onCancel };
}

describe('SplitsEditor', () => {
  afterEach(() => cleanup());

  it('renders one row per initial split line', () => {
    setup();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 lines
  });

  it('shows the parent header (payee + date)', () => {
    setup();
    expect(screen.getByText(/Costco/)).toBeTruthy();
    expect(screen.getByText(/2026-05-20/)).toBeTruthy();
  });

  it('Cancel fires onCancel without returning lines', async () => {
    const { onCancel, onDone } = setup();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
