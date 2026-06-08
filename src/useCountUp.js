// src/useCountUp.js
// Animates a number from 0 -> target on first view only; later target changes
// snap (no re-animation while editing). Always settles on the exact target.
// Non-animating environments (reduced motion, no matchMedia, disabled) return
// the target immediately.
import { useState, useRef, useEffect } from 'react';
import { easeOutCubic, interpolate, shouldAnimate } from './microMotion.js';

export default function useCountUp(target, { durationMs = 900, enabled = true } = {}) {
  const animate = enabled && shouldAnimate();
  const [value, setValue] = useState(animate ? 0 : target);
  const didInit = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    if (didInit.current) {
      // Target changed after the first view: snap, don't re-animate.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(target);
      return undefined;
    }
    didInit.current = true;
    if (!animate) return undefined; // initial state already equals target
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / durationMs, 1);
      setValue(interpolate(0, target, easeOutCubic(p)));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else setValue(target);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, animate, durationMs]);

  return value;
}
