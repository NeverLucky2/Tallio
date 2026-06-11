import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BackgroundTab from './BackgroundTab.jsx';

const makeAppearance = (over = {}) => {
  const updateBackground = vi.fn();
  const background = {
    base: 'solid', presetId: null, photoIds: [], photoGroup: null,
    mode: 'single', intervalSec: 30, intensity: 25,
    effects: { aurora: false, pulse: false }, framing: {}, effectStrength: 50, ...over,
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

  it('moving the slider updates intensity as a number (image base)', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'preset', presetId: 'ember' });
    render(<BackgroundTab appearance={appearance} />);
    fireEvent.change(screen.getByLabelText('Background intensity'), { target: { value: '80' } });
    expect(updateBackground).toHaveBeenCalledWith({ intensity: 80 }, 'appearance:bg:intensity');
  });

  it('disables the intensity slider with a hint over a solid background', () => {
    // Over a solid base the readability veil is --bg over --bg (invisible) and
    // the frost knobs are bypassed — the slider has nothing to act on.
    const { appearance } = makeAppearance({ base: 'solid', effects: { aurora: true, pulse: false } });
    render(<BackgroundTab appearance={appearance} />);
    expect(screen.getByLabelText('Background intensity').disabled).toBe(true);
    expect(screen.getByText(/applies to photo and wallpaper backgrounds/i)).toBeTruthy();
  });

  it('enables the intensity slider for photo and wallpaper bases', () => {
    const { appearance } = makeAppearance({ base: 'preset', presetId: 'ember' });
    render(<BackgroundTab appearance={appearance} />);
    expect(screen.getByLabelText('Background intensity').disabled).toBe(false);
    expect(screen.queryByText(/applies to photo and wallpaper backgrounds/i)).toBeNull();
  });

  it('hides the effect-strength slider when no effect is on', () => {
    const { appearance } = makeAppearance({ effects: { aurora: false, pulse: false } });
    const { queryByLabelText } = render(<BackgroundTab appearance={appearance} />);
    expect(queryByLabelText('Effect strength')).toBeNull();
  });

  it('shows the effect-strength slider when an effect is on and updates it', () => {
    const { appearance, updateBackground } = makeAppearance({ effects: { aurora: true, pulse: false }, effectStrength: 50 });
    const { getByLabelText } = render(<BackgroundTab appearance={appearance} />);
    fireEvent.change(getByLabelText('Effect strength'), { target: { value: '80' } });
    expect(updateBackground).toHaveBeenCalledWith({ effectStrength: 80 }, 'appearance:bg:effectStrength');
  });
});

describe('BackgroundTab photo controls', () => {
  afterEach(() => cleanup());

  const images = [
    { id: 'a', name: 'Beach', group: 'Scenery' },
    { id: 'b', name: 'Dog',   group: 'Pets' },
  ];

  it('calls onUpload when a file is chosen', () => {
    const onUpload = vi.fn();
    const { appearance } = makeAppearance({ base: 'photos' });
    const { getByLabelText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={onUpload} />);
    const input = getByLabelText('Upload photo');
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onUpload.mock.calls[0][0]).toBe(file);
  });

  it('single mode replaces the selection with the clicked image', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', mode: 'single', photoIds: ['b'] });
    const { getByRole } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByRole('button', { name: /select Beach/i }));
    expect(updateBackground).toHaveBeenCalledWith({ photoIds: ['a'] });
  });

  it('slideshow mode toggles selection membership', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', mode: 'slideshow', photoIds: ['a', 'b'] });
    const { getByRole } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByRole('button', { name: /select Beach/i }));
    expect(updateBackground).toHaveBeenCalledWith({ photoIds: ['b'] });
  });

  it('switches to slideshow mode', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', mode: 'single' });
    const { getByRole } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByRole('button', { name: /slideshow/i }));
    expect(updateBackground).toHaveBeenCalledWith({ mode: 'slideshow' });
  });

  it('edits the interval (visible only in slideshow mode)', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', mode: 'slideshow' });
    const { getByLabelText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.change(getByLabelText('Slideshow interval (seconds)'), { target: { value: '45' } });
    expect(updateBackground).toHaveBeenCalledWith({ intervalSec: 45 }, 'appearance:bg:intervalSec');
  });

  it('hides the interval in single mode', () => {
    const { appearance } = makeAppearance({ base: 'photos', mode: 'single' });
    const { queryByLabelText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    expect(queryByLabelText('Slideshow interval (seconds)')).toBeNull();
  });

  it('sets a group source from the dropdown', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos' });
    const { getByLabelText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.change(getByLabelText('Slideshow group source'), { target: { value: 'Pets' } });
    expect(updateBackground).toHaveBeenCalledWith({ photoGroup: 'Pets' });
  });
});

