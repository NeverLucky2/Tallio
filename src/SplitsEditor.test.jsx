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
      categories={props.categories ?? categories}
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

  it('the status bar shows Balanced when lines sum to the parent amount', () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    expect(screen.getByText(/Balanced/)).toBeTruthy();
    expect(screen.getByText(/Lines: -180\.00/)).toBeTruthy();
  });

  it('editing an amount surfaces the signed remaining-to-allocate amount', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    const amount0 = screen.getAllByLabelText(/line amount/i)[0];
    await userEvent.type(amount0, '0'); // -100 becomes -1000; sum -1080; remaining +900
    expect(screen.getByText(/Remaining to allocate: \+900\.00/)).toBeTruthy();
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

describe('SplitsEditor category grouping', () => {
  afterEach(() => cleanup());

  it('renders category options grouped into flow optgroups', () => {
    setup();
    const labels = [...document.querySelectorAll('optgroup')].map(g => g.label);
    expect(labels).toContain('Expense');
  });
});

describe('SplitsEditor remainder allocation', () => {
  afterEach(() => cleanup());

  it('"+ Add remainder as line" appends a line equal to the remainder and balances', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' }, // sum -130, parent -180, remaining -50
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    expect(screen.getByText(/Remaining to allocate: -50\.00/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /add remainder as line/i }));
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 lines
    expect(screen.getByText(/Balanced/)).toBeTruthy();
  });
});

describe('SplitsEditor Done validation and Unsplit', () => {
  afterEach(() => cleanup());

  it('Done with an unallocated remainder asks to confirm adding an Other line (no error, no onDone yet)', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' }, // sum -130, parent -180
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText(/will be added as an/i)).toBeTruthy();
  });

  it('Done stays direct when already balanced (no confirm prompt)', async () => {
    const { onDone } = setup(); // default -100 / -80 = -180, balanced
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/will be added as an/i)).toBeNull();
  });

  it('confirm "Go back to edit" dismisses the prompt without calling onDone', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    await userEvent.click(screen.getByRole('button', { name: /go back to edit/i }));
    expect(screen.queryByText(/will be added as an/i)).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('confirm "OK, add it" appends an Other line and calls onDone with balanced splits', async () => {
    const cats = [...categories, { id: 'c_other', name: 'Other', icon: '📋', flow: 'expense' }];
    const { onDone } = setup({
      categories: cats,
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' }, // remaining -50
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    await userEvent.click(screen.getByRole('button', { name: /ok, add it/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    const payload = onDone.mock.calls[0][0];
    expect(payload.splits).toHaveLength(3);
    const added = payload.splits[2];
    expect(added.categoryId).toBe('c_other');
    expect(added.amount).toBeCloseTo(-50, 5);
    expect(payload.splits.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(-180, 5);
  });

  it('Done succeeds when the sum matches', async () => {
    const { onDone } = setup();
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Unsplit calls onDone with splits cleared and parent.categoryId set to the largest category line', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount:  -80, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount: -100, categoryId: 'c_household', description: '' },
      ],
    });
    window.confirm = vi.fn(() => true);
    await userEvent.click(screen.getByRole('button', { name: /unsplit/i }));
    expect(onDone.mock.calls[0][0]).toMatchObject({ splits: null, categoryId: 'c_household' });
  });

  it('Unsplit is disabled when every line is a transfer (no category to promote)', () => {
    setup({
      initialSplits: [
        { id: 's1', amount:  -50, transferId: 'tr1', description: '' },
        { id: 's2', amount: -130, transferId: 'tr2', description: '' },
      ],
    });
    expect(screen.getByRole('button', { name: /unsplit/i }).disabled).toBe(true);
  });
});
