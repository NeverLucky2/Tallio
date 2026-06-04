// src/wallpapers.js
// Bundled "preset wallpaper" backgrounds. Each is a pure CSS background value
// (no binary assets) plus a palette used to color ambient effects over it.
export const WALLPAPERS = [
  { id: 'dusk',   name: 'Dusk',   css: 'linear-gradient(160deg, #1a1033 0%, #3b1d5e 45%, #b65d8f 100%)', palette: ['#3b1d5e', '#b65d8f', '#1a1033'] },
  { id: 'tide',   name: 'Tide',   css: 'linear-gradient(160deg, #04263b 0%, #0a6e7a 55%, #46c0a8 100%)', palette: ['#0a6e7a', '#46c0a8', '#04263b'] },
  { id: 'ember',  name: 'Ember',  css: 'linear-gradient(160deg, #2a0f0f 0%, #7a2e1e 50%, #e0a45a 100%)', palette: ['#7a2e1e', '#e0a45a', '#2a0f0f'] },
  { id: 'forest', name: 'Forest', css: 'linear-gradient(160deg, #0c1f14 0%, #1f4d33 55%, #6fae7a 100%)', palette: ['#1f4d33', '#6fae7a', '#0c1f14'] },
];

export function getWallpaper(id) {
  return WALLPAPERS.find(w => w.id === id) || null;
}
