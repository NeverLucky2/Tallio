import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BackgroundTab from './BackgroundTab.jsx';

const makeAppearance = (over = {}) => {
  const updateBackground = vi.fn();
  const background = {
    base: 'solid', presetId: null, photoIds: [], photoGroup: null,
    mode: 'single', intervalSec: 30, intensity: 25,
    effects: { aurora: false, pulse: false }, ...over,
  };
  return { appearance: { background, updateBackground }, updateBackground };
};

describe('BackgroundTab base selector', () => {
  afterEach(() => cleanup());

  it('renders three base options', () => {
    const { appearance } = makeAppearance();
    const { getByRole } = render(<BackgroundTab appearance={appearance} />);
    expect(getByRole('button', { name: /solid/i })).toBeTruthy();
    expect(getByRole('button', { name: /wallpaper/i })).toBeTruthy();
    expect(getByRole('button', { name: /your photos/i })).toBeTruthy();
  });

  it('clicking "Your photos" sets base to photos', () => {
    const { appearance, updateBackground } = makeAppearance();
    const { getByRole } = render(<BackgroundTab appearance={appearance} />);
    fireEvent.click(getByRole('button', { name: /your photos/i }));
    expect(updateBackground).toHaveBeenCalledWith({ base: 'photos' });
  });

  it('shows the wallpaper grid and selects a wallpaper when base is preset', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'preset' });
    const { getByRole } = render(<BackgroundTab appearance={appearance} />);
    fireEvent.click(getByRole('button', { name: /dusk/i }));
    expect(updateBackground).toHaveBeenCalledWith({ presetId: 'dusk' });
  });
});

describe('BackgroundTab effects + intensity', () => {
  afterEach(() => cleanup());

  it('renders the two effect switches and an intensity slider', () => {
    const { appearance } = makeAppearance();
    render(<BackgroundTab appearance={appearance} />);
    expect(screen.getByRole('switch', { name: /aurora/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /nocturne pulse/i })).toBeTruthy();
    expect(screen.getByLabelText('Background intensity')).toBeTruthy();
  });

  it('toggling Aurora updates effects without dropping pulse', () => {
    const { appearance, updateBackground } = makeAppearance({ effects: { aurora: false, pulse: true } });
    render(<BackgroundTab appearance={appearance} />);
    fireEvent.click(screen.getByRole('switch', { name: /aurora/i }));
    expect(updateBackground).toHaveBeenCalledWith({ effects: { aurora: true, pulse: true } });
  });

  it('moving the slider updates intensity as a number', () => {
    const { appearance, updateBackground } = makeAppearance();
    render(<BackgroundTab appearance={appearance} />);
    fireEvent.change(screen.getByLabelText('Background intensity'), { target: { value: '80' } });
    expect(updateBackground).toHaveBeenCalledWith({ intensity: 80 });
  });
});
