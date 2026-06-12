// src/TallyMark.jsx
// The Tallio brand mark: a tally "gate of five" (four strokes + diagonal),
// drawn with the theme accent so every theme re-inks it. Decorative only.
import React from 'react';

export default function TallyMark({ size = 24, className = '' }) {
  return (
    <svg
      viewBox="0 0 28 24"
      width={size}
      height={Math.round(size * (24 / 28))}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="var(--accent, #d4a853)" strokeWidth="2.4" strokeLinecap="round">
        <line x1="4" y1="3" x2="4" y2="21" />
        <line x1="10" y1="3" x2="10" y2="21" />
        <line x1="16" y1="3" x2="16" y2="21" />
        <line x1="22" y1="3" x2="22" y2="21" />
        <line x1="1" y1="17" x2="26" y2="6" />
      </g>
    </svg>
  );
}
