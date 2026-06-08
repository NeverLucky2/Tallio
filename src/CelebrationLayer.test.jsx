import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import CelebrationLayer from './CelebrationLayer.jsx';

const cel = { key: 'paidoff:a', type: 'paidoff', title: 'Visa paid off!', detail: 'You cleared it 🎉' };
const noop = () => {};

afterEach(() => cleanup());

describe('CelebrationLayer', () => {
  it('renders nothing when style is off', () => {
    const { container } = render(<CelebrationLayer celebration={cel} style="off" reducedMotion={false} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration')).toBeNull();
  });

  it('renders nothing when there is no celebration', () => {
    const { container } = render(<CelebrationLayer celebration={null} style="festive" reducedMotion={false} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration')).toBeNull();
  });

  it('festive: renders confetti + toast with title and detail', () => {
    const { container } = render(<CelebrationLayer celebration={cel} style="festive" reducedMotion={false} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration-confetti')).not.toBeNull();
    expect(container.querySelectorAll('.confetti-piece').length).toBeGreaterThan(0);
    expect(container.querySelector('.celebration-title').textContent).toBe('Visa paid off!');
    expect(container.querySelector('.celebration-detail').textContent).toContain('cleared');
  });

  it('quiet: toast only, no confetti', () => {
    const { container } = render(<CelebrationLayer celebration={cel} style="quiet" reducedMotion={false} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration-confetti')).toBeNull();
    expect(container.querySelector('.celebration-toast')).not.toBeNull();
  });

  it('reduced-motion degrades festive to quiet (no confetti)', () => {
    const { container } = render(<CelebrationLayer celebration={cel} style="festive" reducedMotion={true} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration-confetti')).toBeNull();
    expect(container.querySelector('.celebration').className).toContain('celebration-quiet');
  });

  it('confetti/overlay never blocks clicks; only the toast is interactive', () => {
    const { container } = render(<CelebrationLayer celebration={cel} style="festive" reducedMotion={false} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration').style.pointerEvents).toBe('none');
    expect(container.querySelector('.celebration-toast').style.pointerEvents).toBe('auto');
  });

  it('is announced politely via aria-live', () => {
    const { container } = render(<CelebrationLayer celebration={cel} style="quiet" reducedMotion={false} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration').getAttribute('aria-live')).toBe('polite');
  });

  it('the close button calls onDismiss', () => {
    let dismissed = false;
    const { getByLabelText } = render(<CelebrationLayer celebration={cel} style="quiet" reducedMotion={false} onDismiss={() => { dismissed = true; }} autoDismissMs={0} />);
    fireEvent.click(getByLabelText('Dismiss celebration'));
    expect(dismissed).toBe(true);
  });

  it('auto-dismisses after autoDismissMs', () => {
    vi.useFakeTimers();
    let count = 0;
    render(<CelebrationLayer celebration={cel} style="quiet" reducedMotion={false} onDismiss={() => { count += 1; }} autoDismissMs={6000} />);
    act(() => { vi.advanceTimersByTime(6000); });
    expect(count).toBe(1);
    vi.useRealTimers();
  });
});
