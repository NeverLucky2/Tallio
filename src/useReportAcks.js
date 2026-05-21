// src/useReportAcks.js
import { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'billtracker-report-acks';
const PERSIST_DEBOUNCE_MS = 250;

const empty = () => ({ subscriptions: {}, dismissedDuplicates: [] });

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty();
    return {
      subscriptions: (parsed.subscriptions && typeof parsed.subscriptions === 'object') ? parsed.subscriptions : {},
      dismissedDuplicates: Array.isArray(parsed.dismissedDuplicates) ? parsed.dismissedDuplicates : [],
    };
  } catch {
    return empty();
  }
}

// Owns user acknowledgments for the Recurring report: per-subscription status
// (keyed by a recurring charge's normalized `key`) and dismissed duplicate signatures.
export default function useReportAcks() {
  const [acks, setAcks] = useState(load);
  const [storageError, setStorageError] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(acks));
        if (storageError !== null) setStorageError(null);
      } catch (e) {
        console.error('Failed to save report acks:', e);
        setStorageError({ message: "Couldn't save report settings — storage full." });
      }
    }, PERSIST_DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [acks]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = useCallback((key, status, cancelledAsOf) => {
    if (!key) return;
    const entry = status === 'cancelled' ? { status, cancelledAsOf } : { status };
    setAcks(prev => ({ ...prev, subscriptions: { ...prev.subscriptions, [key]: entry } }));
  }, []);

  const clearStatus = useCallback((key) => {
    setAcks(prev => {
      const next = { ...prev.subscriptions };
      delete next[key];
      return { ...prev, subscriptions: next };
    });
  }, []);

  const dismissDuplicate = useCallback((signature) => {
    if (!signature) return;
    setAcks(prev => prev.dismissedDuplicates.includes(signature)
      ? prev
      : { ...prev, dismissedDuplicates: [...prev.dismissedDuplicates, signature] });
  }, []);

  const restoreDuplicate = useCallback((signature) => {
    setAcks(prev => ({ ...prev, dismissedDuplicates: prev.dismissedDuplicates.filter(s => s !== signature) }));
  }, []);

  const clearStorageError = useCallback(() => setStorageError(null), []);
  const exportSnapshot = useCallback(
    () => ({ subscriptions: acks.subscriptions, dismissedDuplicates: acks.dismissedDuplicates }),
    [acks]
  );
  const restore = useCallback((snapshot) => {
    setAcks({
      subscriptions: (snapshot && typeof snapshot.subscriptions === 'object' && snapshot.subscriptions) ? snapshot.subscriptions : {},
      dismissedDuplicates: Array.isArray(snapshot && snapshot.dismissedDuplicates) ? snapshot.dismissedDuplicates : [],
    });
  }, []);

  return {
    subscriptions: acks.subscriptions,
    dismissedDuplicates: acks.dismissedDuplicates,
    setStatus, clearStatus, dismissDuplicate, restoreDuplicate,
    storageError, clearStorageError, exportSnapshot, restore,
  };
}
