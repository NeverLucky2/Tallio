import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import BackgroundLayer from './BackgroundLayer.jsx';
import { getWallpaper } from './wallpapers.js';

const bg = (over = {}) => ({ base: 'solid', effects: { aurora: false, pulse: false }, intensity: 25, ...over });

describe('BackgroundLayer', () => {
  afterEach(() => cleanup());

  it('renders no effects or scrim when solid base with effects off', () => {
    const { container } = render(<BackgroundLayer background={bg()} reducedMotion={false} />);
    expect(container.querySelector('.bg-aurora')).toBeNull();
    expect(container.querySelector('.bg-pulse')).toBeNull();
    expect(container.querySelector('.bg-scrim')).toBeNull();
  });

  it('renders the aurora effect and a scrim when aurora is on', () => {
    const { container } = render(<BackgroundLayer background={bg({ effects: { aurora: true, pulse: false } })} reducedMotion={false} />);
    expect(container.querySelector('.bg-aurora')).not.toBeNull();
    expect(container.querySelector('.bg-pulse')).toBeNull();
    expect(container.querySelector('.bg-scrim')).not.toBeNull();
  });

  it('scrim opacity follows intensity (0 -> 0.8)', () => {
    const { container } = render(<BackgroundLayer background={bg({ effects: { aurora: true, pulse: false }, intensity: 0 })} reducedMotion={false} />);
    expect(container.querySelector('.bg-scrim').style.opacity).toBe('0.8');
  });

  it('adds the reduced-motion class when reducedMotion is true', () => {
    const { container } = render(<BackgroundLayer background={bg({ effects: { aurora: true, pulse: false } })} reducedMotion={true} />);
    expect(container.querySelector('.bg-layer').className).toContain('bg-reduced-motion');
  });
});

describe('BackgroundLayer preset base', () => {
  afterEach(() => cleanup());

  it('renders a wallpaper layer with the preset gradient and a scrim', () => {
    const { container } = render(
      <BackgroundLayer background={bg({ base: 'preset', presetId: 'dusk' })} reducedMotion={false} />,
    );
    const wp = container.querySelector('.bg-wallpaper');
    expect(wp).not.toBeNull();
    expect(wp.style.background).toContain('gradient');
    expect(container.querySelector('.bg-scrim')).not.toBeNull(); // non-solid base is active
  });

  it('renders nothing extra for an unknown preset id', () => {
    const { container } = render(
      <BackgroundLayer background={bg({ base: 'preset', presetId: 'nope' })} reducedMotion={false} />,
    );
    expect(container.querySelector('.bg-wallpaper')).toBeNull();
    // sanity: getWallpaper agrees
    expect(getWallpaper('nope')).toBeNull();
  });
});
