// src/crossWindowSync.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SYNCED_KEYS, watchOtherWindows, noteReloadFromOtherWindow, takeReloadNote,
} from './crossWindowSync.js';

function fire(key, storageArea = localStorage) {
  window.dispatchEvent(new StorageEvent('storage', { key, storageArea }));
}

describe('watchOtherWindows', () => {
  it('syncs exactly the main data keys', () => {
    expect([...SYNCED_KEYS].sort()).toEqual([
      'tallio-account-types', 'tallio-accounts', 'tallio-appearance', 'tallio-categories',
      'tallio-payees', 'tallio-report-acks', 'tallio-templates', 'tallio-transactions',
    ]);
  });

  it('calls onChange for every synced key', () => {
    const onChange = vi.fn();
    const stop = watchOtherWindows(onChange);
    for (const key of SYNCED_KEYS) fire(key);
    stop();
    expect(onChange.mock.calls.map(c => c[0])).toEqual(SYNCED_KEYS);
  });

  it('calls onChange when another window clears storage (key null)', () => {
    const onChange = vi.fn();
    const stop = watchOtherWindows(onChange);
    fire(null);
    stop();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores the clipboard, celebrations and unrelated keys', () => {
    const onChange = vi.fn();
    const stop = watchOtherWindows(onChange);
    fire('tallio-clipboard');
    fire('tallio-celebrations');
    fire('tallio-anthropic-key');
    fire('someone-else');
    stop();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores sessionStorage events', () => {
    const onChange = vi.fn();
    const stop = watchOtherWindows(onChange);
    fire('tallio-transactions', sessionStorage);
    stop();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops listening after unsubscribe', () => {
    const onChange = vi.fn();
    watchOtherWindows(onChange)();
    fire('tallio-transactions');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('reload note', () => {
  beforeEach(() => sessionStorage.clear());

  it('is taken exactly once', () => {
    expect(takeReloadNote()).toBe(false);
    noteReloadFromOtherWindow();
    expect(takeReloadNote()).toBe(true);
    expect(takeReloadNote()).toBe(false);
  });

  it('survives a storage that throws', () => {
    const broken = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
      removeItem() { throw new Error('denied'); },
    };
    expect(() => noteReloadFromOtherWindow(broken)).not.toThrow();
    expect(takeReloadNote(broken)).toBe(false);
  });
});
