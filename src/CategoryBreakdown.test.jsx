import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CategoryBreakdown from './CategoryBreakdown.jsx';

afterEach(() => cleanup());

const cats = [
  { id: 'c1', name: 'Utilities', icon: '⚡', color: '#F59E0B', keywords: [], templates: [], builtin: true },
  { id: 'c2', name: 'Dining',    icon: '🍽️', color: '#F97316', keywords: [], templates: [], builtin: true },
  { id: 'c3', name: 'Other',     icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true },
];

describe('CategoryBreakdown', () => {
  it('shows empty state when no items', () => {
    render(<CategoryBreakdown items={[]} categories={cats} otherCategoryId="c3" selectedMonth="2026-04" />);
    expect(screen.getByText(/no expenses/i)).toBeTruthy();
  });

  it('aggregates items by categoryId and renders names from category metadata', () => {
    const items = [
      { id: 'i1', categoryId: 'c1', amount: 50 },
      { id: 'i2', categoryId: 'c1', amount: 50 },
      { id: 'i3', categoryId: 'c2', amount: 75 },
    ];
    render(<CategoryBreakdown items={items} categories={cats} otherCategoryId="c3" selectedMonth="2026-04" />);
    expect(screen.getByText('Utilities')).toBeTruthy();
    expect(screen.getByText('Dining')).toBeTruthy();
    // Sorting puts the largest first; Utilities (100) above Dining (75).
    const text = document.body.textContent || '';
    expect(text.indexOf('Utilities')).toBeLessThan(text.indexOf('Dining'));
  });

  it('falls back to "Other" visuals for items with unknown categoryId', () => {
    const items = [{ id: 'i1', categoryId: 'unknown-id', amount: 20 }];
    render(<CategoryBreakdown items={items} categories={cats} otherCategoryId="c3" selectedMonth="2026-04" />);
    expect(screen.getByText('Other')).toBeTruthy();
  });
});
