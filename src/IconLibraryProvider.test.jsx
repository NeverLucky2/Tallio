import { useEffect } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import IconLibraryProvider from './IconLibraryProvider.jsx';
import { useIconLibrary } from './iconLibraryContext.js';
import { putRecord } from './imageStore.js';

let n;
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  n = 0;
  vi.stubGlobal('URL', { createObjectURL: () => `blob:${++n}`, revokeObjectURL: () => {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Probe() {
  const { images, urlForId } = useIconLibrary();
  return <div data-testid="probe">{images.length}:{urlForId('seed-1') || 'none'}</div>;
}

describe('IconLibraryProvider', () => {
  it('loads thumbs into object urls reachable via urlForId', async () => {
    await putRecord({ id: 'seed-1', thumb: new Blob(['x']), name: 'Seed', group: 'G', createdAt: 1 });
    const { getByTestId } = render(
      <IconLibraryProvider><Probe /></IconLibraryProvider>
    );
    await waitFor(() => expect(getByTestId('probe').textContent).toContain('blob:'));
    expect(getByTestId('probe').textContent.startsWith('1:')).toBe(true);
  });

  it('useIconLibrary returns a safe default outside a provider', () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('0:none');
  });

  it('runs the registered beforeChange before a library mutation', async () => {
    await putRecord({ id: 'x', thumb: new Blob(['t']), name: 'X', group: 'G', createdAt: 1 });
    const before = vi.fn();
    function Reg() {
      const libv = useIconLibrary();
      useEffect(() => { libv.registerBeforeChange(before); }, [libv]);
      return <button onClick={() => libv.updateMeta('x', { name: 'Y' })}>go</button>;
    }
    const { getByText } = render(<IconLibraryProvider><Reg /></IconLibraryProvider>);
    await waitFor(() => expect(getByText('go')).toBeTruthy());
    fireEvent.click(getByText('go'));
    expect(before).toHaveBeenCalledTimes(1);
  });
});