describe('BackgroundTab framing editor', () => {
  afterEach(() => cleanup());

  const images = [{ id: 'a', name: 'Beach', group: 'Scenery' }];

  it('Adjust framing is offered for a selected photo and opens the editor with a zoom slider', () => {
    const { appearance } = makeAppearance({ base: 'photos', photoIds: ['a'] });
    const { getByLabelText, getByText, queryByLabelText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    expect(queryByLabelText('Zoom')).toBeNull(); // editor closed
    fireEvent.click(getByLabelText('Actions for Beach'));
    fireEvent.click(getByText('Adjust framing'));
    expect(getByLabelText('Zoom')).toBeTruthy();
  });

  it('does not offer Adjust framing for an unselected photo', () => {
    const { appearance } = makeAppearance({ base: 'photos', photoIds: [] });
    const { getByLabelText, queryByText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByLabelText('Actions for Beach'));
    expect(queryByText('Adjust framing')).toBeNull();
  });

  it('zoom slider writes framing for the photo', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', photoIds: ['a'] });
    const { getByLabelText, getByText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByLabelText('Actions for Beach'));
    fireEvent.click(getByText('Adjust framing'));
    fireEvent.change(getByLabelText('Zoom'), { target: { value: '2' } });
    expect(updateBackground).toHaveBeenCalledWith({ framing: { a: { posX: 50, posY: 50, zoom: 2 } } }, 'appearance:bg:framing:a');
  });

  it('arrow keys nudge the focal point', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', photoIds: ['a'] });
    const { getByLabelText, getByText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByLabelText('Actions for Beach'));
    fireEvent.click(getByText('Adjust framing'));
    fireEvent.keyDown(getByLabelText('Focal point — drag or use arrow keys'), { key: 'ArrowRight' });
    expect(updateBackground).toHaveBeenCalledWith({ framing: { a: { posX: 52, posY: 50, zoom: 1 } } }, 'appearance:bg:framing:a');
  });
});

describe('BackgroundTab rename + delete', () => {
  afterEach(() => cleanup());

  const images = [{ id: 'a', name: 'Beach', group: 'Scenery' }];

  it('renames an image via the rename field', () => {
    const onRename = vi.fn();
    const { appearance } = makeAppearance({ base: 'photos', photoIds: [] });
    const { getByLabelText, getByText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} onRename={onRename} onDelete={vi.fn()} />);
    fireEvent.click(getByLabelText('Actions for Beach'));
    fireEvent.click(getByText('Rename'));
    const input = getByLabelText('Name for Beach');
    fireEvent.change(input, { target: { value: 'Sunset Cove' } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith('a', 'Sunset Cove');
  });

  it('deletes an image after confirm and prunes it from the selection', () => {
    const onDelete = vi.fn();
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', photoIds: ['a'], framing: { a: { posX: 10, posY: 10, zoom: 1 } } });
    const { getByLabelText, getByText, getByRole } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} onRename={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(getByLabelText('Actions for Beach'));
    fireEvent.click(getByText('Delete'));
    fireEvent.click(getByRole('button', { name: /confirm delete Beach/i }));
    expect(onDelete).toHaveBeenCalledWith('a');
    expect(updateBackground).toHaveBeenCalledWith({ photoIds: [], framing: {} });
  });
});
