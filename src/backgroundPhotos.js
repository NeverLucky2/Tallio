// src/backgroundPhotos.js
// Resolve the ordered image ids a photo background should display. A set
// photoGroup overrides the explicit photoIds: it selects every library image in
// that group, ordered by createdAt. Otherwise the explicit, ordered photoIds are
// used, filtered to ids that still exist in the library. Pure + unit-testable.
export function resolvePhotoIds(background, metas) {
  const list = Array.isArray(metas) ? metas : [];
  const bg = background || {};
  if (bg.photoGroup) {
    return list
      .filter(m => m.group === bg.photoGroup)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map(m => m.id);
  }
  const byId = new Set(list.map(m => m.id));
  return (bg.photoIds || []).filter(id => byId.has(id));
}

const clampNum = (n, lo, hi, dflt) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.max(lo, Math.min(hi, v));
};

// Normalize a per-photo framing record, filling defaults (centered, no zoom).
export function clampFraming(framing) {
  const f = framing || {};
  return {
    posX: clampNum(f.posX, 0, 100, 50),
    posY: clampNum(f.posY, 0, 100, 50),
    zoom: clampNum(f.zoom, 1, 3, 1),
  };
}

// Single mode keeps exactly one photo (clicking replaces); slideshow toggles.
export function togglePhotoSelection(photoIds, id, mode) {
  const ids = Array.isArray(photoIds) ? photoIds : [];
  if (mode === 'single') return [id];
  return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
}

// Drop a deleted image from the background's selection + framing.
export function pruneDeletedPhoto(background, id) {
  const bg = background || {};
  const photoIds = (bg.photoIds || []).filter(x => x !== id);
  const framing = { ...(bg.framing || {}) };
  delete framing[id];
  return { photoIds, framing };
}

// Convert a pointer position (within a DOMRect-like) to focal 0..100 percentages.
export function focalFromPointer(rect, clientX, clientY) {
  const pct = (val, start, size) => {
    if (!size) return 50;
    return Math.round(Math.max(0, Math.min(1, (val - start) / size)) * 100);
  };
  return { posX: pct(clientX, rect.left, rect.width), posY: pct(clientY, rect.top, rect.height) };
}
