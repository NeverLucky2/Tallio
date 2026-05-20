// src/CategoryBarList.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CategoryBarList from './CategoryBarList.jsx';

const items = [
  { categoryId: 'g', name: 'Groceries', icon: '🛒', color: '#a00', total: 630, pct: 61.2 },
  { categoryId: 'd', name: 'Dining', icon: '🍽️', color: '#b50', total: 400, pct: 38.8 },
];

describe('CategoryBarList', () => {
  afterEach(() => cleanup());
  it('lists each category name and amount', () => {
    render(<CategoryBarList items={items} />);
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Dining')).toBeTruthy();
    expect(screen.getByText(/\$630/)).toBeTruthy();
  });
  it('renders an empty state with no items', () => {
    render(<CategoryBarList items={[]} />);
    expect(screen.getByText(/no expenses/i)).toBeTruthy();
  });
});
