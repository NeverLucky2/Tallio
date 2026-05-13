import React, { useState, useMemo, useEffect, useRef } from 'react';
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

const formatCurrencyShort = (amount) => {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 10_000)    return `$${Math.round(amount / 1000)}K`;
  if (amount >= 1_000)     return `$${(amount / 1000).toFixed(1)}K`;
  return `$${Math.round(amount)}`;
};

const STACK_HEADROOM_PCT = 88; // leave room above bars for the total label

const VENDOR_COLOR_KEY = 'billtracker-vendor-colors';
const COLLAPSE_KEY = 'billtracker-chart-collapsed';

export default function SpendingChart({ bills, selectedMonth, onSelectMonth, categoriesById }) {
  const [vendorFilter, setVendorFilter] = useState(null); // null = all
  const [drillMonth, setDrillMonth] = useState(null);     // null = monthly view
  const previousMonthRef = useRef(null);                  // captured at first drill-in
  const [vendorColors, setVendorColors] = useState(() => {
    try {
      const saved = localStorage.getItem(VENDOR_COLOR_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(VENDOR_COLOR_KEY, JSON.stringify(vendorColors));
    } catch (e) {
      console.error('Failed to persist vendor colors:', e);
    }
  }, [vendorColors]);

  const [flow, setFlow] = useState('spent');
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? 'true' : 'false'); }
    catch (e) { console.error('Failed to persist chart collapsed state:', e); }
  }, [collapsed]);

  const resolveVendorColor = (vendor) => vendorColors[vendor] || getVendorColor(vendor);

  const windowEnd = new Date().toISOString().slice(0, 7);

  const vendors = useMemo(() => {
    const set = new Set();
    const window = new Set(getMonthWindow(windowEnd));
    for (const b of bills) {
      if (!b.vendor) continue;
      if (!window.has(b.month)) continue;
      const hasSpending = (b.items || []).some(i => {
        if (!Number.isFinite(i.amount) || i.amount <= 0) return false;
        const cat = categoriesById && categoriesById.get(i.categoryId);
        const flow = cat && cat.flow ? cat.flow : 'expense';
        return flow === 'expense';
      });
      if (hasSpending) set.add(b.vendor);
    }
    return Array.from(set).sort();
  }, [bills, windowEnd, categoriesById]);

  // If the selected vendor was deleted, treat as "All" without a setState call.
  const effectiveFilter = vendorFilter !== null && vendors.includes(vendorFilter) ? vendorFilter : null;

  const monthly = useMemo(
    () => aggregateByMonth(bills, windowEnd, categoriesById, effectiveFilter),
    [bills, windowEnd, categoriesById, effectiveFilter]
  );

  // If selectedMonth changes from outside (e.g. header toggle) while a drill is
  // active and out of sync, exit drill — bar/drill-nav clicks set both in the
  // same render so this won't fire for those.
  useEffect(() => {
    if (drillMonth !== null && drillMonth !== selectedMonth) {
      setDrillMonth(null);
      previousMonthRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const enterDrill = (month) => {
    if (flow !== 'spent') return; // drill-down is expense-only
    if (drillMonth === null) previousMonthRef.current = selectedMonth;
    setDrillMonth(month);
    if (onSelectMonth) onSelectMonth(month);
  };

  const exitDrill = () => {
    const restore = previousMonthRef.current;
    previousMonthRef.current = null;
    setDrillMonth(null);
    if (onSelectMonth && restore) onSelectMonth(restore);
  };

  const daily = useMemo(() => {
    if (!drillMonth) return null;
    return aggregateByDay(bills, drillMonth, categoriesById, effectiveFilter);
  }, [bills, drillMonth, categoriesById, effectiveFilter]);

  const isAll = effectiveFilter === null;

  const filteredTotal = useMemo(() => {
    if (drillMonth && daily) return daily.reduce((s, d) => s + d.spent, 0);
    return monthly.reduce((s, m) => s + m.spent, 0);
  }, [monthly, daily, drillMonth]);

  if (bills.length === 0) {
    return (
      <div className="spending-panel">
        <div className="spending-empty">Scan a bill to see your spending here.</div>
      </div>
    );
  }

  const renderFlowChips = () => (
    <div className="spending-chips flow-chips">
      {['spent', 'income', 'saved', 'net'].map(f => (
        <button
          key={f}
          className={`spending-chip flow-chip${flow === f ? ' active' : ''}`}
          onClick={() => { setFlow(f); setDrillMonth(null); setVendorFilter(null); }}
        >
          {f.charAt(0).toUpperCase() + f.slice(1)}
        </button>
      ))}
    </div>
  );

  const renderVendorChips = () => {
    if (flow !== 'spent') return null;
    return (
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
            className={`spending-chip${effectiveFilter === v ? ' active' : ''}`}
            onClick={() => setVendorFilter(v)}
            style={effectiveFilter === v ? { background: resolveVendorColor(v), color: '#0b0e16' } : null}
          >
            {v}
          </button>
        ))}
      </div>
    );
  };

  const renderLegend = () => {
    if (flow !== 'spent' || !isAll || vendors.length === 0) return null;
    return (
      <div className="spending-legend">
        {vendors.map(v => (
          <label key={v} className="spending-legend-item" title={`Click to recolor ${v}`}>
            <input
              type="color"
              value={resolveVendorColor(v)}
              onChange={(e) => setVendorColors(prev => ({ ...prev, [v]: e.target.value }))}
              className="spending-legend-color-input"
              aria-label={`Pick color for ${v}`}
            />
            <span className="spending-legend-swatch" style={{ background: resolveVendorColor(v) }} />
            {v}
          </label>
        ))}
      </div>
    );
  };

  const renderMonthlyBars = () => {
    if (effectiveFilter && monthly.every(m => m.spent === 0)) {
      return <div className="spending-empty">No spending recorded for {effectiveFilter}.</div>;
    }
    const value = (m) => {
      if (flow === 'income') return m.income;
      if (flow === 'saved')  return m.saved;
      if (flow === 'net')    return m.income - m.spent - m.saved;
      return m.spent;
    };
    const max = Math.max(...monthly.map(m => Math.abs(value(m))), 1);
    return (
      <div className="spending-bars">
        {monthly.map(m => {
          const v = value(m);
          const pct = (Math.abs(v) / max) * STACK_HEADROOM_PCT;
          const isCurrent = m.month === selectedMonth;
          return (
            <button
              key={m.month}
              className={`spending-bar${isCurrent ? ' current' : ''}`}
              onClick={() => enterDrill(m.month)}
              title={`${formatMonthLong(m.month)} — ${formatCurrency(value(m))}`}
            >
              <span className="spending-bar-total">{formatCurrencyShort(Math.abs(value(m)))}</span>
              <div className="spending-bar-stack" style={{ height: `${pct}%` }}>
                {flow === 'spent' && isAll ? renderStack(m) : (
                  <div
                    className="spending-bar-segment"
                    style={{
                      background:
                        flow === 'income' ? '#6BD49A'
                        : flow === 'saved' ? '#5B8DFF'
                        : flow === 'net'   ? '#D4A853'
                        : effectiveFilter ? resolveVendorColor(effectiveFilter)
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
      const segPct = bucket.spent > 0 ? (amount / bucket.spent) * 100 : 0;
      return (
        <div
          key={vendor}
          className="spending-bar-segment"
          style={{ background: resolveVendorColor(vendor), height: `${segPct}%` }}
        />
      );
    });
  };

  const months = getMonthWindow(windowEnd);
  const drillIdx = drillMonth ? months.indexOf(drillMonth) : -1;
  const canPrev = drillIdx > 0;
  const canNext = drillIdx >= 0 && drillIdx < months.length - 1;

  const drillNavTo = (month) => {
    setDrillMonth(month);
    if (onSelectMonth) onSelectMonth(month);
  };

  const renderDailyBars = () => {
    const max = Math.max(...daily.map(d => d.spent), 1);
    if (daily.every(d => d.spent === 0)) {
      return <div className="spending-empty">No spending recorded for {formatMonthLong(drillMonth)}.</div>;
    }
    return (
      <div className="spending-bars spending-bars-daily">
        {daily.map(d => {
          const pct = (d.spent / max) * STACK_HEADROOM_PCT;
          return (
            <div
              key={d.day}
              className="spending-bar"
              title={`${formatMonthLong(drillMonth)} ${d.day} — ${formatCurrency(d.spent)}`}
            >
              <div className="spending-bar-stack" style={{ height: `${pct}%` }}>
                {isAll ? renderStack(d) : (
                  <div
                    className="spending-bar-segment"
                    style={{
                      background: effectiveFilter
                        ? resolveVendorColor(effectiveFilter)
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
      <button className="spending-back" onClick={exitDrill} aria-label="Back to monthly">
        ← Back
      </button>
      <div className="spending-drill-nav">
        <button
          className="spending-back"
          onClick={() => canPrev && drillNavTo(months[drillIdx - 1])}
          disabled={!canPrev}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="spending-drill-month">{formatMonthLong(drillMonth)}</span>
        <button
          className="spending-back"
          onClick={() => canNext && drillNavTo(months[drillIdx + 1])}
          disabled={!canNext}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <span /> {/* spacer for alignment */}
    </div>
  );

  const totalLabel = effectiveFilter ? effectiveFilter : 'All cards';

  return (
    <div className="spending-panel">
      <div className="spending-header">
        <h2 className="spending-title">Spending</h2>
        <button
          type="button"
          className="spending-collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand chart' : 'Collapse chart'}
          aria-expanded={!collapsed}
        >
          {collapsed ? '▾' : '▴'}
        </button>
        <div>
          <span className="spending-total-label">{totalLabel}</span>
          <span className="spending-total">{formatCurrency(filteredTotal)}</span>
        </div>
      </div>
      {!collapsed && (
        <>
          {renderFlowChips()}
          {renderVendorChips()}
          {renderLegend()}
          {drillMonth ? (
            <>
              {renderDailyHeader()}
              {renderDailyBars()}
            </>
          ) : (
            renderMonthlyBars()
          )}
        </>
      )}
    </div>
  );
}
