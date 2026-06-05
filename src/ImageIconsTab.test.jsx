import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import ImageIconsTab from './ImageIconsTab.jsx';
import { IconLibraryContext } from './iconLibraryContext.js';

beforeEach(() => { vi.stubGlobal('URL', { createObjectURL: () => 'blob:1', revokeObjectURL: () => {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const usageData = { categories: [{ id: 'c', icon: 'img:p1' }], accounts: [], accountTypes: [] };

const makeAppearance = (over = {}) => ({
  appIcons: {}, setAppIcon: vi.fn(),
  imageGroups: [], addImageGroup: vi.fn(), removeImageGroup: vi.fn(),
  ...over,
});
const lib = (over = {}) => ({
  images: [{ id: 'p1', name: 'Mom', group: 'Family', thumb: new Blob(['m']), blob: new Blob(['mb']) }],
  urlForId: (id) => `blob:${id}`,
  addFromFile: vi.fn(async () => ({ id: 'n', blob: new Blob(['n']) })),
  remove: vi.fn(async () => {}), updateMeta: vi.fn(async () => {}), reload: () => {},
  ...over,
});
const libTwo = (over = {}) => lib({
  images: [
    { id: 'p1', name: 'Mom', group: 'Family', thumb: new Blob(['m']), blob: new Blob(['mb']) },
    { id: 'p2', name: 'Dad', group: 'Family', thumb: new Blob(['d']), blob: new Blob(['db']) },
  ],
  ...over,
});
const renderTab = (value, appearance = makeAppearance()) => {
  const v = value || lib();
  const utils = render(
    <IconLibraryContext.Provider value={v}>
      <ImageIconsTab appearance={appearance} {...usageData} onBatch={(fn) => fn()} />
    </IconLibraryContext.Provider>
  );
  return { ...utils, value: v, appearance };
};

describe('ImageIconsTab', () => {
  it('lists grouped thumbs and opens the kebab menu', () => {
    const { getByLabelText, getByText } = renderTab();
    expect(getByText('Family')).toBeTruthy();
    fireEvent.click(getByLabelText('Actions for Mom'));
    expect(getByText('Rename')).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();
  });

  it('delete shows a used-by hint then removes', () => {
    const { getByLabelText, getByText, value } = renderTab();
    fireEvent.click(getByLabelText('Actions for Mom'));
    fireEvent.click(getByText('Delete'));
    expect(getByText(/Used by 1/)).toBeTruthy();
    fireEvent.click(getByText('Delete', { selector: '.image-icon-confirm-delete' }));
    expect(value.remove).toHaveBeenCalledWith('p1');
  });

  it('clicking a thumb opens the inline crop editor for that image', () => {
    const { getByLabelText, getByText } = renderTab();
    fireEvent.click(getByLabelText('Adjust Mom'));
    expect(getByText(/Adjusting/).textContent).toContain('Mom');
    expect(getByLabelText('Focal point — drag or use arrow keys')).toBeTruthy();
  });

  it('switching thumbs with unsaved changes prompts; Go back keeps editing, Discard switches', () => {
    const { getByLabelText, getByText, queryByText } = renderTab(libTwo());
    fireEvent.click(getByLabelText('Adjust Mom'));
    fireEvent.change(getByLabelText('Zoom'), { target: { value: '2' } });
    fireEvent.click(getByLabelText('Adjust Dad'));
    expect(getByText('Changes not saved')).toBeTruthy();
    fireEvent.click(getByText('Go back'));
    expect(queryByText('Changes not saved')).toBeNull();
    expect(getByText(/Adjusting/).textContent).toContain('Mom');
    fireEvent.click(getByLabelText('Adjust Dad'));
    fireEvent.click(getByText('Discard changes'));
    expect(getByText(/Adjusting/).textContent).toContain('Dad');
  });

  it('creates a group via the dedicated New group button', () => {
    const { getByText, getByLabelText, appearance } = renderTab();
    fireEvent.click(getByText('＋ New group'));
    fireEvent.change(getByLabelText('New group name'), { target: { value: 'Trips' } });
    fireEvent.click(getByText('Add'));
    expect(appearance.addImageGroup).toHaveBeenCalledWith('Trips');
  });

  it('shows an empty persisted group as its own section', () => {
    const { getByText } = renderTab(lib(), makeAppearance({ imageGroups: ['Trips'] }));
    expect(getByText('Trips')).toBeTruthy();
  });

  it('deletes a group: removes it and moves its icons to Uncategorized (one batch)', () => {
    const v = libTwo();
    const { getByLabelText, appearance } = renderTab(v, makeAppearance({ imageGroups: ['Family'] }));
    fireEvent.click(getByLabelText('Delete group Family'));
    expect(appearance.removeImageGroup).toHaveBeenCalledWith('Family');
    expect(v.updateMeta).toHaveBeenCalledWith('p1', { group: 'Uncategorized' });
    expect(v.updateMeta).toHaveBeenCalledWith('p2', { group: 'Uncategorized' });
  });

  it('Select mode batch-moves the chosen icons to a group', () => {
    const v = libTwo();
    const { getByText, getByLabelText } = renderTab(v, makeAppearance({ imageGroups: ['Family', 'Pets'] }));
    fireEvent.click(getByText('Select'));
    fireEvent.click(getByLabelText('Select Mom'));
    fireEvent.click(getByLabelText('Select Dad'));
    fireEvent.change(getByLabelText('Move selected to group'), { target: { value: 'Pets' } });
    expect(v.updateMeta).toHaveBeenCalledWith('p1', { group: 'Pets' });
    expect(v.updateMeta).toHaveBeenCalledWith('p2', { group: 'Pets' });
  });
});
