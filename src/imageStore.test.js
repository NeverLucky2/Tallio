// src/imageStore.test.js
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { putRecord, getImage, listImages, updateImageMeta, deleteImage, putImage, replaceAllImages } from './imageStore.js';

const reset = () => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase('tallio-images');
  req.onsuccess = req.onerror = req.onblocked = () => resolve();
});

const rec = (id, over = {}) => ({
  id, blob: new Blob(['x'], { type: 'image/jpeg' }), type: 'image/jpeg',
  w: 10, h: 10, name: id, group: 'Family', thumb: new Blob(['t']),
  palette: ['#111111'], createdAt: 1, ...over,
});

describe('imageStore', () => {
  beforeEach(reset);

  it('puts and gets a record by id', async () => {
    await putRecord(rec('a'));
    const got = await getImage('a');
    expect(got.id).toBe('a');
    expect(got.name).toBe('a');
    expect(got.palette).toEqual(['#111111']);
  });

  it('getImage returns undefined for a missing id', async () => {
    expect(await getImage('nope')).toBeUndefined();
  });

  it('listImages returns all records sorted by createdAt', async () => {
    await putRecord(rec('a', { createdAt: 30 }));
    await putRecord(rec('b', { createdAt: 10 }));
    await putRecord(rec('c', { createdAt: 20 }));
    expect((await listImages()).map(r => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('updateImageMeta merges fields and keeps the blob', async () => {
    await putRecord(rec('a'));
    const updated = await updateImageMeta('a', { name: 'Beach', group: 'Scenery' });
    expect(updated.name).toBe('Beach');
    expect(updated.group).toBe('Scenery');
    expect((await getImage('a')).name).toBe('Beach');
  });

  it('updateImageMeta returns null for a missing id', async () => {
    expect(await updateImageMeta('nope', { name: 'x' })).toBeNull();
  });

  it('deleteImage removes the record', async () => {
    await putRecord(rec('a'));
    await deleteImage('a');
    expect(await getImage('a')).toBeUndefined();
  });

  it('replaceAllImages clears the store and writes the given records', async () => {
    await putRecord(rec('a'));
    await putRecord(rec('b'));
    await replaceAllImages([rec('c'), rec('d')]);
    expect((await listImages()).map(r => r.id)).toEqual(['c', 'd']);
  });

  it('replaceAllImages with [] empties the store', async () => {
    await putRecord(rec('a'));
    await replaceAllImages([]);
    expect(await listImages()).toEqual([]);
  });
});

describe('imageStore.putImage', () => {
  beforeEach(reset);

  it('stores a record built from the processor output + metadata', async () => {
    const fakeProcess = async () => ({
      blob: new Blob(['img'], { type: 'image/jpeg' }), type: 'image/jpeg',
      w: 100, h: 80, thumb: new Blob(['t']), palette: ['#abcdef'],
    });
    const file = new File(['raw'], 'beach.jpg', { type: 'image/jpeg' });

    const saved = await putImage(file, { group: 'Scenery' }, { process: fakeProcess });

    expect(saved.id).toBeTruthy();
    expect(typeof saved.createdAt).toBe('number');
    expect(saved.name).toBe('beach.jpg'); // falls back to the file name
    expect(saved.group).toBe('Scenery');
    expect(saved.palette).toEqual(['#abcdef']);

    const got = await getImage(saved.id);
    expect(got.w).toBe(100);
    expect(got.type).toBe('image/jpeg');
  });

  it('prefers an explicit name over the file name', async () => {
    const fakeProcess = async () => ({ blob: new Blob(['i']), type: 'image/jpeg', w: 1, h: 1, thumb: new Blob(['t']), palette: [] });
    const file = new File(['raw'], 'IMG_0001.jpg', { type: 'image/jpeg' });
    const saved = await putImage(file, { name: 'Sunset' }, { process: fakeProcess });
    expect(saved.name).toBe('Sunset');
    expect(saved.group).toBe('Uncategorized'); // default group
  });
});
