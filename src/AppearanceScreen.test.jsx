import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AppearanceScreen from './AppearanceScreen.jsx';

const appearance = {
  themeId: 'nocturne', customTheme: null,
  background: { base: 'solid', effects: { aurora: false, pulse: false }, intensity: 25 },
  setTheme: vi.fn(), updateCustom: vi.fn(), resetCustomToPreset: vi.fn(), updateBackground: vi.fn(),
};

describe('AppearanceScreen', () => {
  afterEach(() => cleanup());

  it('shows three tabs with Theme active by default', () => {
    render(<AppearanceScreen appearance={appearance} onClose={() => {}} />);
    expect(screen.getByRole('tab', { name: /theme/i }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('radiogroup', { name: /preset themes/i })).toBeTruthy();
  });

  it('switching to Background shows the effect controls', () => {
    render(<AppearanceScreen appearance={appearance} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /background/i }));
    expect(screen.getByRole('switch', { name: /aurora/i })).toBeTruthy();
  });

  it('Done calls onClose', () => {
    const onClose = vi.fn();
    render(<AppearanceScreen appearance={appearance} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
