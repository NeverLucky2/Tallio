// src/iconCrop.js
// Pure square-crop math for image-icons. Reuses clampFraming (square aspect,
// identical shape to the background framing). Returns the source rectangle to
// pass to canvas drawImage; the canvas call itself lives in imageProcess.js.
import { clampFraming } from './backgroundPhotos.js';

export function cropRect(srcW, srcH, framing) {
  const f = clampFraming(framing);
  const side = Math.min(srcW, srcH) / f.zoom;
  const sx = (f.posX / 100) * (srcW - side);
  const sy = (f.posY / 100) * (srcH - side);
  return {
    sx: Math.round(sx),
    sy: Math.round(sy),
    sw: Math.round(side),
    sh: Math.round(side),
  };
}
