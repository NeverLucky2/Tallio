import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import ImageIconsTab from './ImageIconsTab.jsx';
import { IconLibraryContext } from './iconLibraryContext.js';

beforeEach(() => { vi.stubGlobal('URL', { createObjectURL: () => 'blob:1', revokeObjectURL: () => {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const appearance = { appIcons: {}, setAppIcon: vi.fn() };
const usageData = { categories: [{ id: 'c', icon: 'img:p1' }], accounts: [], accountTypes: [] };

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
const renderTab = (value) => {
  const v = value || lib();
  const utils = render(
    <IconLibraryContext.Provider value={v}>
      <ImageIconsTab appearance={appearance} {...usageData} />
    </IconLibraryContext.Provider>
  );
  return { ...utils, value: v };
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
    // make a change → dirty
    fireEvent.change(getByLabelText('Zoom'), { target: { value: '2' } });
    fireEvent.click(getByLabelText('Adjust Dad'));
    expect(getByText('Changes not saved')).toBeTruthy();
    fireEvent.click(getByText('Go back'));
    expect(queryByText('Changes not saved')).toBeNull();
    expect(getByText(/Adjusting/).textContent).toContain('Mom'); // still editing Mom
    // try again, this time discard
    fireEvent.click(getByLabelText('Adjust Dad'));
    fireEvent.click(getByText('Discard changes'));
    expect(getByText(/Adjusting/).textContent).toContain('Dad');
  });

  it('switching thumbs with no changes switches freely (no prompt)', () => {
    const { getByLabelText, getByText, queryByText } = renderTab(libTwo());
    fireEvent.click(getByLabelText('Adjust Mom'));
    fireEvent.click(getByLabelText('Adjust Dad'));
    expect(queryByText('Changes not saved')).toBeNull();
    expect(getByText(/Adjusting/).textContent).toContain('Dad');
  });
});
