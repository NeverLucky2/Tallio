// src/CategoryBarList.jsx
import React from 'react';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

export default function CategoryBarList({ items }) {
  if (!items || items.length === 0) {
    return <p className="panel-empty">No expenses in this period</p>;
  }
  const max = Math.max(...items.map(i => i.total), 1);
  return (
    <div className="cat-list">
      {items.map(i => (
        <div key={i.categoryId || i.name}>
          <div className="cat-meta">
            <div className="cat-name">
              <span className="cat-icon" aria-hidden="true">{i.icon}</span>
              {i.name}
            </div>
            <span className="cat-amount" style={{ color: i.color }}>
              {money(i.total)} <span className="cat-pct">{Math.round(i.pct)}%</span>
            </span>
          </div>
          <div className="cat-track">
            <div className="cat-fill" style={{ width: `${(i.total / max) * 100}%`, background: i.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
