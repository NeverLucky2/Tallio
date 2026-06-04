import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubcategoryEditor from './SubcategoryEditor.jsx';

const category = { id: 'c1', name: 'Taxes' };
const sub = { id: 's1', name: 'Federal Tax', keywords: ['FEDERAL TAX'] };

function setup(overrides = {}) {
  const props = {
    category, sub,
    onBack: vi.fn(), onUpdate: vi.fn(),
    onAddKeyword: vi.fn(), onRemoveKeyword: vi.fn(), onDelete: vi.fn(),
    ...overrides,
  };
  render(<SubcategoryEditor {...props} />);
  return props;
}

describe('SubcategoryEditor', () => {
  afterEach(() => cleanup());

  it('shows the breadcrumb and the parent › sub path', () => {
    setup();
    expect(screen.getByRole('button', { name: /back to taxes/i })).toBeTruthy();
    expect(screen.getByText(/taxes › federal tax/i)).toBeTruthy();
  });

  it('commits a renamed sub on blur', async () => {
    const { onUpdate } = setup();
    const input = screen.getByDisplayValue('Federal Tax');
    await userEvent.clear(input);
    await userEvent.type(input, 'Fed Tax');
    await userEvent.tab();
    expect(onUpdate).toHaveBeenCalledWith({ name: 'Fed Tax' });
  });

  it('calls onBack and onDelete', async () => {
    const { onBack, onDelete } = setup();
    await userEvent.click(screen.getByRole('button', { name: /back to taxes/i }));
    expect(onBack).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /delete sub-category/i }));
    expect(onDelete).toHaveBeenCalled();
  });
});
