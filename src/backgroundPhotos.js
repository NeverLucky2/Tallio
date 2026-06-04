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
