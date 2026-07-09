// src/useLiveFile.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('./fileStore.js', () => ({
  isLiveFileSupported: vi.fn(() => true),
  pickSaveFile: vi.fn(), pickOpenFile: vi.fn(),
  readHandle: vi.fn(), writeHandle: vi.fn().mockResolvedValue(),
  ensurePermission: vi.fn().mockResolvedValue(true),
  saveHandle: vi.fn().mockResolvedValue(), loadHandle: vi.fn().mockResolvedValue(null), clearHandle: vi.fn().mockResolvedValue(),
}));
import * as fileStore from './fileStore.js';
import useLiveFile, { SAVE_DEBOUNCE_MS } from './useLiveFile.js';

const getBytes = vi.fn().mockResolvedValue(new Uint8Array([1]));
const applyBytes = vi.fn().mockResolvedValue();
function setup() { return renderHook(() => useLiveFile({ getBytes, applyBytes })); }

beforeEach(() => { vi.clearAllMocks(); fileStore.isLiveFileSupported.mockReturnValue(true); fileStore.loadHandle.mockResolvedValue(null); });
afterEach(() => vi.useRealTimers());

describe('useLiveFile', () => {
  it('starts unlinked and supported', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('unlinked'));
    expect(result.current.supported).toBe(true);
  });

  it('linkNewFile picks a file, writes current bytes, and links', async () => {
    fileStore.pickSaveFile.mockResolvedValue({ name: 'MyBudget.tallio' });
    const { result } = setup();
    await act(async () => { await result.current.linkNewFile(); });
    expect(fileStore.writeHandle).toHaveBeenCalled();
    expect(fileStore.saveHandle).toHaveBeenCalled();
    expect(result.current.status).toBe('linked');
    expect(result.current.fileName).toBe('MyBudget.tallio');
  });

  it('scheduleSave debounces writes to the handle', async () => {
    vi.useFakeTimers();
    fileStore.pickSaveFile.mockResolvedValue({ name: 'B.tallio' });
    const { result } = setup();
    await act(async () => { await result.current.linkNewFile(); });
    fileStore.writeHandle.mockClear();
    act(() => { result.current.scheduleSave(); result.current.scheduleSave(); result.current.scheduleSave(); });
    expect(fileStore.writeHandle).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10); });
    expect(fileStore.writeHandle).toHaveBeenCalledTimes(1);
  });

  it('reattaches a persisted handle on mount without importing', async () => {
    fileStore.loadHandle.mockResolvedValue({ name: 'Saved.tallio' });
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('linked'));
    expect(applyBytes).not.toHaveBeenCalled();
    expect(result.current.fileName).toBe('Saved.tallio');
  });
});
