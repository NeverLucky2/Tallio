// src/PeriodControl.jsx
import React from 'react';

const PRESETS = [
  ['this-month', 'This month'],
  ['last-3-months', 'Last 3 months'],
  ['this-year', 'This year'],
  ['last-12-months', 'Last 12 months'],
  ['all-time', 'All time'],
  ['custom', 'Custom'],
];

export default function PeriodControl({ period, onChange }) {
  const preset = (period && period.preset) || 'last-12-months';
  const set = (patch) => onChange({ ...period, ...patch });
  return (
    <div className="period-control">
      <div className="period-chips">
        {PRESETS.map(([value, label]) => (
          <button key={value} type="button"
            className={`period-chip${preset === value ? ' period-chip-active' : ''}`}
            aria-pressed={preset === value}
            onClick={() => set({ preset: value })}>
            {label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="period-custom">
          <label className="period-date">From <input type="date" className="input"
            value={(period && period.customStart) || ''} onChange={(e) => set({ customStart: e.target.value })} /></label>
          <label className="period-date">To <input type="date" className="input"
            value={(period && period.customEnd) || ''} onChange={(e) => set({ customEnd: e.target.value })} /></label>
        </div>
      )}
    </div>
  );
}
