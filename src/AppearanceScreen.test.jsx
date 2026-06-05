import 'fake-indexeddb/auto';
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

  it('passes rename/delete handlers so the Background tab renders photo actions', () => {
    const local = {
      themeId: 'nocturne', customTheme: null,
      background: { base: 'photos', presetId: null, photoIds: [], photoGroup: null, mode: 'single', intervalSec: 30, intensity: 25, effects: { aurora: false, pulse: false }, framing: {}, effectStrength: 50 },
      appIcons: {}, setTheme: vi.fn(), updateCustom: vi.fn(), resetCustomToPreset: vi.fn(), updateBackground: vi.fn(),
    };
    render(<AppearanceScreen appearance={local} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Background' }));
    // Empty library -> the hint shows; assert no crash + upload control present.
    expect(screen.getByLabelText('Upload photo')).toBeTruthy();
  });

  it('Background tab can switch the base to Your photos (library wired)', () => {
    const local = {
      themeId: 'nocturne', customTheme: null,
      background: { base: 'solid', presetId: null, photoIds: [], photoGroup: null, mode: 'single', intervalSec: 30, intensity: 25, effects: { aurora: false, pulse: false } },
      appIcons: {}, setTheme: vi.fn(), updateCustom: vi.fn(), resetCustomToPreset: vi.fn(), updateBackground: vi.fn(),
    };
    render(<AppearanceScreen appearance={local} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Background' }));
    fireEvent.click(screen.getByRole('button', { name: /your photos/i }));
    expect(local.updateBackground).toHaveBeenCalledWith({ base: 'photos' });
  });
});
