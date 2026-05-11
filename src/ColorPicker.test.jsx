import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ColorPicker, { CURATED_COLORS } from './ColorPicker.jsx';

describe('ColorPicker', () => {
  afterEach(() => cleanup());
  it('shows the current color in the trigger', () => {
    render(<ColorPicker value="#F59E0B" onChange={() => {}} />);
    const trigger = screen.getByLabelText('Color picker');
    expect(trigger.textContent).toContain('#F59E0B');
  });

  it('opens the popover when clicked', async () => {
    render(<ColorPicker value="#F59E0B" onChange={() => {}} />);
    await userEvent.click(screen.getByLabelText('Color picker'));
    // 12 swatches present
    const swatches = screen.getAllByRole('button', { name: /swatch/i });
    expect(swatches.length).toBe(CURATED_COLORS.length);
  });

  it('calls onChange when a swatch is clicked', async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#F59E0B" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Color picker'));
    const swatches = screen.getAllByRole('button', { name: /swatch/i });
    await userEvent.click(swatches[2]);
    expect(onChange).toHaveBeenCalledWith(CURATED_COLORS[2]);
  });

  it('accepts a custom hex on Enter', async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#F59E0B" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Color picker'));
    const input = screen.getByPlaceholderText(/hex/i);
    await userEvent.clear(input);
    await userEvent.type(input, '#abcdef{enter}');
    expect(onChange).toHaveBeenCalledWith('#ABCDEF');
  });

  it('rejects invalid hex input', async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#F59E0B" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Color picker'));
    const input = screen.getByPlaceholderText(/hex/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'notahex{enter}');
    expect(onChange).not.toHaveBeenCalled();
  });
});
