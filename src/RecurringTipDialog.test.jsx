import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecurringTipDialog from './RecurringTipDialog.jsx';

afterEach(() => cleanup());

describe('RecurringTipDialog', () => {
  it('renders heading and a "Got it" dismiss button', () => {
    render(<RecurringTipDialog onDismiss={() => {}} />);
    expect(screen.getByText(/About recurring bills/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /got it/i })).toBeTruthy();
  });

  it('explains the auto-create + latest-source + undo safety net', () => {
    render(<RecurringTipDialog onDismiss={() => {}} />);
    expect(screen.getByText(/auto-create/i)).toBeTruthy();
    expect(screen.getByText(/latest instance/i)).toBeTruthy();
    expect(screen.getByText(/Undo/i)).toBeTruthy();
  });

  it('clicking "Got it" calls onDismiss', async () => {
    const onDismiss = vi.fn();
    render(<RecurringTipDialog onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
