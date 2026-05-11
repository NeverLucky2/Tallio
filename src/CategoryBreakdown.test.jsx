import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('CategoryBreakdown — editable mode', () => {
  const cats = [
    { id: 'c1', name: 'Utilities', icon: '⚡', color: '#F59E0B', keywords: [], templates: [], builtin: true },
    { id: 'c3', name: 'Other',     icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true },
  ];
  const items = [{ id: 'i1', categoryId: 'c1', amount: 50 }];

  it('row is not clickable when onUpdateCategory is not provided', () => {
    render(<CategoryBreakdown items={items} categories={cats} otherCategoryId="c3" selectedMonth="2026-04" />);
    expect(screen.queryByLabelText(/edit utilities/i)).toBeNull();
  });

  it('clicking a row opens the edit popover', async () => {
    const onUpdateCategory = vi.fn();
    render(<CategoryBreakdown items={items} categories={cats} otherCategoryId="c3" selectedMonth="2026-04" onUpdateCategory={onUpdateCategory} />);
    await userEvent.click(screen.getByLabelText(/edit utilities/i));
    // Popover header includes the category name
    expect(screen.getAllByText(/utilities/i).length).toBeGreaterThan(1);
    // Color and Icon pickers visible (they have aria-label "Color picker" / "Icon picker")
    expect(screen.getByLabelText('Color picker')).toBeTruthy();
    expect(screen.getByLabelText('Icon picker')).toBeTruthy();
  });

  it('Done button closes the popover', async () => {
    const onUpdateCategory = vi.fn();
    render(<CategoryBreakdown items={items} categories={cats} otherCategoryId="c3" selectedMonth="2026-04" onUpdateCategory={onUpdateCategory} />);
    await userEvent.click(screen.getByLabelText(/edit utilities/i));
    expect(screen.getByLabelText('Color picker')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(screen.queryByLabelText('Color picker')).toBeNull();
  });

  it('Escape key closes the popover', async () => {
    const onUpdateCategory = vi.fn();
    render(<CategoryBreakdown items={items} categories={cats} otherCategoryId="c3" selectedMonth="2026-04" onUpdateCategory={onUpdateCategory} />);
    await userEvent.click(screen.getByLabelText(/edit utilities/i));
    expect(screen.getByLabelText('Color picker')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText('Color picker')).toBeNull();
  });
});
