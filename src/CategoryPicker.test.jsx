import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryPicker from './CategoryPicker.jsx';

const categories = [
  { id: 'tax', name: 'Taxes', icon: '🏛️', flow: 'expense', subcategories: [
    { id: 'fed', name: 'Federal Tax', keywords: [] },
  ] },
  { id: 'gro', name: 'Groceries', icon: '🛒', flow: 'expense', subcategories: [] },
];

function setup(value = { categoryId: 'gro', subId: null }) {
  const onChange = vi.fn();
  render(<CategoryPicker categories={categories} value={value} onChange={onChange} ariaLabel="Category" />);
  return { onChange };
}

describe('CategoryPicker', () => {
  afterEach(() => cleanup());

  it('shows the current selection on the trigger', () => {
    setup({ categoryId: 'tax', subId: 'fed' });
    expect(screen.getByRole('button', { name: /category/i }).textContent).toMatch(/Taxes › Federal Tax/);
  });

  it('opens and lists categories and indented subs', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    expect(screen.getByText('Taxes')).toBeTruthy();
    expect(screen.getByText('Federal Tax')).toBeTruthy();
  });

  it('typing filters to a matching sub and its parent', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.type(screen.getByRole('combobox'), 'federal');
    expect(screen.getByText('Federal Tax')).toBeTruthy();
    expect(screen.queryByText('Groceries')).toBeNull();
  });

  it('selecting a parent emits {categoryId, subId:null}', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.click(screen.getByText('Taxes'));
    expect(onChange).toHaveBeenCalledWith({ categoryId: 'tax', subId: null });
  });

  it('selecting a sub emits {categoryId:parent, subId}', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.click(screen.getByText('Federal Tax'));
    expect(onChange).toHaveBeenCalledWith({ categoryId: 'tax', subId: 'fed' });
  });
});

describe('CategoryPicker — inline create category', () => {
  afterEach(() => cleanup());

  it('shows a create footer for an unknown query and creates + selects', async () => {
    const onChange = vi.fn();
    const onCreateCategory = vi.fn(() => 'new1');
    render(<CategoryPicker categories={categories} value={{ categoryId: 'gro', subId: null }}
      onChange={onChange} ariaLabel="Category" onCreateCategory={onCreateCategory} createFlow="expense" />);
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.type(screen.getByRole('combobox'), 'Vet bills');
    await userEvent.click(screen.getByRole('button', { name: /new category .*vet bills/i }));
    // quick dialog appears, prefilled; submit it
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onCreateCategory).toHaveBeenCalledWith({ name: 'Vet bills', icon: '📋', flow: 'expense' });
    expect(onChange).toHaveBeenCalledWith({ categoryId: 'new1', subId: null });
  });

  it('does not show the create footer when the query exactly matches an existing name', async () => {
    render(<CategoryPicker categories={categories} value={{ categoryId: 'gro', subId: null }}
      onChange={vi.fn()} ariaLabel="Category" onCreateCategory={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.type(screen.getByRole('combobox'), 'Groceries');
    expect(screen.queryByRole('button', { name: /new category/i })).toBeNull();
  });

  it('shows no create footer when onCreateCategory is absent (back-compat)', async () => {
    render(<CategoryPicker categories={categories} value={{ categoryId: 'gro', subId: null }}
      onChange={vi.fn()} ariaLabel="Category" />);
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.type(screen.getByRole('combobox'), 'Zzz');
    expect(screen.queryByRole('button', { name: /new category/i })).toBeNull();
  });
});

describe('CategoryPicker — inline create sub-category', () => {
  afterEach(() => cleanup());

  it('adds a sub under a parent and selects it', async () => {
    const onChange = vi.fn();
    const onCreateSub = vi.fn(() => 'sub9');
    render(<CategoryPicker categories={categories} value={{ categoryId: 'gro', subId: null }}
      onChange={onChange} ariaLabel="Category" onCreateSub={onCreateSub} />);
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.click(screen.getByRole('button', { name: /add sub-category to groceries/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /new sub-category under groceries/i }), 'Produce');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onCreateSub).toHaveBeenCalledWith('gro', { name: 'Produce' });
    expect(onChange).toHaveBeenCalledWith({ categoryId: 'gro', subId: 'sub9' });
  });

  it('shows no "＋ sub" affordance when onCreateSub is absent (back-compat)', async () => {
    render(<CategoryPicker categories={categories} value={{ categoryId: 'gro', subId: null }}
      onChange={vi.fn()} ariaLabel="Category" />);
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    expect(screen.queryByRole('button', { name: /add sub-category/i })).toBeNull();
  });
});

describe('CategoryPicker — viewport-aware drop direction', () => {
  afterEach(() => cleanup());

  function setupWithRect(rect) {
    render(<CategoryPicker categories={categories} value={{ categoryId: 'gro', subId: null }}
      onChange={vi.fn()} ariaLabel="Category" />);
    const trigger = screen.getByRole('button', { name: /category/i });
    trigger.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, toJSON() {} });
    return trigger;
  }

  it('opens upward when the trigger sits near the bottom of the viewport', async () => {
    window.innerHeight = 768;
    const trigger = setupWithRect({ top: 700, bottom: 740, left: 0, right: 300, width: 300, height: 40 });
    await userEvent.click(trigger);
    expect(document.querySelector('.cat-picker-popover').className).toMatch(/drop-up/);
  });

  it('opens downward when there is room below', async () => {
    window.innerHeight = 768;
    const trigger = setupWithRect({ top: 60, bottom: 100, left: 0, right: 300, width: 300, height: 40 });
    await userEvent.click(trigger);
    expect(document.querySelector('.cat-picker-popover').className).not.toMatch(/drop-up/);
  });
});

describe('CategoryPicker — allowNone', () => {
  afterEach(() => cleanup());

  it('renders a None row that emits nulls, and labels the trigger when empty', async () => {
    const onChange = vi.fn();
    render(<CategoryPicker categories={categories} value={{ categoryId: null, subId: null }}
      onChange={onChange} ariaLabel="Type" allowNone noneLabel="— None —" />);
    // trigger shows the none label
    expect(screen.getByRole('button', { name: /type/i }).textContent).toMatch(/—\s*None\s*—/);
    await userEvent.click(screen.getByRole('button', { name: /type/i }));
    await userEvent.click(screen.getByRole('option', { name: /—\s*None\s*—/i }));
    expect(onChange).toHaveBeenCalledWith({ categoryId: null, subId: null });
  });
});
