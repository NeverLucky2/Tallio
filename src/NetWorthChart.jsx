// src/NetWorthChart.jsx
import React from 'react';
import { sparklinePath } from './reportsModel.js';

const W = 680, H = 140, PAD = 8;
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

export default function NetWorthChart({ data }) {
  if (!data || data.length === 0) return <p className="panel-empty">No data in this period</p>;
  const values = data.map(d => d.netWorth);
  const { d, points } = sparklinePath(values, { width: W, height: H, pad: PAD });
  const last = data[data.length - 1];
  return (
    <div className="networth-wrap">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Net worth over time">
        <path className="networth-line" d={d} fill="none" />
        {points.length > 0 && <circle className="networth-dot" cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" />}
      </svg>
      <p className="networth-current">Now: <strong>{money(last.netWorth)}</strong></p>
    </div>
  );
}
