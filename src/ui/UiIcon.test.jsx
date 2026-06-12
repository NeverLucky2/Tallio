import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import UiIcon from './UiIcon.jsx';

describe('UiIcon', () => {
  afterEach(() => cleanup());

  it('renders an svg for a known name', () => {
    const { container } = render(<UiIcon name="scan" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders nothing for an unknown name', () => {
    const { container } = render(<UiIcon name="not-a-real-icon" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('passes through aria-label when provided', () => {
    const { getByLabelText } = render(<UiIcon name="undo" label="Undo" />);
    expect(getByLabelText('Undo')).toBeTruthy();
  });
});
