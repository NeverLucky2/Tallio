// src/imageColors.js
// Pure color helpers for ambient effects. extractPalette buckets the pixels of a
// (typically tiny, ~32x32) RGBA array into a coarse color grid, then returns the
// averaged hex of the most frequent buckets. Deterministic for a given pixel
// order, so it is fully unit-testable without a canvas.

export function rgbToHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const STEP = 32; // quantization bucket width per channel

export function extractPalette(pixels, count = 5) {
  const buckets = new Map(); // key -> { r, g, b, n } (running sums + count)
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue; // skip near-transparent
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const key = `${Math.floor(r / STEP)},${Math.floor(g / STEP)},${Math.floor(b / STEP)}`;
    const cur = buckets.get(key);
    if (cur) { cur.r += r; cur.g += g; cur.b += b; cur.n += 1; }
    else buckets.set(key, { r, g, b, n: 1 });
  }
  // Stable sort (V8) keeps insertion order for ties -> deterministic.
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map(c => rgbToHex(c.r / c.n, c.g / c.n, c.b / c.n));
}
