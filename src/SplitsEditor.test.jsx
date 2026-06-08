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

  it('shows the running Total and no "updates amount" note when lines equal the parent amount', () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    expect(screen.getByText(/Total: -180\.00/)).toBeTruthy();
    expect(screen.queryByText(/updates amount/i)).toBeNull();
  });

  it('editing a line amount updates the Total and shows the "updates amount" note', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    const amount0 = screen.getAllByLabelText(/line amount/i)[0];
    await userEvent.type(amount0, '0'); // -100 becomes -1000; sum -1080
    expect(screen.getByText(/Total: -1080\.00/)).toBeTruthy();
    expect(screen.getByText(/updates amount from -180\.00/)).toBeTruthy();
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

  it('Delete is enabled at 2 lines and disabled once only 1 remains', async () => {
    setup();
    const deleteBtns = screen.getAllByRole('button', { name: /delete line/i });
    expect(deleteBtns[0].disabled).toBe(false);
    await userEvent.click(deleteBtns[0]); // drop to a single line
    expect(screen.getByRole('button', { name: /delete line/i }).disabled).toBe(true);
  });
});

describe('SplitsEditor Done with a single line', () => {
  afterEach(() => cleanup());

  it('collapses to that line as a normal category (splits: null)', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -180, categoryId: 'c_grocery', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toMatchObject({ splits: null, categoryId: 'c_grocery' });
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

describe('SplitsEditor per-line direction', () => {
  afterEach(() => cleanup());

  it('a negative line shows Out active and the magnitude as a positive number', () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    const outBtns = screen.getAllByRole('button', { name: /line out/i });
    expect(outBtns[0].className).toContain('active');
    const amounts = screen.getAllByLabelText(/line amount/i);
    expect(Number(amounts[0].value)).toBe(100);
  });

  it('flipping a line to In flips its committed sign (Total reflects it)', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    const inBtns = screen.getAllByRole('button', { name: /line in/i });
    await userEvent.click(inBtns[0]); // s1 becomes +100; sum = +20
    expect(screen.getByText(/Total: 20\.00/)).toBeTruthy();
  });

  it('a freshly added line defaults to Out, so a typed magnitude becomes negative (Total reflects it)', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /add line/i }));
    const amounts = screen.getAllByLabelText(/line amount/i);
    await userEvent.type(amounts[2], '50'); // new line, Out default → -50; sum = -230
    expect(screen.getByText(/Total: -230\.00/)).toBeTruthy();
  });
});

describe('SplitsEditor Done validation and Unsplit', () => {
  afterEach(() => cleanup());

  it('Done with lines that do not sum to the parent amount calls onDone directly (no confirm)', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0].splits).toHaveLength(2);
    expect(onDone.mock.calls[0][0].splits.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(-130, 5);
    expect(screen.queryByText(/will be added as an/i)).toBeNull();
  });

  it('does not render an "Add remainder as line" button', () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    expect(screen.queryByRole('button', { name: /add remainder/i })).toBeNull();
  });

  it('Done stays direct when already balanced (no confirm prompt)', async () => {
    const { onDone } = setup(); // default -100 / -80 = -180, balanced
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/will be added as an/i)).toBeNull();
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
