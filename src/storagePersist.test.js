// src/storagePersist.test.js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestPersistentStorage, getStorageEstimate } from './storagePersist.js';

const orig = navigator.storage;
afterEach(() => { Object.defineProperty(navigator, 'storage', { value: orig, configurable: true }); });
function mockStorage(obj) { Object.defineProperty(navigator, 'storage', { value: obj, configurable: true }); }

describe('storagePersist', () => {
  it('reports unsupported when the API is absent', async () => {
    mockStorage(undefined);
    expect(await requestPersistentStorage()).toEqual({ supported: false, persisted: false });
    expect(await getStorageEstimate()).toEqual({ supported: false, usage: 0, quota: 0 });
  });

  it('returns early when storage is already persisted (no re-request)', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    mockStorage({ persisted: vi.fn().mockResolvedValue(true), persist });
    expect(await requestPersistentStorage()).toEqual({ supported: true, persisted: true });
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests persistence when not yet persisted', async () => {
    mockStorage({ persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(true) });
    expect(await requestPersistentStorage()).toEqual({ supported: true, persisted: true });
  });

  it('estimates usage and quota', async () => {
    mockStorage({ estimate: vi.fn().mockResolvedValue({ usage: 10, quota: 100 }) });
    expect(await getStorageEstimate()).toEqual({ supported: true, usage: 10, quota: 100 });
  });
});
