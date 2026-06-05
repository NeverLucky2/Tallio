// src/iconUsage.js
// Best-effort count of how many things point at an image (for the delete
// "Used by N" hint). Never enforces — deletion is always allowed; a stale
// img:<id> reference simply falls back to a glyph in <Icon>. Pure.
export function countIconUsage(imageId, { categories = [], accounts = [], accountTypes = [], appIcons = {} } = {}) {
  const token = `img:${imageId}`;
  let n = 0;
  for (const c of categories || []) {
    if (c && c.icon === token) n++;
    for (const s of (c && c.subcategories) || []) if (s && s.icon === token) n++;
  }
  for (const a of accounts || []) if (a && a.icon === token) n++;
  for (const t of accountTypes || []) if (t && t.icon === token) n++;
  for (const v of Object.values(appIcons || {})) if (v === token) n++;
  return n;
}
