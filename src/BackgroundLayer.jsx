import React from 'react';
import { intensityToLayers, effectOpacity } from './backgroundMath.js';
import { getWallpaper } from './wallpapers.js';
import { clampFraming } from './backgroundPhotos.js';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function BackgroundLayer({ background, photos = [], activeIndex = 0, reducedMotion }) {
  const { base = 'solid', presetId = null, effects = {}, intensity = 25, framing = {}, effectStrength = 50 } = background || {};
  const rm = reducedMotion ?? prefersReducedMotion();
  const active = base !== 'solid' || effects.aurora || effects.pulse;
  const scrimAlpha = active ? intensityToLayers(intensity).scrimAlpha : 0;

  const wallpaper = base === 'preset' ? getWallpaper(presetId) : null;

  const activePalette = base === 'photos'
    ? (photos[activeIndex] && photos[activeIndex].palette)
    : base === 'preset'
      ? (wallpaper && wallpaper.palette)
      : null;
  const fxStyle = activePalette && activePalette.length
    ? {
        '--fx-1': activePalette[0],
        '--fx-2': activePalette[1] || activePalette[0],
        '--fx-3': activePalette[2] || activePalette[0],
      }
    : undefined;
  const effectStyle = { ...(fxStyle || {}), opacity: effectOpacity(effectStrength) };

  // Frost card surfaces only when an actual image sits behind them; over a solid
  // base (even with effects on) cards stay fully opaque for readability.
  const imageBase = base === 'photos' || base === 'preset';
  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const reset = () => {
      root.style.setProperty('--surface-alpha', '1');
      root.style.setProperty('--surface-blur', '0px');
    };
    if (imageBase) {
      const { surfaceAlpha, surfaceBlur } = intensityToLayers(intensity);
      root.style.setProperty('--surface-alpha', String(surfaceAlpha));
      root.style.setProperty('--surface-blur', `${surfaceBlur}px`);
    } else {
      reset();
    }
    return reset;
  }, [imageBase, intensity]);

  return (
    <div className={`bg-layer${rm ? ' bg-reduced-motion' : ''}`} aria-hidden="true">
      {wallpaper && <div className="bg-wallpaper" style={{ background: wallpaper.css }} />}

      {base === 'photos' && photos.map((p, i) => {
        const f = clampFraming(framing[p.id]);
        return (
          <div
            key={p.id || i}
            className={`bg-photo${i === activeIndex ? ' on' : ''}`}
            style={{
              backgroundImage: `url(${p.url})`,
              backgroundPosition: `${f.posX}% ${f.posY}%`,
              transform: `scale(${f.zoom})`,
              transformOrigin: `${f.posX}% ${f.posY}%`,
            }}
          />
        );
      })}

      {active && <div className="bg-scrim" style={{ opacity: scrimAlpha }} />}

      {effects.aurora && (
        <div className="bg-aurora" style={effectStyle}>
          <span className="bg-blob b1" /><span className="bg-blob b2" /><span className="bg-blob b3" />
        </div>
      )}
      {effects.pulse && (
        <div className="bg-pulse" style={effectStyle}>
          <span className="bg-glow g1" /><span className="bg-glow g2" />
        </div>
      )}
    </div>
  );
}
