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

// Maps the 0..100 effect-strength slider to an opacity multiplier applied to the
// ambient effect layers (subtle 0.15 -> vivid 1.0). Default 50 when unset.
export function effectOpacity(strength) {
  const s = Number.isFinite(Number(strength)) ? Number(strength) : 50;
  const t = Math.max(0, Math.min(100, s)) / 100;
  return +(0.15 + t * 0.85).toFixed(3);
}
