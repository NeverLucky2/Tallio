// src/PnlStatement.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import PnlStatement from './PnlStatement.jsx';

const pnl = {
  buckets: [{ key: '2026-01', label: 'Jan' }, { key: '2026-02', label: 'Feb' }],
  income: {
    rows: [{ categoryId: 'sal', name: 'Sales', icon: '💰', color: '#0a0', byBucket: { '2026-01': 2100, '2026-02': 1900 }, total: 4000 }],
    totalsByBucket: { '2026-01': 2100, '2026-02': 1900 }, total: 4000,
  },
  expense: {
    rows: [{ categoryId: 'rent', name: 'Rent', icon: '🏠', color: '#a00', byBucket: { '2026-01': 1000, '2026-02': 1000 }, total: 2000 }],
    totalsByBucket: { '2026-01': 1000, '2026-02': 1000 }, total: 2000,
  },
  netByBucket: { '2026-01': 1100, '2026-02': 900 }, netTotal: 2000,
};

describe('PnlStatement', () => {
  afterEach(() => cleanup());

  it('renders bucket columns, line items, and a net profit row', () => {
    render(<PnlStatement pnl={pnl} />);
    expect(screen.getByRole('columnheader', { name: 'Jan' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Feb' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Sales' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Rent' })).toBeTruthy();

    const net = screen.getByRole('row', { name: /net profit/i });
    expect(within(net).getByText('$2,000.00')).toBeTruthy();
    expect(within(net).getByText('$1,100.00')).toBeTruthy();
  });

  it('shows an empty message when there are no buckets', () => {
    render(<PnlStatement pnl={{ buckets: [], income: { rows: [], totalsByBucket: {}, total: 0 }, expense: { rows: [], totalsByBucket: {}, total: 0 }, netByBucket: {}, netTotal: 0 }} />);
    expect(screen.getByText(/no activity in this period/i)).toBeTruthy();
  });
});
