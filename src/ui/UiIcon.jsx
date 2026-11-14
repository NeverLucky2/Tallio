// src/ui/UiIcon.jsx
// Chrome icons only (nav, buttons). User content icons live in Icon.jsx.
// 24x24 viewBox, 1.6 stroke, currentColor. Paths derived from the approved mockups.
import React from 'react';

const PATHS = {
  menu:     'M3 6h18M3 12h18M3 18h18',
  grid:     'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  chart:    'M3 3v18h18 M7 14l3-4 3 2 4-6',
  scan:     'M3 9V7a2 2 0 0 1 2-2h2 M17 5h2a2 2 0 0 1 2 2v2 M21 15v2a2 2 0 0 1-2 2h-2 M7 19H5a2 2 0 0 1-2-2v-2 M3 12h18',
  upload:   'M12 16V4 M7 9l5-5 5 5 M5 20h14',
  phone:    'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M11 18h2',
  undo:     'M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
  plus:     'M12 5v14M5 12h14',
  transfer: 'M7 10l-4-4 4-4M3 6h13M17 14l4 4-4 4M21 18H8',
  search:   'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4-4',
  calendar: 'M3 4h18v17H3z M3 9h18 M8 2v4 M16 2v4',
  chevron:  'M6 9l6 6 6-6',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5H10l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z',
  tag:      'M4 4h7l9 9-7 7-9-9V4z M8.5 8.5h.01',
  layers:   'M12 3l9 5-9 5-9-5 9-5z M3 14l9 5 9-5',
  check:    'M5 12l5 5L20 6',
  palette:  'M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.1-.9-1.5-.9-2.5 0-.9.7-1.6 1.7-1.6H17a4 4 0 0 0 4-4c0-4.5-4-8.2-9-8.2z M7.5 12h.01 M9.5 7.8h.01 M14.5 7.8h.01',
  download: 'M12 4v12 M7 11l5 5 5-5 M5 20h14',
  restore:  'M4 12a8 8 0 1 0 2.6-5.9 M4 4v4.5h4.5 M12 8v4.5l3 1.8',
  close:    'M6 6l12 12 M18 6L6 18',
  chevronRight: 'M9 6l6 6-6 6',
};

export default function UiIcon({ name, label, className = '', size = 18 }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      className={`ui-icon ${className}`.trim()}
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round"
      role={label ? 'img' : 'presentation'} aria-label={label} aria-hidden={label ? undefined : 'true'}
    >
      <path d={d} />
    </svg>
  );
}
