// src/NetWorthChart.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import NetWorthChart from './NetWorthChart.jsx';

const data = [
  { month: '2026-01', assets: 1000, owed: 0, netWorth: 1000 },
  { month: '2026-02', assets: 1500, owed: 0, netWorth: 1500 },
  { month: '2026-03', assets: 1500, owed: 200, netWorth: 1300 },
];

describe('NetWorthChart', () => {
  afterEach(() => cleanup());
  it('renders a path with a non-empty d attribute', () => {
    const { container } = render(<NetWorthChart data={data} />);
    const path = container.querySelector('path.networth-line');
    expect(path).toBeTruthy();
    expect(path.getAttribute('d').length).toBeGreaterThan(0);
  });
  it('empty data shows an empty state', () => {
    render(<NetWorthChart data={[]} />);
    expect(screen.getByText(/no data/i)).toBeTruthy();
  });
});
