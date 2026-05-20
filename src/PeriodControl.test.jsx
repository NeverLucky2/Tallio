// src/PeriodControl.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PeriodControl from './PeriodControl.jsx';

describe('PeriodControl', () => {
  afterEach(() => cleanup());
  it('clicking a preset chip emits that preset', async () => {
    const onChange = vi.fn();
    render(<PeriodControl period={{ preset: 'last-12-months' }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /this year/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ preset: 'this-year' }));
  });
  it('custom preset reveals two date inputs', () => {
    render(<PeriodControl period={{ preset: 'custom', customStart: '', customEnd: '' }} onChange={() => {}} />);
    expect(screen.getByLabelText(/from/i)).toBeTruthy();
    expect(screen.getByLabelText(/to/i)).toBeTruthy();
  });
});
