// src/CategoryBarList.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryBarList from './CategoryBarList.jsx';

const flat = [
  { categoryId: 'g', name: 'Groceries', icon: '🛒', color: '#a00', total: 630, pct: 61.2 },
  { categoryId: 'd', name: 'Dining', icon: '🍽️', color: '#b50', total: 400, pct: 38.8 },
];

const withSubs = [
  { categoryId: 'tax', name: 'Taxes', icon: '🏛️', color: '#a00', total: 4200, pct: 62, subs: [
    { subId: 'fed', name: 'Federal Tax', total: 3000, pct: 71.4 },
    { subId: 'st',  name: 'State Tax',   total: 1000, pct: 23.8 },
    { subId: null,  name: '(no sub-category)', total: 200, pct: 4.8 },
  ] },
  { categoryId: 'gro', name: 'Groceries', icon: '🛒', color: '#0a0', total: 2600, pct: 38, subs: [] },
];

describe('CategoryBarList', () => {
  afterEach(() => cleanup());

  it('lists each category name and amount', () => {
    render(<CategoryBarList items={flat} />);
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Dining')).toBeTruthy();
    expect(screen.getByText(/\$630/)).toBeTruthy();
  });

  it('renders an empty state with no items', () => {
    render(<CategoryBarList items={[]} />);
    expect(screen.getByText(/no expenses/i)).toBeTruthy();
  });

  it('shows a chevron only for categories that have subs', () => {
    render(<CategoryBarList items={withSubs} />);
    expect(screen.getByRole('button', { name: /expand taxes sub-categories/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /groceries/i })).toBeNull();
  });

  it('sub rows are hidden until expanded, then shown, then hidden again', async () => {
    render(<CategoryBarList items={withSubs} />);
    expect(screen.queryByText('Federal Tax')).toBeNull();
    const chevron = screen.getByRole('button', { name: /expand taxes/i });
    await userEvent.click(chevron);
    expect(screen.getByText('Federal Tax')).toBeTruthy();
    expect(screen.getByText('(no sub-category)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /collapse taxes/i }).getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: /collapse taxes/i }));
    expect(screen.queryByText('Federal Tax')).toBeNull();
  });
});
