// src/iconValue.js
// One resolver for the "emoji OR img:<id>" icon convention used by categories,
// accounts, account types, and app-level slots. Pure; no React, no DOM.
export function parseIconValue(value) {
  if (!value) return { kind: 'empty' };
  if (typeof value === 'string' && value.startsWith('img:')) {
    return { kind: 'image', id: value.slice(4) };
  }
  return { kind: 'emoji', emoji: value };
}

// For text-only contexts (e.g. <option>) that cannot embed an <img>: emoji
// passes through, an image token shows a fallback glyph, empty shows nothing.
export function iconGlyph(value, fallback = '🖼️') {
  const parsed = parseIconValue(value);
  if (parsed.kind === 'emoji') return parsed.emoji;
  if (parsed.kind === 'image') return fallback;
  return '';
}
