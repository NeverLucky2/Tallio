// src/useCelebrations.js
// Owns celebration tracking state (separate from financial data), runs debounced
// detection over the ledger, and exposes a one-at-a-time queue + the style setting.
import { useState, useEffect, useRef, useCallback } from 'react';
import { detectAchieved, diffCelebrations } from './celebrationMath.js';

const STORAGE_KEY = 'tallio-celebrations';
const VALID_STYLES = ['festive', 'quiet', 'off'];

export function loadCelebrationState() {
  const base = { seen: {}, baselinedTypes: [], style: 'festive' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw);
    const style = p && p.settings && VALID_STYLES.includes(p.settings.style) ? p.settings.style : 'festive';
    return {
      seen: (p && typeof p.seen === 'object' && p.seen) || {},
      baselinedTypes: Array.isArray(p && p.baselinedTypes) ? p.baselinedTypes : [],
      style,
    };
  } catch {
    return base;
  }
}

export default function useCelebrations({
  accounts, transactions, typesById, categoriesById, now, debounceMs = 400,
} = {}) {
  const [tracking, setTracking] = useState(() => {
    const i = loadCelebrationState();
    return { seen: i.seen, baselinedTypes: i.baselinedTypes };
  });
  const [style, setStyleState] = useState(() => loadCelebrationState().style);
  const [queue, setQueue] = useState([]);

  // Refs synced via effects only (react-hooks/refs v6: no ref mirroring in render).
  const trackingRef = useRef(tracking);
  useEffect(() => { trackingRef.current = tracking; }, [tracking]);
  const styleRef = useRef(style);
  useEffect(() => { styleRef.current = style; }, [style]);
  const nowRef = useRef(now);
  useEffect(() => { nowRef.current = now; }, [now]);

  const write = useCallback((tr, st) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        seen: tr.seen, baselinedTypes: tr.baselinedTypes, settings: { style: st },
      }));
    } catch { /* ignore quota */ }
  }, []);

  // Debounced detection: a transient balance crossing mid-edit won't fire.
  useEffect(() => {
    const handle = setTimeout(() => {
      const nowVal = nowRef.current ? nowRef.current() : new Date();
      const achieved = detectAchieved({ accounts, transactions, typesById, categoriesById, now: nowVal });
      const { toCelebrate, nextState } = diffCelebrations(achieved, trackingRef.current);
      setTracking(nextState);
      write(nextState, styleRef.current);
      if (styleRef.current !== 'off' && toCelebrate.length > 0) {
        setQueue((prev) => [...prev, ...toCelebrate]);
      }
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [accounts, transactions, typesById, categoriesById, debounceMs, write]);

  const dismiss = useCallback(() => setQueue((prev) => prev.slice(1)), []);

  const setStyle = useCallback((next) => {
    if (!VALID_STYLES.includes(next)) return;
    setStyleState(next);
    write(trackingRef.current, next);
  }, [write]);

  return { current: queue[0] || null, queueLength: queue.length, dismiss, style, setStyle };
}
