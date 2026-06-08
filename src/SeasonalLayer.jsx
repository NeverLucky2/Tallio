// src/SeasonalLayer.jsx
// Subtle, off-able, reduced-motion-safe ambient seasonal effect. Full-viewport
// front overlay with pointer-events:none so it never blocks or obscures use.
import React from 'react';
import { seasonForDate, holidayForDate } from './seasonalMath.js';
import './SeasonalLayer.css';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Glyph set + particle count per effect.
const EFFECTS = {
  winter:    { glyphs: ['❄', '❅', '❆'], count: 14 },
  spring:    { glyphs: ['🌸', '🌷', '🌼'], count: 12 },
  summer:    { glyphs: ['☀️', '🐚', '🌴', '🕶️'], count: 8 },
  autumn:    { glyphs: ['🍂', '🍁'], count: 14 },
  newyear:   { glyphs: ['✨', '🎉', '⭐'], count: 14 },
  halloween: { glyphs: ['🎃', '👻', '🦇'], count: 12 },
};

export default function SeasonalLayer({ now = new Date(), enabled = true, reducedMotion }) {
  const rm = reducedMotion ?? prefersReducedMotion();
  if (!enabled || rm) return null;

  const holiday = holidayForDate(now);
  const kind = holiday || seasonForDate(now);
  const effect = EFFECTS[kind];
  if (!effect) return null;

  const pieces = Array.from({ length: effect.count }).map((_, i) => ({
    glyph: effect.glyphs[i % effect.glyphs.length],
    left: (i * 100) / effect.count,
    delay: (i % 6) * 0.7,
    dur: 7 + (i % 5),
  }));

  return (
    <div className={`seasonal-layer seasonal-${kind}`} style={{ pointerEvents: 'none' }} aria-hidden="true">
      {kind === 'summer' && <div className="seasonal-sunglow" />}
      {pieces.map((p, i) => (
        <span
          key={i}
          className="seasonal-particle"
          style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
}
