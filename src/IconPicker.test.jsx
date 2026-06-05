import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IconPicker from './IconPicker.jsx';
import { CURATED_ICONS } from './curatedIcons.js';
import { IconLibraryContext } from './iconLibraryContext.js';

afterEach(() => cleanup());

// Trigger value is a non-curated emoji so it never collides with grid cells.
describe('IconPicker — emoji', () => {
  it('shows the currently selected icon in the trigger', () => {
    render(<IconPicker value="🌟" onChange={() => {}} />);
    expect(screen.getByLabelText('Icon picker').textContent).toContain('🌟');
  });

  it('opens the popover when the trigger is clicked', async () => {
    render(<IconPicker value="🌟" onChange={() => {}} />);
    await userEvent.click(screen.getByLabelText('Icon picker'));
    expect(screen.getByText(CURATED_ICONS[0])).toBeTruthy();
  });

  it('calls onChange when a curated icon is clicked', async () => {
    const onChange = vi.fn();
    render(<IconPicker value="🌟" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Icon picker'));
    await userEvent.click(screen.getByText(CURATED_ICONS[3]));
    expect(onChange).toHaveBeenCalledWith(CURATED_ICONS[3]);
  });

  it('passes free-typed text through onChange', async () => {
    const onChange = vi.fn();
    render(<IconPicker value="🌟" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Icon picker'));
    const input = screen.getByPlaceholderText(/paste/i);
    await userEvent.type(input, '🦄{enter}');
    expect(onChange).toHaveBeenCalledWith('🦄');
  });
});

const libValue = (over = {}) => ({
  images: [
    { id: 'p1', name: 'Mom', group: 'Family', thumb: new Blob(['m']) },
    { id: 'p2', name: 'Rusty', group: 'Pets', thumb: new Blob(['r']) },
  ],
  urlForId: (id) => `blob:${id}`,
  addFromFile: vi.fn(async () => ({ id: 'new1', blob: new Blob(['n']) })),
  remove: async () => {}, updateMeta: async () => {}, reload: () => {},
  ...over,
});
const renderPicker = (props, over) => render(
  <IconLibraryContext.Provider value={libValue(over)}><IconPicker {...props} /></IconLibraryContext.Provider>
);

describe('IconPicker — images', () => {
  it('defaults to the Your images tab when the value is an image token', () => {
    const { getByLabelText, getByText } = renderPicker({ value: 'img:p1', onChange: () => {} });
    fireEvent.click(getByLabelText('Icon picker'));
    expect(getByText('Mom')).toBeTruthy(); // gallery visible without switching tabs
  });

  it('selecting an image emits an img: token', () => {
    const onChange = vi.fn();
    const { getByLabelText, getByText } = renderPicker({ value: '🛒', onChange });
    fireEvent.click(getByLabelText('Icon picker'));
    fireEvent.click(getByText('Your images'));
    fireEvent.click(getByText('Mom'));
    expect(onChange).toHaveBeenCalledWith('img:p1');
  });

  it('search filters the gallery by name', () => {
    const { getByLabelText, getByText, queryByText } = renderPicker({ value: '🛒', onChange: () => {} });
    fireEvent.click(getByLabelText('Icon picker'));
    fireEvent.click(getByText('Your images'));
    fireEvent.change(getByLabelText('Search images'), { target: { value: 'rust' } });
    expect(getByText('Rusty')).toBeTruthy();
    expect(queryByText('Mom')).toBeNull();
  });
});
