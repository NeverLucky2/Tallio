import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(() => cleanup());
import ReportsScreen from './ReportsScreen.jsx';

describe('ReportsScreen — skeleton', () => {
  it('renders three tab buttons with role=tab', () => {
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);
    expect(tabs.map(t => t.textContent.trim())).toEqual(['Year-over-year', 'Month trend', 'Recurring breakdown']);
  });

  it('opens on the Year-over-year tab', () => {
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[2].getAttribute('aria-selected')).toBe('false');
  });

  it('clicking a tab switches aria-selected', () => {
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[1]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ESC key calls onClose', () => {
    const onClose = vi.fn();
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
