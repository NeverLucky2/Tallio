// src/appearanceHistory.js
// Pure helper that powers undo coalescing in App.jsx. Continuous controls
// (sliders, color inputs) pass a stable opKey so a burst collapses into one
// undo step; discrete actions pass null and always push a fresh step.
export function coalesceHistory(prev, makeEntry, opKey, cap = 20) {
  const list = Array.isArray(prev) ? prev : [];
  if (opKey && list.length && list[list.length - 1].opKey === opKey) {
    return list; // coalesce — keep the pre-burst snapshot, compute nothing
  }
  const entry = { ...makeEntry(), opKey: opKey || null };
  return [...list.slice(-(cap - 1)), entry];
}
