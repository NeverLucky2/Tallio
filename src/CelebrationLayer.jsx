// src/CelebrationLayer.jsx
// Thin presentational layer for one celebration at a time. Confetti is CSS/DOM
// (no canvas) and never blocks clicks; the toast carries the specifics.
import React, { useEffect } from 'react';
import './CelebrationLayer.css';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const CONFETTI_COUNT = 24;

export default function CelebrationLayer({
  celebration, style = 'festive', reducedMotion, onDismiss, autoDismissMs = 6000,
}) {
  const rm = reducedMotion ?? prefersReducedMotion();
  const effective = style === 'off'
    ? 'off'
    : (style === 'festive' && !rm ? 'festive' : 'quiet');

  useEffect(() => {
    if (!celebration || effective === 'off' || !autoDismissMs) return undefined;
    const h = setTimeout(() => { if (onDismiss) onDismiss(); }, autoDismissMs);
    return () => clearTimeout(h);
  }, [celebration, effective, autoDismissMs, onDismiss]);

  if (!celebration || effective === 'off') return null;

  return (
    <div
      className={`celebration celebration-${effective}`}
      style={{ pointerEvents: 'none' }}
      role="status"
      aria-live="polite"
    >
      {effective === 'festive' && (
        <div className="celebration-confetti" aria-hidden="true">
          {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
            <span
              key={i}
              className={`confetti-piece p${i % 6}`}
              style={{ left: `${(i * 100) / CONFETTI_COUNT}%`, animationDelay: `${(i % 6) * 0.15}s` }}
            />
          ))}
        </div>
      )}
      <div className="celebration-toast" style={{ pointerEvents: 'auto' }}>
        <span className="celebration-emoji" aria-hidden="true">🎉</span>
        <div className="celebration-text">
          <div className="celebration-title">{celebration.title}</div>
          {celebration.detail && <div className="celebration-detail">{celebration.detail}</div>}
        </div>
        <button
          type="button"
          className="celebration-close"
          aria-label="Dismiss celebration"
          onClick={() => { if (onDismiss) onDismiss(); }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
