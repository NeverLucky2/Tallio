import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BackgroundTab from './BackgroundTab.jsx';

function stub(over = {}) {
  return {
    background: { base: 'solid', effects: { aurora: false, pulse: false }, intensity: 25, ...over },
    updateBackground: vi.fn(),
  };
}

describe('BackgroundTab', () => {
  afterEach(() => cleanup());

  it('renders the two effect switches and an intensity slider', () => {
    render(<BackgroundTab appearance={stub()} />);
    expect(screen.getByRole('switch', { name: /aurora/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /nocturne pulse/i })).toBeTruthy();
    expect(screen.getByLabelText(/intensity/i)).toBeTruthy();
  });

  it('toggling Aurora updates effects without dropping pulse', () => {
    const a = stub({ effects: { aurora: false, pulse: true } });
    render(<BackgroundTab appearance={a} />);
    fireEvent.click(screen.getByRole('switch', { name: /aurora/i }));
    expect(a.updateBackground).toHaveBeenCalledWith({ effects: { aurora: true, pulse: true } });
  });

  it('moving the slider updates intensity as a number', () => {
    const a = stub();
    render(<BackgroundTab appearance={a} />);
    fireEvent.change(screen.getByLabelText(/intensity/i), { target: { value: '80' } });
    expect(a.updateBackground).toHaveBeenCalledWith({ intensity: 80 });
  });
});
