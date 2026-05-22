import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryEditor from './CategoryEditor.jsx';

const cat = {
  id: 'c1', name: 'Utilities', icon: '⚡', color: '#F59E0B',
  keywords: ['PEOPLES GAS'], templates: ['Gas'], builtin: true,
};

describe('CategoryEditor', () => {
  afterEach(() => cleanup());
  it('renders the category name in the input', () => {
    render(
      <CategoryEditor
        category={cat}
        itemCount={0}
        otherCategories={[]}
        onMoveAll={() => {}}
        onUpdate={() => {}}
        onAddKeyword={() => {}}
        onRemoveKeyword={() => {}}
        onAddTemplate={() => {}}
        onRemoveTemplate={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByDisplayValue('Utilities')).toBeTruthy();
  });

  it('offers a Transfer flow option', () => {
    render(
      <CategoryEditor
        category={cat} itemCount={0}
        otherCategories={[]} onMoveAll={() => {}}
        onUpdate={() => {}} onAddKeyword={() => {}} onRemoveKeyword={() => {}}
        onAddTemplate={() => {}} onRemoveTemplate={() => {}} onDelete={() => {}}
      />
    );
    expect(screen.getByRole('radio', { name: /transfer/i })).toBeTruthy();
  });

  it('renders existing keywords and templates as chips', () => {
    render(
      <CategoryEditor
        category={cat} itemCount={0}
        otherCategories={[]} onMoveAll={() => {}}
        onUpdate={() => {}} onAddKeyword={() => {}} onRemoveKeyword={() => {}}
        onAddTemplate={() => {}} onRemoveTemplate={() => {}} onDelete={() => {}}
      />
    );
    expect(screen.getByText('PEOPLES GAS')).toBeTruthy();
    expect(screen.getByText('Gas')).toBeTruthy();
  });

  it('calls onUpdate with new name on blur of name input', async () => {
    const onUpdate = vi.fn();
    render(
      <CategoryEditor
        category={cat} itemCount={0}
        otherCategories={[]} onMoveAll={() => {}}
        onUpdate={onUpdate} onAddKeyword={() => {}} onRemoveKeyword={() => {}}
        onAddTemplate={() => {}} onRemoveTemplate={() => {}} onDelete={() => {}}
      />
    );
    const nameInput = screen.getByDisplayValue('Utilities');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Power');
    nameInput.blur();
    expect(onUpdate).toHaveBeenCalledWith({ name: 'Power' });
  });

  it('does not call onUpdate when name becomes empty (shows error instead)', async () => {
    const onUpdate = vi.fn();
    render(
      <CategoryEditor
        category={cat} itemCount={0}
        otherCategories={[]} onMoveAll={() => {}}
        onUpdate={onUpdate} onAddKeyword={() => {}} onRemoveKeyword={() => {}}
        onAddTemplate={() => {}} onRemoveTemplate={() => {}} onDelete={() => {}}
      />
    );
    const nameInput = screen.getByDisplayValue('Utilities');
    await userEvent.clear(nameInput);
    nameInput.blur();
    expect(onUpdate).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/name required/i)).toBeTruthy();
    });
  });

  it('disables Delete button when itemCount > 0', () => {
    render(
      <CategoryEditor
        category={cat} itemCount={5}
        otherCategories={[]} onMoveAll={() => {}}
        onUpdate={() => {}} onAddKeyword={() => {}} onRemoveKeyword={() => {}}
        onAddTemplate={() => {}} onRemoveTemplate={() => {}} onDelete={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /delete/i }).disabled).toBe(true);
    expect(screen.getByText(/move 5 items to:/i)).toBeTruthy();
  });

  it('enables Delete button when itemCount === 0 and calls onDelete', async () => {
    const onDelete = vi.fn();
    render(
      <CategoryEditor
        category={cat} itemCount={0}
        otherCategories={[]} onMoveAll={() => {}}
        onUpdate={() => {}} onAddKeyword={() => {}} onRemoveKeyword={() => {}}
        onAddTemplate={() => {}} onRemoveTemplate={() => {}} onDelete={onDelete}
      />
    );
    const btn = screen.getByRole('button', { name: /delete/i });
    expect(btn.disabled).toBe(false);
    await userEvent.click(btn);
    expect(onDelete).toHaveBeenCalled();
  });

  it('shows move-all picker when itemCount > 0', () => {
    const otherCategories = [
      { id: 'c2', name: 'Other', icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true },
      { id: 'c3', name: 'Dining', icon: '🍽️', color: '#F97316', keywords: [], templates: [], builtin: true },
    ];
    render(
      <CategoryEditor
        category={cat} itemCount={3}
        otherCategories={otherCategories}
        onMoveAll={() => {}}
        onUpdate={() => {}} onAddKeyword={() => {}} onRemoveKeyword={() => {}}
        onAddTemplate={() => {}} onRemoveTemplate={() => {}} onDelete={() => {}}
      />
    );
    expect(screen.getByText(/move 3 items to:/i)).toBeTruthy();
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByRole('button', { name: /move all/i })).toBeTruthy();
  });

  it('Move all button calls onMoveAll with selected target id', async () => {
    const onMoveAll = vi.fn();
    const otherCategories = [
      { id: 'c2', name: 'Other', icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true },
      { id: 'c3', name: 'Dining', icon: '🍽️', color: '#F97316', keywords: [], templates: [], builtin: true },
    ];
    render(
      <CategoryEditor
        category={cat} itemCount={3}
        otherCategories={otherCategories}
        onMoveAll={onMoveAll}
        onUpdate={() => {}} onAddKeyword={() => {}} onRemoveKeyword={() => {}}
        onAddTemplate={() => {}} onRemoveTemplate={() => {}} onDelete={() => {}}
      />
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'c3');
    await userEvent.click(screen.getByRole('button', { name: /move all/i }));
    expect(onMoveAll).toHaveBeenCalledWith('c3');
  });

  it('renders flow segmented control with 3 options', () => {
    const category = { id: 'c1', name: 'Groceries', icon: '🛒', color: '#10B981', flow: 'expense', keywords: [], templates: [], builtin: true };
    render(
      <CategoryEditor
        category={category}
        itemCount={0}
        otherCategories={[]}
        onMoveAll={() => {}}
        onUpdate={() => {}}
        onAddKeyword={() => {}}
        onRemoveKeyword={() => {}}
        onAddTemplate={() => {}}
        onRemoveTemplate={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByRole('radio', { name: /income/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /expense/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /savings/i })).toBeTruthy();
  });

  it('changing flow on a category with zero items calls onUpdate immediately (no warning)', async () => {
    const onUpdate = vi.fn();
    const category = { id: 'c1', name: 'Hobby', icon: '🎨', color: '#fff', flow: 'expense', keywords: [], templates: [], builtin: false };
    render(
      <CategoryEditor
        category={category}
        itemCount={0}
        otherCategories={[]}
        onMoveAll={() => {}}
        onUpdate={onUpdate}
        onAddKeyword={() => {}}
        onRemoveKeyword={() => {}}
        onAddTemplate={() => {}}
        onRemoveTemplate={() => {}}
        onDelete={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('radio', { name: /income/i }));
    expect(onUpdate).toHaveBeenCalledWith({ flow: 'income' });
  });

  it('changing flow on a category with items shows warning before calling onUpdate', async () => {
    const onUpdate = vi.fn();
    const category = { id: 'c1', name: 'Cash Savings', icon: '🪙', color: '#fff', flow: 'savings', keywords: [], templates: [], builtin: true };
    render(
      <CategoryEditor
        category={category}
        itemCount={14}
        otherCategories={[]}
        onMoveAll={() => {}}
        onUpdate={onUpdate}
        onAddKeyword={() => {}}
        onRemoveKeyword={() => {}}
        onAddTemplate={() => {}}
        onRemoveTemplate={() => {}}
        onDelete={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('radio', { name: /expense/i }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/14 items/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onUpdate).toHaveBeenCalledWith({ flow: 'expense' });
  });
});
