// src/PayeeActivityTable.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import PayeeActivityTable from './PayeeActivityTable.jsx';

const data = {
  rows: [
    { payeeId: 'p2', name: 'Acme Corp', out: 0, in: 5000 },
    { payeeId: 'p1', name: 'Amazon', out: 200, in: 0 },
    { payeeId: null, name: '(No payee)', out: 25, in: 0 },
  ],
  totals: { out: 225, in: 5000 },
};

describe('PayeeActivityTable', () => {
  afterEach(() => cleanup());

  it('renders payee rows, a dash for zero measures, and a Total row', () => {
    render(<PayeeActivityTable data={data} />);
    const amazon = screen.getByRole('row', { name: /Amazon/ });
    expect(within(amazon).getByText('$200.00')).toBeTruthy();
    expect(within(amazon).getByText('—')).toBeTruthy(); // In is zero

    expect(screen.getByRole('rowheader', { name: '(No payee)' })).toBeTruthy();

    const total = screen.getByRole('row', { name: /Total/ });
    expect(within(total).getByText('$225.00')).toBeTruthy();
    expect(within(total).getByText('$5,000.00')).toBeTruthy();
  });

  it('shows an empty message when there are no rows', () => {
    render(<PayeeActivityTable data={{ rows: [], totals: { out: 0, in: 0 } }} />);
    expect(screen.getByText(/no activity in this period/i)).toBeTruthy();
  });
});
