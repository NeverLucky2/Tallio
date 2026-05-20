// src/CashFlowChart.jsx
import React from 'react';
import { barLayout } from './reportsModel.js';

const W = 680, H = 120;

export default function CashFlowChart({ data }) {
  if (!data || data.length === 0) return <p className="panel-empty">No activity in this period</p>;
  const bars = barLayout(data.map(d => d.net), { width: W, height: H, gap: 6 });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Net cash flow by month">
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="chart-axis" />
      {bars.map((b, i) => (
        <rect key={data[i].month} className={`cashflow-bar ${b.negative ? 'is-neg' : 'is-pos'}`}
          x={b.x} y={b.y} width={b.width} height={b.height} />
      ))}
    </svg>
  );
}
