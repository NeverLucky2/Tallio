import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ManageCategoriesScreen from './ManageCategoriesScreen.jsx';

const cats = [
  { id: 'c1', name: 'Utilities', icon: '⚡', color: '#F59E0B', keywords: [], templates: [], builtin: true },
  { id: 'c2', name: 'Dining',    icon: '🍽️', color: '#F97316', keywords: [], templates: [], builtin: true },
];

const noopProps = {
  onClose: () => {},
  onAddCategory: () => 'cNEW',
  onUpdateCategory: () => {},
  onDeleteCategory: () => ({ deleted: true, itemCount: 0 }),
  onAddKeyword: () => ({ added: true, matchingItems: [] }),
  onRemoveKeyword: () => {},
  onAddTemplate: () => {},
  onRemoveTemplate: () => {},
  onMoveAll: () => {},
  bills: [],
};

describe('ManageCategoriesScreen', () => {
  afterEach(() => cleanup());

  it('renders all categories in the list', () => {
    render(<ManageCategoriesScreen categories={cats} {...noopProps} />);
    expect(screen.getByText('Utilities')).toBeTruthy();
    expect(screen.getByText('Dining')).toBeTruthy();
  });

  it('groups transfer-flow categories under a transfer group', () => {
    const withTransfer = [...cats, { id: 'tc', name: 'Credit Card Payment', icon: '💳', color: '#d4a853', keywords: [], templates: [], flow: 'transfer', builtin: true }];
    render(<ManageCategoriesScreen categories={withTransfer} {...noopProps} />);
    expect(screen.getByText('Credit Card Payment')).toBeTruthy();
    expect(screen.getByText('transfer')).toBeTruthy(); // flow group label
  });

  it('selects the first category by default', () => {
    render(<ManageCategoriesScreen categories={cats} {...noopProps} />);
    expect(screen.getByText(/editing: utilities/i)).toBeTruthy();
  });

  it('switches editor when a different list row is clicked', async () => {
    render(<ManageCategoriesScreen categories={cats} {...noopProps} />);
    await userEvent.click(screen.getByText('Dining'));
    expect(screen.getByText(/editing: dining/i)).toBeTruthy();
  });

  it('calls onClose when Back is clicked', async () => {
    const onClose = vi.fn();
    render(<ManageCategoriesScreen categories={cats} {...noopProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onAddCategory and selects the new one', async () => {
    const onAddCategory = vi.fn(() => 'cNEW');
    const newCats = [...cats, { id: 'cNEW', name: 'New Category', icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: false }];
    const { rerender } = render(<ManageCategoriesScreen categories={cats} {...noopProps} onAddCategory={onAddCategory} />);
    await userEvent.click(screen.getByRole('button', { name: /\+ add category/i }));
    expect(onAddCategory).toHaveBeenCalled();
    rerender(<ManageCategoriesScreen categories={newCats} {...noopProps} onAddCategory={onAddCategory} />);
    expect(screen.getByText(/editing: new category/i)).toBeTruthy();
  });

  it('shows item counts next to each category in the list', () => {
    const bills = [{ id: 'b1', items: [
      { id: 'i1', categoryId: 'c1' },
      { id: 'i2', categoryId: 'c1' },
      { id: 'i3', categoryId: 'c2' },
    ]}];
    render(<ManageCategoriesScreen categories={cats} {...noopProps} bills={bills} />);
    // Render uses "(N)" suffix on rows.
    expect(screen.getByText('Utilities').parentElement.textContent).toContain('2');
    expect(screen.getByText('Dining').parentElement.textContent).toContain('1');
  });
});
