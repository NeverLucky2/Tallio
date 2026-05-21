// src/CashFlowChart.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import CashFlowChart from './CashFlowChart.jsx';

const data = [
  { month: '2026-01', income: 1000, spending: 300, net: 700 },
  { month: '2026-02', income: 0, spending: 0, net: 0 },
  { month: '2026-03', income: 0, spending: 200, net: -200 },
];

describe('CashFlowChart', () => {
  afterEach(() => cleanup());
  it('renders one bar rect per month', () => {
    const { container } = render(<CashFlowChart data={data} />);
    expect(container.querySelectorAll('rect.cashflow-bar')).toHaveLength(3);
  });
  it('empty data shows an empty state', () => {
    render(<CashFlowChart data={[]} />);
    expect(screen.getByText(/no activity/i)).toBeTruthy();
  });
});
