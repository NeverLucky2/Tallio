import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChipEditor from './ChipEditor.jsx';

describe('ChipEditor', () => {
  afterEach(() => cleanup());

  it('renders existing chips', () => {
    render(<ChipEditor values={['A', 'B', 'C']} onAdd={() => {}} onRemove={() => {}} placeholder="add" />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
  });

  it('calls onAdd with the typed value when Enter is pressed', async () => {
    const onAdd = vi.fn();
    render(<ChipEditor values={[]} onAdd={onAdd} onRemove={() => {}} placeholder="add" />);
    const input = screen.getByPlaceholderText('add');
    await userEvent.type(input, 'NEW{enter}');
    expect(onAdd).toHaveBeenCalledWith('NEW');
  });

  it('does not call onAdd for whitespace-only input', async () => {
    const onAdd = vi.fn();
    render(<ChipEditor values={[]} onAdd={onAdd} onRemove={() => {}} placeholder="add" />);
    const input = screen.getByPlaceholderText('add');
    await userEvent.type(input, '   {enter}');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('calls onRemove when × is clicked on a chip', async () => {
    const onRemove = vi.fn();
    render(<ChipEditor values={['A', 'B']} onAdd={() => {}} onRemove={onRemove} placeholder="add" />);
    const removeButtons = screen.getAllByLabelText(/remove/i);
    await userEvent.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith('A');
  });

  it('clears the input after a successful add', async () => {
    const onAdd = vi.fn();
    render(<ChipEditor values={[]} onAdd={onAdd} onRemove={() => {}} placeholder="add" />);
    const input = screen.getByPlaceholderText('add');
    await userEvent.type(input, 'X{enter}');
    expect(input.value).toBe('');
  });
});
