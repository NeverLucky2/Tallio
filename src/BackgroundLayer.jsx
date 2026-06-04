import React from 'react';
import { intensityToLayers } from './backgroundMath.js';
import { getWallpaper } from './wallpapers.js';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function BackgroundLayer({ background, photos = [], activeIndex = 0, reducedMotion }) {
  const { base = 'solid', presetId = null, effects = {}, intensity = 25 } = background || {};
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

  return (
    <div className={`bg-layer${rm ? ' bg-reduced-motion' : ''}`} aria-hidden="true">
      {wallpaper && <div className="bg-wallpaper" style={{ background: wallpaper.css }} />}

      {base === 'photos' && photos.map((p, i) => (
        <div
          key={p.id || i}
          className={`bg-photo${i === activeIndex ? ' on' : ''}`}
          style={{ backgroundImage: `url(${p.url})` }}
        />
      ))}

      {effects.aurora && (
        <div className="bg-aurora" style={fxStyle}>
          <span className="bg-blob b1" /><span className="bg-blob b2" /><span className="bg-blob b3" />
        </div>
      )}
      {effects.pulse && (
        <div className="bg-pulse" style={fxStyle}>
          <span className="bg-glow g1" /><span className="bg-glow g2" />
        </div>
      )}
      {active && <div className="bg-scrim" style={{ opacity: scrimAlpha }} />}
    </div>
  );
}
