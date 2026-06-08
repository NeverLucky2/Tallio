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

describe('SubcategoryEditor create mode', () => {
  afterEach(() => cleanup());

  function setupCreate(overrides = {}) {
    const props = { category, creating: true, onCreate: vi.fn(), onCancel: vi.fn(), ...overrides };
    render(<SubcategoryEditor {...props} />);
    return props;
  }

  it('Save is disabled until a name is typed, then calls onCreate with the trimmed name', async () => {
    const { onCreate } = setupCreate();
    expect(screen.getByRole('button', { name: /^save$/i }).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Mike');
    expect(screen.getByRole('button', { name: /^save$/i }).disabled).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onCreate).toHaveBeenCalledWith('Mike');
  });

  it('Cancel with no typed name calls onCancel', async () => {
    const { onCancel } = setupCreate();
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('SubcategoryEditor edit-mode save feedback', () => {
  afterEach(() => cleanup());

  it('shows "✓ Saved" when unchanged and a Save button once the name is edited', async () => {
    setup();
    expect(screen.getByText('✓ Saved')).toBeTruthy();
    await userEvent.type(screen.getByDisplayValue('Federal Tax'), '!');
    expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy();
    expect(screen.queryByText('✓ Saved')).toBeNull();
  });

  it('clicking Save commits the name via onUpdate', async () => {
    const { onUpdate } = setup();
    const input = screen.getByDisplayValue('Federal Tax');
    await userEvent.clear(input);
    await userEvent.type(input, 'Fed Tax');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onUpdate).toHaveBeenCalledWith({ name: 'Fed Tax' });
  });
});
