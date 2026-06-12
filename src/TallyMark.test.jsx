import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import TallyMark from './TallyMark.jsx';

describe('TallyMark', () => {
  afterEach(() => cleanup());

  it('renders a decorative svg with five tally strokes', () => {
    const { container } = render(<TallyMark />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('line')).toHaveLength(5);
  });

  it('scales via the size prop', () => {
    const { container } = render(<TallyMark size={28} />);
    expect(container.querySelector('svg').getAttribute('width')).toBe('28');
  });

  it('passes className through', () => {
    const { container } = render(<TallyMark className="brand-mark" />);
    expect(container.querySelector('svg').classList.contains('brand-mark')).toBe(true);
  });
});
