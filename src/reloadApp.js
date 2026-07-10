// src/reloadApp.js
// Single injectable seam for a full reload after a wholesale data restore, so the
// import handler can be tested without jsdom's unimplemented location.reload.
export function reloadApp() {
  if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
    window.location.reload();
  }
}
