import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillItem from './BillItem.jsx';

afterEach(() => cleanup());

const cats = [
  { id: 'c_util',  name: 'Utilities', icon: '⚡', color: '#F59E0B', keywords: [], templates: ['Gas', 'Electric'], builtin: true },
  { id: 'c_other', name: 'Other',     icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true },
];

const bill = { id: 'b1', vendor: 'V', month: '2026-04', items: [] };

function renderItem(overrides = {}) {
  const item = {
    id: 'i1',
    description: '',
    amount: 10,
    categoryId: 'c_util',
    date: '2026-04-15',
    ...overrides.item,
  };
  const onUpdate = overrides.onUpdate || vi.fn();
  const onDelete = overrides.onDelete || vi.fn();
  return {
    onUpdate, onDelete, item,
    ...render(
      <BillItem
        item={item}
        bill={bill}
        categories={cats}
        otherCategoryId="c_other"
        onUpdate={onUpdate}
        onDelete={onDelete}
        isMobile={false}
      />
    ),
  };
}

describe('BillItem', () => {
  it('renders the description input with the current value', () => {
    renderItem({ item: { description: 'Hello' } });
    expect(screen.getByDisplayValue('Hello')).toBeTruthy();
  });

  it('renders template chips when the selected category has templates', () => {
    renderItem();
    expect(screen.getByRole('button', { name: 'Gas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Electric' })).toBeTruthy();
  });

  it('does not render a chip row when the category has no templates', () => {
    renderItem({ item: { categoryId: 'c_other' } });
    expect(screen.queryByRole('button', { name: 'Gas' })).toBeNull();
  });

  it('clicking a template chip calls onUpdate with description filled', async () => {
    const { onUpdate, item } = renderItem();
    await userEvent.click(screen.getByRole('button', { name: 'Gas' }));
    expect(onUpdate).toHaveBeenCalledWith({ ...item, description: 'Gas' });
  });

  it('falls back to Other category visuals when categoryId is unknown', () => {
    renderItem({ item: { categoryId: 'unknown-id' } });
    // No crash; renders icon from fallback (Other = 📋)
    expect(screen.getByText('📋')).toBeTruthy();
  });

  it('renders mobile layout when isMobile is true', () => {
    const item = { id: 'i1', description: '', amount: 10, categoryId: 'c_util', date: '2026-04-15' };
    render(
      <BillItem
        item={item}
        bill={bill}
        categories={cats}
        otherCategoryId="c_other"
        onUpdate={() => {}}
        onDelete={() => {}}
        isMobile={true}
      />
    );
    // Mobile layout uses item-row-mobile class.
    expect(document.querySelector('.item-row-mobile')).toBeTruthy();
  });
});
