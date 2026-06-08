// src/CategoryBarList.jsx
import React, { useState } from 'react';
import Icon from './Icon.jsx';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

export default function CategoryBarList({ items }) {
  const [expanded, setExpanded] = useState(() => new Set());
  if (!items || items.length === 0) {
    return <p className="panel-empty">No expenses in this period</p>;
  }
  const max = Math.max(...items.map(i => i.total), 1);
  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <div className="cat-list">
      {items.map(i => {
        const hasSubs = Array.isArray(i.subs) && i.subs.length > 0;
        const open = expanded.has(i.categoryId);
        return (
          <div key={i.categoryId || i.name}>
            <div className="cat-meta">
              <div className="cat-name">
                {hasSubs && (
                  <button
                    type="button"
                    className={`cat-chevron${open ? ' open' : ''}`}
                    aria-expanded={open}
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${i.name} sub-categories`}
                    onClick={() => toggle(i.categoryId)}
                  >▸</button>
                )}
                <Icon value={i.icon} className="cat-icon" />
                {i.name}
              </div>
              <span className="cat-amount" style={{ color: i.color }}>
                {money(i.total)} <span className="cat-pct">{Math.round(i.pct)}%</span>
              </span>
            </div>
            <div className="cat-track">
              <div className="cat-fill" style={{ width: `${(i.total / max) * 100}%`, background: i.color }} />
            </div>
            {hasSubs && open && (
              <div className="cat-sub-list">
                {i.subs.map(s => (
                  <div key={s.subId == null ? '__nosub' : s.subId} className={`cat-sub-row${s.subId == null ? ' is-nosub' : ''}`}>
                    <div className="cat-sub-meta">
                      <span className="cat-sub-name">{s.name}</span>
                      <span className="cat-sub-amount">{money(s.total)}</span>
                    </div>
                    <div className="cat-sub-track">
                      <div className="cat-sub-fill" style={{ width: `${i.total > 0 ? (s.total / i.total) * 100 : 0}%`, background: i.color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
