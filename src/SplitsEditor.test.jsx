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

describe('SplitsEditor editing', () => {
  afterEach(() => cleanup());

  it('editing an amount input updates the sum footer', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    // Initial sum is -100 + -80 = -180, matches parentAmount → ok.
    expect(screen.getByText(/Sum of lines: -180\.00/)).toBeTruthy();
    // Bump line 1 up so sum stops matching.
    const amount0 = screen.getAllByLabelText(/line amount/i)[0];
    await userEvent.type(amount0, '0'); // -100 becomes -1000
    expect(screen.getByText(/Sum of lines: -1080\.00/)).toBeTruthy();
  });

  it('flipping a row from Category to Transfer swaps picker controls', async () => {
    setup();
    const transferBtns = screen.getAllByRole('button', { name: /^transfer$/i });
    await userEvent.click(transferBtns[0]); // first line becomes Transfer
    expect(screen.getAllByLabelText(/target account/i)).toHaveLength(1);
  });

  it('selecting a category sets the line\'s categoryId', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    const selects = screen.getAllByLabelText(/^category$/i);
    await userEvent.selectOptions(selects[0], 'c_household');
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone.mock.calls[0][0].splits[0].categoryId).toBe('c_household');
  });

  it('selecting a transfer target sets the target in splitTargets', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery', description: '' },
        { id: 's2', amount:  -80, transferId: 'tr1',       description: '' },
      ],
      initialSplitTargets: new Map([['s2', '']]),
    });
    const select = screen.getByLabelText(/target account/i);
    await userEvent.selectOptions(select, 'a_cash');
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone.mock.calls[0][0].splitTargets.get('s2')).toBe('a_cash');
  });

  it('per-line description editing flows through to onDone payload', async () => {
    const { onDone } = setup();
    const descInputs = screen.getAllByLabelText(/line description/i);
    await userEvent.type(descInputs[0], 'Solar panels');
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone.mock.calls[0][0].splits[0].description).toContain('Solar panels');
  });
});

describe('SplitsEditor +Add / ×Delete', () => {
  afterEach(() => cleanup());

  it('Add line appends a row', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /add line/i }));
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 lines
  });

  it('Delete line removes a row', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -60, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount: -60, categoryId: 'c_household', description: '' },
        { id: 's3', amount: -60, categoryId: 'c_household', description: '' },
      ],
    });
    const deleteBtns = screen.getAllByRole('button', { name: /delete line/i });
    await userEvent.click(deleteBtns[0]);
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 remaining
  });

  it('Delete is disabled when there are exactly 2 lines', () => {
    setup();
    const deleteBtns = screen.getAllByRole('button', { name: /delete line/i });
    expect(deleteBtns[0].disabled).toBe(true);
    expect(deleteBtns[1].disabled).toBe(true);
  });
});
