// src/useReportAcks.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useReportAcks from './useReportAcks.js';

const KEY = 'tallio-report-acks';
beforeEach(() => localStorage.clear());

describe('useReportAcks', () => {
  it('starts empty when storage is empty', () => {
    const { result } = renderHook(() => useReportAcks());
    expect(result.current.subscriptions).toEqual({});
    expect(result.current.dismissedDuplicates).toEqual([]);
  });
  it('persists synchronously so a status survives an immediate reload', () => {
    const h1 = renderHook(() => useReportAcks());
    act(() => { h1.result.current.setStatus('NETFLIX', 'ongoing'); });
    const h2 = renderHook(() => useReportAcks()); // simulated reload, no timer advance
    expect(h2.result.current.subscriptions.NETFLIX).toEqual({ status: 'ongoing' });
  });
  it('setStatus stores ongoing and cancelled (with month)', () => {
    const { result } = renderHook(() => useReportAcks());
    act(() => result.current.setStatus('NETFLIX', 'ongoing'));
    act(() => result.current.setStatus('SPOTIFY', 'cancelled', '2026-01'));
    expect(result.current.subscriptions.NETFLIX).toEqual({ status: 'ongoing' });
    expect(result.current.subscriptions.SPOTIFY).toEqual({ status: 'cancelled', cancelledAsOf: '2026-01' });
  });
  it('clearStatus removes an entry', () => {
    const { result } = renderHook(() => useReportAcks());
    act(() => result.current.setStatus('NETFLIX', 'ongoing'));
    act(() => result.current.clearStatus('NETFLIX'));
    expect(result.current.subscriptions.NETFLIX).toBeUndefined();
  });
  it('dismissDuplicate/restoreDuplicate manage signatures without dupes', () => {
    const { result } = renderHook(() => useReportAcks());
    act(() => result.current.dismissDuplicate('d1|d2'));
    act(() => result.current.dismissDuplicate('d1|d2'));
    expect(result.current.dismissedDuplicates).toEqual(['d1|d2']);
    act(() => result.current.restoreDuplicate('d1|d2'));
    expect(result.current.dismissedDuplicates).toEqual([]);
  });
  it('hydrates from localStorage', () => {
    localStorage.setItem(KEY, JSON.stringify({ subscriptions: { X: { status: 'ongoing' } }, dismissedDuplicates: ['a|b'] }));
    const { result } = renderHook(() => useReportAcks());
    expect(result.current.subscriptions.X.status).toBe('ongoing');
    expect(result.current.dismissedDuplicates).toEqual(['a|b']);
  });
  it('tolerates a corrupt key', () => {
    localStorage.setItem(KEY, '{not json');
    const { result } = renderHook(() => useReportAcks());
    expect(result.current.subscriptions).toEqual({});
  });
  it('exportSnapshot returns the current acks', () => {
    const { result } = renderHook(() => useReportAcks());
    act(() => result.current.setStatus('NETFLIX', 'ongoing'));
    expect(result.current.exportSnapshot()).toEqual({ subscriptions: { NETFLIX: { status: 'ongoing' } }, dismissedDuplicates: [] });
  });
  it('restore replaces the full state from a snapshot (undo round-trip)', () => {
    const { result } = renderHook(() => useReportAcks());
    let snap;
    act(() => { snap = result.current.exportSnapshot(); }); // empty snapshot
    act(() => result.current.setStatus('NETFLIX', 'ongoing'));
    act(() => result.current.dismissDuplicate('d1|d2'));
    expect(result.current.subscriptions.NETFLIX).toEqual({ status: 'ongoing' });
    expect(result.current.dismissedDuplicates).toEqual(['d1|d2']);
    act(() => result.current.restore(snap));
    expect(result.current.subscriptions).toEqual({});
    expect(result.current.dismissedDuplicates).toEqual([]);
  });
  it('restore tolerates a missing or partial snapshot', () => {
    const { result } = renderHook(() => useReportAcks());
    act(() => result.current.setStatus('NETFLIX', 'ongoing'));
    act(() => result.current.restore(undefined));
    expect(result.current.subscriptions).toEqual({});
    expect(result.current.dismissedDuplicates).toEqual([]);
    act(() => result.current.restore({ subscriptions: { X: { status: 'ongoing' } } }));
    expect(result.current.subscriptions.X.status).toBe('ongoing');
    expect(result.current.dismissedDuplicates).toEqual([]);
  });
});
