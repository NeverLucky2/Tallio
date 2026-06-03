import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UndoButton from './UndoButton.jsx';

describe('UndoButton', () => {
  afterEach(() => cleanup());

  it('is disabled and label-only at count 0', () => {
    render(<UndoButton count={0} onUndo={() => {}} />);
    const btn = screen.getByRole('button', { name: /undo/i });
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('↩ Undo');
  });

  it('shows the count, is enabled, and calls onUndo when clicked', async () => {
    const onUndo = vi.fn();
    render(<UndoButton count={3} onUndo={onUndo} />);
    const btn = screen.getByRole('button', { name: /undo/i });
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('↩ Undo (3)');
    await userEvent.click(btn);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('treats a missing count as 0 (disabled)', () => {
    render(<UndoButton onUndo={() => {}} />);
    expect(screen.getByRole('button', { name: /undo/i }).disabled).toBe(true);
  });
});
