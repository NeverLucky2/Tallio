// src/useImageLibrary.test.jsx
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import useImageLibrary from './useImageLibrary.js';
import { putRecord } from './imageStore.js';

const reset = () => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase('tallio-images');
  req.onsuccess = req.onerror = req.onblocked = () => resolve();
});
const rec = (id, over = {}) => ({ id, blob: new Blob(['x']), name: id, group: 'Family', palette: [], createdAt: 1, ...over });

describe('useImageLibrary', () => {
  beforeEach(reset);
  afterEach(() => cleanup());

  it('loads existing images on mount', async () => {
    await putRecord(rec('a'));
    await putRecord(rec('b', { createdAt: 2 }));
    const { result } = renderHook(() => useImageLibrary());
    await waitFor(() => expect(result.current.images.length).toBe(2));
  });

  it('addFromFile (injected) stores then reloads', async () => {
    const fakePut = async (file, meta) => putRecord(rec('new', { name: meta.name }));
    const { result } = renderHook(() => useImageLibrary({ putImage: fakePut }));
    await waitFor(() => expect(result.current.images.length).toBe(0));
    await act(async () => { await result.current.addFromFile(new File(['x'], 'x.jpg'), { name: 'Pic' }); });
    await waitFor(() => expect(result.current.images.map(i => i.name)).toContain('Pic'));
  });

  it('remove deletes and reloads', async () => {
    await putRecord(rec('a'));
    const { result } = renderHook(() => useImageLibrary());
    await waitFor(() => expect(result.current.images.length).toBe(1));
    await act(async () => { await result.current.remove('a'); });
    await waitFor(() => expect(result.current.images.length).toBe(0));
  });

  it('updateMeta renames and reloads', async () => {
    await putRecord(rec('a'));
    const { result } = renderHook(() => useImageLibrary());
    await waitFor(() => expect(result.current.images.length).toBe(1));
    await act(async () => { await result.current.updateMeta('a', { name: 'Renamed' }); });
    await waitFor(() => expect(result.current.images[0].name).toBe('Renamed'));
  });
});
