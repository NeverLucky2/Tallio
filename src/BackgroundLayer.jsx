import React from 'react';
import { intensityToLayers } from './backgroundMath.js';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function BackgroundLayer({ background, reducedMotion }) {
  const { base = 'solid', effects = {}, intensity = 25 } = background || {};
  const rm = reducedMotion ?? prefersReducedMotion();
  const active = base !== 'solid' || effects.aurora || effects.pulse;
  const scrimAlpha = active ? intensityToLayers(intensity).scrimAlpha : 0;

  return (
    <div className={`bg-layer${rm ? ' bg-reduced-motion' : ''}`} aria-hidden="true">
      {effects.aurora && (
        <div className="bg-aurora">
          <span className="bg-blob b1" /><span className="bg-blob b2" /><span className="bg-blob b3" />
        </div>
      )}
      {effects.pulse && (
        <div className="bg-pulse">
          <span className="bg-glow g1" /><span className="bg-glow g2" />
        </div>
      )}
      {active && <div className="bg-scrim" style={{ opacity: scrimAlpha }} />}
    </div>
  );
}
