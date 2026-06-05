import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import Icon from './Icon.jsx';
import { IconLibraryContext } from './iconLibraryContext.js';

afterEach(() => cleanup());

const withCache = (urlForId, ui) => render(
  <IconLibraryContext.Provider value={{ images: [], urlForId, addFromFile: async () => {}, remove: async () => {}, updateMeta: async () => {}, reload: () => {} }}>{ui}</IconLibraryContext.Provider>
);

describe('Icon', () => {
  it('renders an emoji as text', () => {
    const { container } = render(<Icon value="🛒" className="cat-icon" />);
    const span = container.querySelector('.cat-icon');
    expect(span.textContent).toBe('🛒');
    expect(span.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders an <img> for a cached image token', () => {
    const { container } = withCache((id) => (id === 'p1' ? 'blob:1' : undefined), <Icon value="img:p1" className="cat-icon" />);
    const img = container.querySelector('img.icon-img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('blob:1');
    expect(img.getAttribute('alt')).toBe('');
  });

  it('falls back to a glyph when the image id is missing/deleted', () => {
    const { container } = withCache(() => undefined, <Icon value="img:gone" className="cat-icon" fallback="🏷️" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.cat-icon').textContent).toBe('🏷️');
  });
});
