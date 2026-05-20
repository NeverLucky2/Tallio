// src/RecurringList.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import RecurringList from './RecurringList.jsx';

const items = [
  { label: 'Netflix', avgAmount: 15.99, occurrences: 3, monthCount: 3, active: true, varies: false, lastDate: '2026-05-04' },
  { label: 'OldApp', avgAmount: 9.99, occurrences: 2, monthCount: 2, active: false, varies: false, lastDate: '2026-02-09' },
];
const duplicates = [
  { accountId: 'a', label: 'Amazon', amount: -54.10, date: '2026-04-03', ids: ['d1', 'd2'] },
];

describe('RecurringList', () => {
  afterEach(() => cleanup());
  it('lists recurring charges and marks stale ones', () => {
    render(<RecurringList items={items} duplicates={[]} />);
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.getByText('OldApp')).toBeTruthy();
    expect(screen.getByText(/charged after stopping\?|stale/i)).toBeTruthy();
  });
  it('shows a duplicates subsection when present', () => {
    render(<RecurringList items={[]} duplicates={duplicates} />);
    expect(screen.getByText(/possible duplicate/i)).toBeTruthy();
    expect(screen.getByText('Amazon')).toBeTruthy();
  });
  it('empty when nothing recurring and no duplicates', () => {
    render(<RecurringList items={[]} duplicates={[]} />);
    expect(screen.getByText(/no recurring charges/i)).toBeTruthy();
  });
});
