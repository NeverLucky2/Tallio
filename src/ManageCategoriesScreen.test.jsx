import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
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
  onAddSub: () => 's1',
  onUpdateSub: () => {},
  onDeleteSub: () => {},
  onAddSubKeyword: () => {},
  onRemoveSubKeyword: () => {},
  onPromoteKeyword: () => {},
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

  it('renders an Undo button that enables on undoCount and calls onUndo', async () => {
    const onUndo = vi.fn();
    render(<ManageCategoriesScreen categories={cats} {...noopProps} onUndo={onUndo} undoCount={2} />);
    const btn = screen.getByRole('button', { name: /undo/i });
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('↩ Undo (2)');
    await userEvent.click(btn);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('filters the list by the search box (matching category and sub names)', async () => {
    const withSubs = [
      { id: 'c1', name: 'Taxes', icon: '🏛️', color: '#EAB308', keywords: [], templates: [], builtin: true,
        subcategories: [{ id: 's1', name: 'Federal Tax', keywords: [] }] },
      { id: 'c2', name: 'Groceries', icon: '🛒', color: '#10B981', keywords: [], templates: [], builtin: true, subcategories: [] },
    ];
    render(<ManageCategoriesScreen categories={withSubs} {...noopProps} />);
    await userEvent.type(screen.getByPlaceholderText(/search categories/i), 'federal');
    const list = document.querySelector('.manage-list');
    expect(list.textContent).toContain('Taxes');
    expect(list.textContent).not.toContain('Groceries');
  });

  it('renders sub-categories as a tree under their parent in the list', () => {
    const withSubs = [
      { id: 'c1', name: 'Taxes', icon: '🏛️', color: '#EAB308', keywords: [], templates: [], builtin: true,
        subcategories: [{ id: 's1', name: 'Federal Tax', keywords: [] }, { id: 's2', name: 'State Tax', keywords: [] }] },
    ];
    render(<ManageCategoriesScreen categories={withSubs} {...noopProps} />);
    const list = document.querySelector('.manage-list');
    expect(within(list).getByText('Federal Tax')).toBeTruthy();
    expect(within(list).getByText('State Tax')).toBeTruthy();
  });

  it('drills into a sub-category from the list tree and back', async () => {
    const withSubs = [
      { id: 'c1', name: 'Taxes', icon: '🏛️', color: '#EAB308', keywords: [], templates: [], builtin: true,
        subcategories: [{ id: 's1', name: 'Federal Tax', keywords: [] }] },
    ];
    render(<ManageCategoriesScreen categories={withSubs} {...noopProps} />);
    const list = document.querySelector('.manage-list');
    await userEvent.click(within(list).getByText('Federal Tax'));
    expect(screen.getByText(/taxes › federal tax/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /back to taxes/i }));
    expect(screen.getByText(/editing: taxes/i)).toBeTruthy();
  });
});

describe('ManageCategoriesScreen sub-category create flow', () => {
  afterEach(() => cleanup());

  it('"+ Add sub-category" enters create mode without adding a sub yet', async () => {
    const onAddSub = vi.fn(() => 'sNEW');
    render(<ManageCategoriesScreen categories={cats} {...noopProps} onAddSub={onAddSub} />);
    await userEvent.click(screen.getByRole('button', { name: /\+ add sub-category/i }));
    expect(screen.getByText(/\(new sub-category\)/i)).toBeTruthy();
    expect(onAddSub).not.toHaveBeenCalled();
  });

  it('typing a name and Save creates the sub via onAddSub', async () => {
    const onAddSub = vi.fn(() => 'sNEW');
    render(<ManageCategoriesScreen categories={cats} {...noopProps} onAddSub={onAddSub} />);
    await userEvent.click(screen.getByRole('button', { name: /\+ add sub-category/i }));
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Mike');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onAddSub).toHaveBeenCalledWith('c1', { name: 'Mike' });
  });

  it('Cancel in create mode adds nothing and returns to the category editor', async () => {
    const onAddSub = vi.fn(() => 'sNEW');
    render(<ManageCategoriesScreen categories={cats} {...noopProps} onAddSub={onAddSub} />);
    await userEvent.click(screen.getByRole('button', { name: /\+ add sub-category/i }));
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onAddSub).not.toHaveBeenCalled();
    expect(screen.getByText(/editing: utilities/i)).toBeTruthy();
  });
});
