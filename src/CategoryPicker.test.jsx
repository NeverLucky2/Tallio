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
