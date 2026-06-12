// src/NetWorthSpark.jsx
// Six-month net-worth sparkline under the sidebar figure. Renders BOTH
// geometries — a line and bars — and stays finish-agnostic: finishes.css
// shows the line in Bullion and the bars in Instrument.
import React from 'react';

const W = 100; // viewBox units
const H = 32;
const PAD = 2;

export default function NetWorthSpark({ series = [] }) {
  if (!Array.isArray(series) || series.length < 2) return null;

  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1; // flat series → centered, never NaN
  const x = (i) => PAD + (i * (W - PAD * 2)) / (series.length - 1);
  const y = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const points = series.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const barW = (W - PAD * 2) / series.length - 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Net worth, last ${series.length} months`}
    >
      <polyline className="nws-line" points={points} fill="none" vectorEffect="non-scaling-stroke" />
      <g className="nws-bars">
        {series.map((v, i) => {
          const top = y(v);
          return (
            <rect
              key={i}
              className={`nws-bar${i === series.length - 1 ? ' nws-bar-now' : ''}`}
              x={(PAD + (i * (W - PAD * 2)) / series.length + 1).toFixed(2)}
              y={top.toFixed(2)}
              width={Math.max(barW, 1).toFixed(2)}
              height={Math.max(H - PAD - top, 1).toFixed(2)}
            />
          );
        })}
      </g>
    </svg>
  );
}
