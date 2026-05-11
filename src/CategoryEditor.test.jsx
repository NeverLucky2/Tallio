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

  it('renders existing keywords and templates as chips', () => {
    render(
      <CategoryEditor
        category={cat} itemCount={0}
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
        onUpdate={() => {}} onAddKeyword={() => {}} onRemoveKeyword={() => {}}
        onAddTemplate={() => {}} onRemoveTemplate={() => {}} onDelete={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /delete/i }).disabled).toBe(true);
    expect(screen.getByText(/move 5 items/i)).toBeTruthy();
  });

  it('enables Delete button when itemCount === 0 and calls onDelete', async () => {
    const onDelete = vi.fn();
    render(
      <CategoryEditor
        category={cat} itemCount={0}
        onUpdate={() => {}} onAddKeyword={() => {}} onRemoveKeyword={() => {}}
        onAddTemplate={() => {}} onRemoveTemplate={() => {}} onDelete={onDelete}
      />
    );
    const btn = screen.getByRole('button', { name: /delete/i });
    expect(btn.disabled).toBe(false);
    await userEvent.click(btn);
    expect(onDelete).toHaveBeenCalled();
  });
});
