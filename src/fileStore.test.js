// src/fileStore.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  isLiveFileSupported, pickSaveFile, readHandle, writeHandle, ensurePermission,
  saveHandle, loadHandle, clearHandle, readBytesFromFile,
} from './fileStore.js';

function fakeHandle(initialBytes = new Uint8Array()) {
  let bytes = initialBytes;
  const chunks = [];
  return {
    name: 'MyBudget.tallio',
    createWritable: vi.fn().mockResolvedValue({
      write: vi.fn().mockImplementation(b => { chunks.push(b); return Promise.resolve(); }),
      close: vi.fn().mockImplementation(() => { bytes = chunks.at(-1); return Promise.resolve(); }),
    }),
    getFile: vi.fn().mockImplementation(() => Promise.resolve({ arrayBuffer: () => Promise.resolve(bytes.buffer ?? new Uint8Array(bytes).buffer) })),
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    _get: () => bytes,
  };
}

afterEach(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; vi.restoreAllMocks(); });

describe('feature detection', () => {
  it('is false when the API is absent (jsdom default)', () => {
    expect(isLiveFileSupported()).toBe(false);
  });
  it('is true when showSaveFilePicker exists', () => {
    window.showSaveFilePicker = () => {};
    expect(isLiveFileSupported()).toBe(true);
  });
});

describe('handle read/write', () => {
  it('writes bytes through a writable and reads them back', async () => {
    const h = fakeHandle();
    await writeHandle(h, new Uint8Array([1, 2, 3]));
    const back = await readHandle(h);
    expect(Array.from(back)).toEqual([1, 2, 3]);
  });
  it('ensurePermission returns true when already granted', async () => {
    expect(await ensurePermission(fakeHandle())).toBe(true);
  });
  it('ensurePermission requests when prompt', async () => {
    const h = fakeHandle();
    h.queryPermission.mockResolvedValue('prompt');
    expect(await ensurePermission(h)).toBe(true);
    expect(h.requestPermission).toHaveBeenCalled();
  });
});

describe('pickSaveFile', () => {
  it('delegates to showSaveFilePicker', async () => {
    const h = fakeHandle();
    window.showSaveFilePicker = vi.fn().mockResolvedValue(h);
    expect(await pickSaveFile('X.tallio')).toBe(h);
    expect(window.showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'X.tallio' }));
  });
});

describe('handle persistence', () => {
  // A real FileSystemFileHandle is specially serializable; a mock with functions
  // is not structured-cloneable, so use a plain serializable stand-in here.
  beforeEach(async () => { await clearHandle(); });
  it('round-trips a handle through IndexedDB', async () => {
    await saveHandle({ name: 'MyBudget.tallio' });
    const loaded = await loadHandle();
    expect(loaded).toBeTruthy();
    expect(loaded.name).toBe('MyBudget.tallio');
  });
  it('returns null after clear', async () => {
    await saveHandle({ name: 'MyBudget.tallio' });
    await clearHandle();
    expect(await loadHandle()).toBeNull();
  });
});

describe('readBytesFromFile', () => {
  it('reads a File to a Uint8Array via arrayBuffer()', async () => {
    const file = { arrayBuffer: () => Promise.resolve(new Uint8Array([7, 8]).buffer) };
    expect(Array.from(await readBytesFromFile(file))).toEqual([7, 8]);
  });
  it('falls back to FileReader when arrayBuffer is absent (jsdom / old Safari)', async () => {
    const file = new File([new Uint8Array([7, 8, 9])], 'x.bin'); // jsdom File has no arrayBuffer()
    expect(typeof file.arrayBuffer).not.toBe('function');
    expect(Array.from(await readBytesFromFile(file))).toEqual([7, 8, 9]);
  });
});
