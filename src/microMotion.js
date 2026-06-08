// src/microMotion.js
// Pure helpers for tasteful motion. shouldAnimate() is the single gate: it is
// false unless the browser exposes matchMedia AND the user hasn't asked for
// reduced motion — so jsdom (no matchMedia) is non-animating and deterministic.
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function interpolate(from, to, p) {
  return from + (to - from) * p;
}

export function shouldAnimate() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
