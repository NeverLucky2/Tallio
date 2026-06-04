import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ThemeTab from './ThemeTab.jsx';

function stub(overrides = {}) {
  return {
    themeId: 'nocturne', customTheme: null,
    setTheme: vi.fn(), updateCustom: vi.fn(), resetCustomToPreset: vi.fn(),
    ...overrides,
  };
}

describe('ThemeTab', () => {
  afterEach(() => cleanup());

  it('renders a swatch for each of the six presets', () => {
    render(<ThemeTab appearance={stub()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
  });

  it('selecting a preset calls setTheme', () => {
    const a = stub();
    render(<ThemeTab appearance={a} />);
    fireEvent.click(screen.getByRole('radio', { name: /parchment/i }));
    expect(a.setTheme).toHaveBeenCalledWith('parchment');
  });

  it('editing a color calls updateCustom with that channel', () => {
    const a = stub();
    render(<ThemeTab appearance={a} />);
    fireEvent.input(screen.getByLabelText(/accent/i), { target: { value: '#ff0000' } });
    expect(a.updateCustom).toHaveBeenCalledWith({ accent: '#ff0000' });
  });

  it('reset calls resetCustomToPreset with the active preset', () => {
    const a = stub({ themeId: 'custom', customTheme: { bg: '#000000', surface: '#111111', text: '#ffffff', accent: '#d4a853', income: '#3ddba0', expense: '#e06c6c' } });
    render(<ThemeTab appearance={a} />);
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(a.resetCustomToPreset).toHaveBeenCalled();
  });

  it('warns when custom text/background contrast is too low', () => {
    const a = stub({ themeId: 'custom', customTheme: { bg: '#ffffff', surface: '#ffffff', text: '#f2f2f2', accent: '#d4a853', income: '#3ddba0', expense: '#e06c6c' } });
    render(<ThemeTab appearance={a} />);
    expect(screen.getByText(/hard to read/i)).toBeTruthy();
  });
});
