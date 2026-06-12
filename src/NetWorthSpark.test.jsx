import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import NetWorthSpark from './NetWorthSpark.jsx';

describe('NetWorthSpark', () => {
  afterEach(() => cleanup());

  it('renders a line and one bar per point (finish CSS picks which shows)', () => {
    const { container } = render(<NetWorthSpark series={[100, 200, 150, 300]} />);
    expect(container.querySelector('svg polyline.nws-line')).toBeTruthy();
    expect(container.querySelectorAll('svg rect.nws-bar')).toHaveLength(4);
  });

  it('labels itself for screen readers', () => {
    const { container } = render(<NetWorthSpark series={[1, 2]} />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toMatch(/net worth/i);
  });

  it('renders nothing for fewer than 2 points', () => {
    const { container } = render(<NetWorthSpark series={[42]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('survives a flat series without NaN coordinates', () => {
    const { container } = render(<NetWorthSpark series={[500, 500, 500]} />);
    expect(container.querySelector('polyline').getAttribute('points')).not.toMatch(/NaN/);
  });
});
