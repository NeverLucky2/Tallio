// src/iconUrlCache.js
// Pure diff for the <Icon> object-URL cache. Stable urls for unchanged thumbs
// (no flicker), new urls for new/changed thumbs, revoke for removed. The actual
// createObjectURL/revokeObjectURL are injected so this is testable in jsdom.
export function diffIconUrls(prev, images, make, revoke) {
  const next = new Map();
  const seen = new Set();
  for (const img of images || []) {
    if (!img || !img.id || !img.thumb) continue;
    seen.add(img.id);
    const existing = prev.get(img.id);
    if (existing && existing.thumb === img.thumb) {
      next.set(img.id, existing);
    } else {
      if (existing) revoke(existing.url);
      next.set(img.id, { url: make(img.thumb), thumb: img.thumb });
    }
  }
  for (const [id, entry] of prev) {
    if (!seen.has(id)) revoke(entry.url);
  }
  return next;
}
