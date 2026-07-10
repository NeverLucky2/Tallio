// src/archiveRestore.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildArchive, parseArchive } from './exportArchive.js';
import { assertSupportedSchema, restoreArchiveToStorage, SUPPORTED_SCHEMA_VERSION } from './archiveRestore.js';

function memStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

describe('assertSupportedSchema', () => {
  it('rejects a missing format', () => {
    expect(() => assertSupportedSchema({ data: {} })).toThrow(/valid Tallio backup/i);
  });
  it('rejects a newer format', () => {
    expect(() => assertSupportedSchema({ data: { schemaVersion: SUPPORTED_SCHEMA_VERSION + 1 } })).toThrow(/newer version/i);
  });
  it('accepts the current format', () => {
    expect(assertSupportedSchema({ data: { schemaVersion: 5 } })).toBe(5);
  });
});

describe('restoreArchiveToStorage', () => {
  let storage, imageStore;
  beforeEach(() => { storage = memStorage(); imageStore = { replaceAllImages: vi.fn().mockResolvedValue() }; });

  it('writes every storage key from a round-tripped archive', async () => {
    const bytes = buildArchive({
      accounts: [{ id: 'a1', name: 'Checking' }],
      transactions: [{ id: 't1', accountId: 'a1', amount: -5, date: '2026-01-01' }],
      categories: [{ id: 'c1', name: 'Food' }],
      accountTypes: [{ id: 'ty1', name: 'Bank' }],
      reportAcks: { subscriptions: { x: 1 }, dismissedDuplicates: ['d'] },
      templates: [{ id: 'tpl1', name: 'Rent' }],
      images: [], appearance: { themeId: 'nocturne' },
      schemaVersion: 5, appVersion: '9.9.9', now: new Date('2026-01-02T00:00:00Z'),
    });
    await restoreArchiveToStorage(parseArchive(bytes), { storage, imageStore });

    expect(JSON.parse(storage.getItem('tallio-accounts'))).toEqual([{ id: 'a1', name: 'Checking' }]);
    expect(JSON.parse(storage.getItem('tallio-transactions'))[0].id).toBe('t1');
    expect(JSON.parse(storage.getItem('tallio-categories'))).toEqual([{ id: 'c1', name: 'Food' }]);
    expect(JSON.parse(storage.getItem('tallio-account-types'))).toEqual([{ id: 'ty1', name: 'Bank' }]);
    expect(JSON.parse(storage.getItem('tallio-templates'))).toEqual([{ id: 'tpl1', name: 'Rent' }]);
    expect(JSON.parse(storage.getItem('tallio-report-acks'))).toEqual({ subscriptions: { x: 1 }, dismissedDuplicates: ['d'] });
    expect(JSON.parse(storage.getItem('tallio-appearance'))).toEqual({ themeId: 'nocturne' });
    expect(imageStore.replaceAllImages).toHaveBeenCalledWith([]);
  });

  it('converts archive image bytes back into Blob records', async () => {
    const bytes = buildArchive({
      accounts: [], transactions: [], categories: [], accountTypes: [],
      reportAcks: { subscriptions: {}, dismissedDuplicates: [] }, templates: [],
      images: [{ id: 'img1', name: 'r.png', group: 'G', type: 'image/png', w: 1, h: 1, palette: [], createdAt: 5, bytes: new Uint8Array([1, 2, 3]), thumbBytes: new Uint8Array([9]) }],
      appearance: null, schemaVersion: 5, appVersion: '1', now: new Date('2026-01-02T00:00:00Z'),
    });
    await restoreArchiveToStorage(parseArchive(bytes), { storage, imageStore });
    const records = imageStore.replaceAllImages.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('img1');
    expect(records[0].blob).toBeInstanceOf(Blob);
    expect(records[0].thumb).toBeInstanceOf(Blob);
  });

  it('throws on a non-Tallio blob', async () => {
    await expect(restoreArchiveToStorage({ data: null }, { storage, imageStore })).rejects.toThrow(/valid Tallio backup/i);
  });
});
