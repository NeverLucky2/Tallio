// Maps the 0..100 "intensity" slider to render values.
// scrimAlpha: opacity of the readability veil over the background.
// surfaceAlpha / surfaceBlur: card translucency + blur — reserved for Phase 2b
// (photos); kept here so the slider has one source of truth.
export function intensityToLayers(intensity) {
  const t = Math.max(0, Math.min(100, Number(intensity) || 0)) / 100;
  const lerp = (a, b, x) => a + (b - a) * x;
  return {
    scrimAlpha: +lerp(0.8, 0.12, t).toFixed(3),
    surfaceAlpha: +lerp(1, 0, Math.min(1, t * 1.25)).toFixed(3),
    surfaceBlur: +lerp(0, 10, t).toFixed(1),
  };
}
