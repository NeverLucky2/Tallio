// src/konami.js
export const KONAMI_SEQUENCE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
];

// True when the tail of `buffer` equals `seq` (case already normalized by caller).
export function endsWithSequence(buffer, seq) {
  if (buffer.length < seq.length) return false;
  const tail = buffer.slice(buffer.length - seq.length);
  return seq.every((k, i) => tail[i] === k);
}
