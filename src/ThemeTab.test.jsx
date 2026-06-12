import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import ThemeTab from './ThemeTab.jsx';

function stub(overrides = {}) {
  return {
    themeId: 'nocturne', customTheme: null, finish: 'instrument',
    setTheme: vi.fn(), updateCustom: vi.fn(), resetCustomToPreset: vi.fn(), setFinish: vi.fn(),
    ...overrides,
  };
}

describe('ThemeTab', () => {
  afterEach(() => cleanup());

  it('renders a swatch for each of the six presets', () => {
    render(<ThemeTab appearance={stub()} />);
    const group = screen.getByRole('radiogroup', { name: /preset themes/i });
    expect(within(group).getAllByRole('radio')).toHaveLength(6);
  });

  it('renders a finish picker with instrument selected by default', () => {
    render(<ThemeTab appearance={stub()} />);
    const group = screen.getByRole('radiogroup', { name: /finish/i });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0].getAttribute('aria-label')).toMatch(/instrument/i); // default listed first
    expect(within(group).getByRole('radio', { name: /instrument/i }).getAttribute('aria-checked')).toBe('true');
  });

  it('selecting a finish calls setFinish', () => {
    const a = stub();
    render(<ThemeTab appearance={a} />);
    fireEvent.click(screen.getByRole('radio', { name: /bullion/i }));
    expect(a.setFinish).toHaveBeenCalledWith('bullion');
  });

  it('reflects the active finish', () => {
    render(<ThemeTab appearance={stub({ finish: 'bullion' })} />);
    expect(screen.getByRole('radio', { name: /bullion/i }).getAttribute('aria-checked')).toBe('true');
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
    expect(a.updateCustom).toHaveBeenCalledWith({ accent: '#ff0000' }, 'accent');
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
