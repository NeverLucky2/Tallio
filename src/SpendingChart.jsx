import React, { useState, useMemo } from 'react';
import {
  aggregateByMonth,
  aggregateByDay,
  getVendorColor,
  getMonthWindow,
} from './spendingMath.js';

const formatMonthShort = (month) => {
  const [y, m] = month.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
};

const formatMonthLong = (month) => {
  const [y, m] = month.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
}).format(amount);

export default function SpendingChart({ bills }) {
  const [vendorFilter, setVendorFilter] = useState(null); // null = all
  const [drillMonth, setDrillMonth] = useState(null);     // null = monthly view

  const vendors = useMemo(() => {
    const set = new Set();
    for (const b of bills) if (b.vendor) set.add(b.vendor);
    return Array.from(set).sort();
  }, [bills]);

  const currentMonthKey = new Date().toISOString().slice(0, 7);

  const monthly = useMemo(
    () => aggregateByMonth(bills, currentMonthKey, vendorFilter),
    [bills, currentMonthKey, vendorFilter]
  );

  const daily = useMemo(() => {
    if (!drillMonth) return null;
    return aggregateByDay(bills, drillMonth, vendorFilter);
  }, [bills, drillMonth, vendorFilter]);

  const isAll = vendorFilter === null;

  if (bills.length === 0) {
    return (
      <div className="spending-panel">
        <div className="spending-empty">Scan a bill to see your spending here.</div>
      </div>
    );
  }

  const renderChips = () => (
    <div className="spending-chips">
      <button
        className={`spending-chip${isAll ? ' active' : ''}`}
        onClick={() => setVendorFilter(null)}
      >
        All
      </button>
      {vendors.map(v => (
        <button
          key={v}
          className={`spending-chip${vendorFilter === v ? ' active' : ''}`}
          onClick={() => setVendorFilter(v)}
          style={vendorFilter === v ? { background: getVendorColor(v), color: '#0b0e16' } : null}
        >
          {v}
        </button>
      ))}
    </div>
  );

  const renderLegend = () => {
    if (!isAll || vendors.length === 0) return null;
    return (
      <div className="spending-legend">
        {vendors.map(v => (
          <span key={v} className="spending-legend-item">
            <span className="spending-legend-swatch" style={{ background: getVendorColor(v) }} />
            {v}
          </span>
        ))}
      </div>
    );
  };

  const renderMonthlyBars = () => {
    const max = Math.max(...monthly.map(m => m.total), 1);
    return (
      <div className="spending-bars">
        {monthly.map(m => {
          const pct = (m.total / max) * 100;
          const isCurrent = m.month === currentMonthKey;
          return (
            <button
              key={m.month}
              className={`spending-bar${isCurrent ? ' current' : ''}`}
              onClick={() => setDrillMonth(m.month)}
              title={`${formatMonthLong(m.month)} — ${formatCurrency(m.total)}`}
            >
              <div className="spending-bar-stack" style={{ height: `${pct}%` }}>
                {isAll ? renderStack(m) : (
                  <div
                    className="spending-bar-segment"
                    style={{
                      background: vendorFilter
                        ? getVendorColor(vendorFilter)
                        : '#5b8dff',
                      height: '100%',
                    }}
                  />
                )}
              </div>
              <span className="spending-bar-label">{formatMonthShort(m.month)}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderStack = (bucket) => {
    const sorted = Object.entries(bucket.byVendor).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([vendor, amount]) => {
      const segPct = bucket.total > 0 ? (amount / bucket.total) * 100 : 0;
      return (
        <div
          key={vendor}
          className="spending-bar-segment"
          style={{ background: getVendorColor(vendor), height: `${segPct}%` }}
        />
      );
    });
  };

  const months = getMonthWindow(currentMonthKey);
  const drillIdx = drillMonth ? months.indexOf(drillMonth) : -1;
  const canPrev = drillIdx > 0;
  const canNext = drillIdx >= 0 && drillIdx < months.length - 1;

  const renderDailyBars = () => {
    const max = Math.max(...daily.map(d => d.total), 1);
    if (daily.every(d => d.total === 0)) {
      return <div className="spending-empty">No spending recorded for {formatMonthLong(drillMonth)}.</div>;
    }
    return (
      <div className="spending-bars spending-bars-daily">
        {daily.map(d => {
          const pct = (d.total / max) * 100;
          return (
            <div
              key={d.day}
              className="spending-bar"
              title={`${formatMonthLong(drillMonth)} ${d.day} — ${formatCurrency(d.total)}`}
            >
              <div className="spending-bar-stack" style={{ height: `${pct}%` }}>
                {isAll ? renderStack(d) : (
                  <div
                    className="spending-bar-segment"
                    style={{
                      background: vendorFilter
                        ? getVendorColor(vendorFilter)
                        : '#5b8dff',
                      height: '100%',
                    }}
                  />
                )}
              </div>
              {(d.day === 1 || d.day % 7 === 0 || d.day === daily.length) && (
                <span className="spending-bar-label">{d.day}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderDailyHeader = () => (
    <div className="spending-drill-header">
      <button className="spending-back" onClick={() => setDrillMonth(null)} aria-label="Back to monthly">
        ← Back
      </button>
      <div className="spending-drill-nav">
        <button
          className="spending-back"
          onClick={() => canPrev && setDrillMonth(months[drillIdx - 1])}
          disabled={!canPrev}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="spending-drill-month">{formatMonthLong(drillMonth)}</span>
        <button
          className="spending-back"
          onClick={() => canNext && setDrillMonth(months[drillIdx + 1])}
          disabled={!canNext}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <span /> {/* spacer for alignment */}
    </div>
  );

  return (
    <div className="spending-panel">
      <div className="spending-header">
        <h2 className="spending-title">Spending</h2>
      </div>
      {renderChips()}
      {renderLegend()}
      {drillMonth ? (
        <>
          {renderDailyHeader()}
          {renderDailyBars()}
        </>
      ) : (
        renderMonthlyBars()
      )}
    </div>
  );
}
