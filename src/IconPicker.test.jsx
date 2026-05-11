import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IconPicker, { CURATED_ICONS } from './IconPicker.jsx';

describe('IconPicker', () => {
  afterEach(() => cleanup());

  it('shows the currently selected icon in the trigger', () => {
    render(<IconPicker value="⚡" onChange={() => {}} />);
    expect(screen.getByLabelText('Icon picker').textContent).toContain('⚡');
  });

  it('opens the popover when the trigger is clicked', async () => {
    render(<IconPicker value="⚡" onChange={() => {}} />);
    await userEvent.click(screen.getByLabelText('Icon picker'));
    // First curated icon visible
    expect(screen.getByText(CURATED_ICONS[0])).toBeTruthy();
  });

  it('calls onChange when a curated icon is clicked', async () => {
    const onChange = vi.fn();
    render(<IconPicker value="⚡" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Icon picker'));
    await userEvent.click(screen.getByText(CURATED_ICONS[3]));
    expect(onChange).toHaveBeenCalledWith(CURATED_ICONS[3]);
  });

  it('passes free-typed text through onChange', async () => {
    const onChange = vi.fn();
    render(<IconPicker value="⚡" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Icon picker'));
    const input = screen.getByPlaceholderText(/paste/i);
    await userEvent.type(input, '🦄{enter}');
    expect(onChange).toHaveBeenCalledWith('🦄');
  });
});
