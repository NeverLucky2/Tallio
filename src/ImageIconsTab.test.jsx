import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import ImageIconsTab from './ImageIconsTab.jsx';
import { IconLibraryContext } from './iconLibraryContext.js';

afterEach(() => cleanup());

const appearance = { appIcons: {}, setAppIcon: vi.fn() };
const usageData = { categories: [{ id: 'c', icon: 'img:p1' }], accounts: [], accountTypes: [] };

const lib = (over = {}) => ({
  images: [{ id: 'p1', name: 'Mom', group: 'Family', thumb: new Blob(['m']) }],
  urlForId: (id) => `blob:${id}`,
  addFromFile: vi.fn(async () => ({ id: 'n', blob: new Blob(['n']) })),
  remove: vi.fn(async () => {}), updateMeta: vi.fn(async () => {}), reload: () => {},
  ...over,
});
const renderTab = (over) => {
  const value = lib(over);
  const utils = render(
    <IconLibraryContext.Provider value={value}>
      <ImageIconsTab appearance={appearance} {...usageData} />
    </IconLibraryContext.Provider>
  );
  return { ...utils, value };
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
});
