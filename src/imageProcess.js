// src/imageProcess.js
// Turns an uploaded File into a stored image record's media fields. The canvas
// work (re-encode, square thumbnail, palette sampling) cannot run in jsdom, so
// processImageFile is verified manually via `npm run dev`; only the pure
// dimension math (fitWithin) is unit-tested.
import { extractPalette } from './imageColors.js';

export function fitWithin(w, h, max) {
  if (w <= max && h <= max) return { w, h };
  const scale = w >= h ? max / w : max / h;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// MANUAL-VERIFY (canvas): returns { blob, type, w, h, thumb, palette }.
export async function processImageFile(file, { maxEdge = 2560, thumbSize = 128 } = {}) {
  const bitmap = await createImageBitmap(file);
  const { w, h } = fitWithin(bitmap.width, bitmap.height, maxEdge);

  const main = document.createElement('canvas');
  main.width = w; main.height = h;
  main.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  const blob = await toBlob(main, 'image/jpeg', 0.85);

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const tc = document.createElement('canvas');
  tc.width = thumbSize; tc.height = thumbSize;
  tc.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, thumbSize, thumbSize);
  const thumb = await toBlob(tc, 'image/jpeg', 0.8);

  const pc = document.createElement('canvas');
  pc.width = 32; pc.height = 32;
  const pctx = pc.getContext('2d');
  pctx.drawImage(bitmap, 0, 0, 32, 32);
  const palette = extractPalette(pctx.getImageData(0, 0, 32, 32).data, 5);

  if (bitmap.close) bitmap.close();
  return { blob, type: 'image/jpeg', w, h, thumb, palette };
}
