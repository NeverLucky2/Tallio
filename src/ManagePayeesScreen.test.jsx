// src/ManagePayeesScreen.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import ManagePayeesScreen from './ManagePayeesScreen.jsx';

const payees = [
  { id: 'p1', name: 'Costco', defaultCategoryId: 'c1', defaultSubcategoryId: null },
  { id: 'p2', name: 'costco warehouse', defaultCategoryId: null, defaultSubcategoryId: null },
  { id: 'p3', name: 'Shell', defaultCategoryId: null, defaultSubcategoryId: null },
];
const categories = [{ id: 'c1', name: 'Groceries', flow: 'expense', icon: '🛒', subcategories: [] }];
const transactions = [
  { id: 't1', accountId: 'a1', date: '2026-01-05', amount: -10, categoryId: 'c1', description: '', payeeId: 'p1', checkNumber: null, transferId: null },
  { id: 't2', accountId: 'a1', date: '2026-01-06', amount: -20, categoryId: 'c1', description: '', payeeId: 'p1', checkNumber: null, transferId: null },
  { id: 't3', accountId: 'a1', date: '2026-01-07', amount: -30, categoryId: 'c1', description: '', payeeId: 'p3', checkNumber: null, transferId: null },
];

const base = {
  payees, transactions, categories,
  onClose: () => {}, onRename: () => ({ ok: true }), onSetDefaultCategory: () => {},
  onMerge: () => {}, onDelete: () => {}, onUndo: () => {}, undoCount: 0,
};

const rowFor = (name) => screen.getByText(name).closest('li');

describe('ManagePayeesScreen', () => {
  beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { vi.restoreAllMocks(); cleanup(); });

  it('lists payees alphabetically with usage counts and default chips, filterable by search', () => {
    render(<ManagePayeesScreen {...base} />);
    expect(within(rowFor('Costco')).getByText('2 uses')).toBeTruthy();
    expect(within(rowFor('Costco')).getByText(/Groceries/)).toBeTruthy();
    expect(within(rowFor('Shell')).getByText('1 use')).toBeTruthy();
    expect(within(rowFor('costco warehouse')).getByText('0 uses')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search payees'), { target: { value: 'shell' } });
    expect(screen.queryByText('Costco')).toBeNull();
    expect(screen.getByText('Shell')).toBeTruthy();
  });

  it('renames inline, surfacing a duplicate-name rejection', () => {
    const onRename = vi.fn()
      .mockReturnValueOnce({ ok: false, reason: 'duplicate', conflictId: 'p1' })
      .mockReturnValueOnce({ ok: true });
    render(<ManagePayeesScreen {...base} onRename={onRename} />);
    fireEvent.click(within(rowFor('Shell')).getByRole('button', { name: 'Payee actions for Shell' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByLabelText('Rename payee');
    fireEvent.change(input, { target: { value: 'Costco' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('p3', 'Costco');
    expect(screen.getByRole('alert').textContent).toMatch(/already exists/i);
    fireEvent.change(screen.getByLabelText('Rename payee'), { target: { value: 'Chevron' } });
    fireEvent.keyDown(screen.getByLabelText('Rename payee'), { key: 'Enter' });
    expect(onRename).toHaveBeenLastCalledWith('p3', 'Chevron');
  });

  it('sets a default category through the tree picker', () => {
    const onSetDefaultCategory = vi.fn();
    render(<ManagePayeesScreen {...base} onSetDefaultCategory={onSetDefaultCategory} />);
    fireEvent.click(within(rowFor('Shell')).getByRole('button', { name: 'Payee actions for Shell' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Set default category' }));
    fireEvent.click(screen.getByRole('button', { name: 'Default category for Shell' }));
    fireEvent.click(screen.getByText(/Groceries/, { selector: '.cat-picker-opt-name' }));
    expect(onSetDefaultCategory).toHaveBeenCalledWith('p3', 'c1', null);
  });

  it('merge picks a target (self excluded) and calls onMerge(source, target)', () => {
    const onMerge = vi.fn();
    render(<ManagePayeesScreen {...base} onMerge={onMerge} />);
    fireEvent.click(within(rowFor('costco warehouse')).getByRole('button', { name: 'Payee actions for costco warehouse' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Merge into…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge target' }));
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).queryByText('costco warehouse')).toBeNull(); // self excluded
    fireEvent.click(within(listbox).getByText('Costco'));
    fireEvent.click(screen.getByRole('button', { name: /^merge$/i }));
    expect(onMerge).toHaveBeenCalledWith('p2', 'p1');
  });

  it('delete confirms with the usage count and calls onDelete', () => {
    const onDelete = vi.fn();
    render(<ManagePayeesScreen {...base} onDelete={onDelete} />);
    fireEvent.click(within(rowFor('Costco')).getByRole('button', { name: 'Payee actions for Costco' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2'));
    expect(onDelete).toHaveBeenCalledWith('p1');
  });

  it('delete does nothing when the confirm is declined', () => {
    window.confirm.mockReturnValue(false);
    const onDelete = vi.fn();
    render(<ManagePayeesScreen {...base} onDelete={onDelete} />);
    fireEvent.click(within(rowFor('Costco')).getByRole('button', { name: 'Payee actions for Costco' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
