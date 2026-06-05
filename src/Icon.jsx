// src/Icon.jsx
// One renderer for every icon. Emoji -> text span; img:<id> -> <img> from the
// IconLibrary url cache; missing/deleted id -> fallback glyph (never a crash).
import React from 'react';
import { parseIconValue } from './iconValue.js';
import { useIconLibrary } from './iconLibraryContext.js';

export default function Icon({ value, className = '', title, fallback = '🖼️' }) {
  const { urlForId } = useIconLibrary();
  const parsed = parseIconValue(value);

  if (parsed.kind === 'image') {
    const url = urlForId(parsed.id);
    if (url) {
      return <img className={`icon-img ${className}`.trim()} src={url} alt="" title={title} />;
    }
    return <span className={className} aria-hidden="true" title={title}>{fallback}</span>;
  }

  return (
    <span className={className} aria-hidden="true" title={title}>
      {parsed.kind === 'emoji' ? parsed.emoji : ''}
    </span>
  );
}
