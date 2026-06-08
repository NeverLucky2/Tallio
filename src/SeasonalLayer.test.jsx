import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import SeasonalLayer from './SeasonalLayer.jsx';

const d = (s) => new Date(s + 'T12:00:00');
afterEach(() => cleanup());

describe('SeasonalLayer', () => {
  it('renders winter snow particles in January', () => {
    const { container } = render(<SeasonalLayer now={d('2026-01-15')} enabled={true} reducedMotion={false} />);
    const layer = container.querySelector('.seasonal-layer');
    expect(layer).not.toBeNull();
    expect(layer.className).toContain('seasonal-winter');
    expect(container.querySelectorAll('.seasonal-particle').length).toBeGreaterThan(0);
    expect(layer.style.pointerEvents).toBe('none');
  });

  it('renders the summer sunny-drift variant in July', () => {
    const { container } = render(<SeasonalLayer now={d('2026-07-15')} enabled={true} reducedMotion={false} />);
    expect(container.querySelector('.seasonal-layer').className).toContain('seasonal-summer');
  });

  it('renders a holiday accent over the base season (Halloween)', () => {
    const { container } = render(<SeasonalLayer now={d('2026-10-31')} enabled={true} reducedMotion={false} />);
    expect(container.querySelector('.seasonal-layer').className).toContain('seasonal-halloween');
  });

  it('renders nothing when disabled', () => {
    const { container } = render(<SeasonalLayer now={d('2026-01-15')} enabled={false} reducedMotion={false} />);
    expect(container.querySelector('.seasonal-layer')).toBeNull();
  });

  it('renders nothing under reduced motion', () => {
    const { container } = render(<SeasonalLayer now={d('2026-01-15')} enabled={true} reducedMotion={true} />);
    expect(container.querySelector('.seasonal-layer')).toBeNull();
  });
});
