// src/useValueFlash.js
// Returns true briefly when `value` changes, so a number can highlight what moved.
// Silent on mount and under reduced motion.
import { useState, useRef, useEffect } from 'react';
import { shouldAnimate } from './microMotion.js';

export default function useValueFlash(value, { durationMs = 1000 } = {}) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return undefined;
    prev.current = value;
    if (!shouldAnimate()) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlash(true);
    const h = setTimeout(() => setFlash(false), durationMs);
    return () => clearTimeout(h);
  }, [value, durationMs]);

  return flash;
}
